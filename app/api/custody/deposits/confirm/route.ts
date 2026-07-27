import { db, transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { custodyRuntimeConfig } from "@/lib/custody/config";
import { positionJson, recordCustodyEvent, verifiedWallet } from "@/lib/custody/database";
import { maybeProxyCustody } from "@/lib/custody/proxy";
import { sendCustodyTokenTransfer, verifyIncomingTransfer } from "@/lib/custody/solana";
import { sellCollateral } from "@/lib/custody/swap";

export const dynamic = "force-dynamic";

function positiveRaw(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) return null;
  const amount = BigInt(value);
  return amount <= 18_446_744_073_709_551_615n ? amount : null;
}

export async function POST(request: Request) {
  const proxied = await maybeProxyCustody(request);
  if (proxied) return proxied;
  try {
    const identity = await requireIdentity(request);
    const wallet = await verifiedWallet(identity.userId);
    const config = custodyRuntimeConfig();
    if (!config.enabled || !config.custodyAddress || !config.market?.enabled) {
      return json({ error: "Custody deposits are launch-gated" }, 503, identity);
    }
    const body = await request.json() as { signature?: unknown; rawAmount?: unknown };
    const amount = positiveRaw(body.rawAmount);
    if (!amount || typeof body.signature !== "string" || body.signature.length > 96) {
      return json({ error: "Invalid custody deposit confirmation" }, 400, identity);
    }
    const depositSignature = body.signature;
    if (!wallet) return json({ error: "Verify your Solana wallet first" }, 403, identity);
    if (amount > config.market.maxPositionRaw) {
      return json({ error: "Deposit exceeds the configured per-position limit" }, 400, identity);
    }
    const settlement = await verifyIncomingTransfer({
      signature: depositSignature,
      owner: wallet,
      destinationOwner: config.custodyAddress,
      mint: config.market.mint,
      amount,
      decimals: config.market.decimals,
      tokenProgram: config.market.tokenProgram,
    });
    const claimed = await transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`custody-liability:${config.market!.mint}`],
      );
      const liabilities = await client.query(
        `SELECT COALESCE(SUM(collateral_raw), 0)::text AS total
         FROM custody_positions
         WHERE collateral_mint = $1 AND status <> 'claimed' AND deposit_signature <> $2`,
        [config.market!.mint, depositSignature],
      );
      if (BigInt(liabilities.rows[0].total) + amount > config.market!.maxActiveLiabilityRaw) {
        throw new Error("Custody market active-liability limit reached");
      }
      const inserted = await client.query(
        `INSERT INTO custody_positions
         (id, user_id, wallet_address, collateral_symbol, collateral_mint,
          collateral_decimals, collateral_raw, status, deposit_signature, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'selling', $8, $9::jsonb)
         ON CONFLICT (deposit_signature) DO NOTHING RETURNING *`,
        [
          crypto.randomUUID(),
          identity.userId,
          wallet,
          config.market?.symbol,
          config.market?.mint,
          config.market?.decimals,
          amount.toString(),
          depositSignature,
          JSON.stringify({
            depositSlot: settlement.slot,
            depositBlockTime: settlement.blockTime,
            depositSource: settlement.source,
            depositDestination: settlement.destination,
          }),
        ],
      );
      if (!inserted.rowCount) return null;
      const row = inserted.rows[0];
      await recordCustodyEvent(client, {
        positionId: row.id,
        userId: identity.userId,
        eventKey: `custody:deposit:${depositSignature}`,
        action: "deposit_confirmed",
        signature: depositSignature,
        symbol: config.market!.symbol,
        mint: config.market!.mint,
        rawAmount: amount,
      });
      return row;
    });
    if (!claimed) {
      const existing = await db().query(
        "SELECT * FROM custody_positions WHERE deposit_signature = $1 AND user_id = $2",
        [depositSignature, identity.userId],
      );
      return json({ position: existing.rowCount ? positionJson(existing.rows[0]) : null, duplicate: true }, 200, identity);
    }

    try {
      const sale = await sellCollateral({ market: config.market, collateralRaw: amount });
      if (sale.outputAmount <= 0n) throw new Error("Collateral sale returned no settlement value");
      const advance = sale.outputAmount * BigInt(config.market.advanceBps) / 10_000n;
      const reserve = sale.outputAmount - advance;
      if (advance <= 0n) throw new Error("Calculated advance is below one settlement unit");
      await transaction(async (client) => {
        await client.query(
          `UPDATE custody_positions
           SET sale_proceeds_raw = $2, advance_raw = $3, reserve_raw = $4,
               sell_signature = $5, status = 'advancing', updated_at = NOW()
           WHERE id = $1`,
          [claimed.id, sale.outputAmount.toString(), advance.toString(), reserve.toString(), sale.signature],
        );
        await recordCustodyEvent(client, {
          positionId: claimed.id,
          userId: identity.userId,
          eventKey: `custody:sell:${claimed.id}`,
          action: "collateral_sold",
          signature: sale.signature,
          symbol: config.market!.symbol,
          mint: config.market!.mint,
          rawAmount: amount,
          payload: {
            outputRaw: sale.outputAmount.toString(),
            router: sale.router,
            feeBps: sale.feeBps,
            feeMint: sale.feeMint,
          },
        });
      });
      const advanceSignature = await sendCustodyTokenTransfer({
        destinationOwner: wallet,
        mint: config.usdcMint,
        amount: advance,
        decimals: config.usdcDecimals,
        tokenProgram: config.usdcTokenProgram,
      });
      const completed = await transaction(async (client) => {
        const updated = await client.query(
          `UPDATE custody_positions
           SET advance_signature = $2, status = 'open', updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [claimed.id, advanceSignature],
        );
        await recordCustodyEvent(client, {
          positionId: claimed.id,
          userId: identity.userId,
          eventKey: `custody:advance:${claimed.id}`,
          action: "advance_sent",
          signature: advanceSignature,
          symbol: "USDC",
          mint: config.usdcMint,
          rawAmount: advance,
        });
        return updated.rows[0];
      });
      return json({ position: positionJson(completed) }, 201, identity);
    } catch (error) {
    if (isAuthRequired(error)) return authRequired();
      const message = error instanceof Error ? error.message : "Custody sale failed";
      await db().query(
        `UPDATE custody_positions
         SET status = 'operator-review', failure_reason = $2, updated_at = NOW()
         WHERE id = $1`,
        [claimed.id, message.slice(0, 240)],
      );
      return json({
        error: "Deposit is secured in custody but automated settlement requires operator review",
        positionId: claimed.id,
      }, 503, identity);
    }
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to confirm custody deposit" }, 400);
  }
}
