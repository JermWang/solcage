import { db, transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { custodyRuntimeConfig } from "@/lib/custody/config";
import { positionJson, recordCustodyEvent, verifiedWallet } from "@/lib/custody/database";
import { maybeProxyCustody } from "@/lib/custody/proxy";
import { sendCustodyTokenTransfer } from "@/lib/custody/solana";
import { buyCollateral } from "@/lib/custody/swap";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const proxied = await maybeProxyCustody(request);
  if (proxied) return proxied;
  try {
    const identity = await requireIdentity(request);
    const wallet = await verifiedWallet(identity.userId);
    const config = custodyRuntimeConfig();
    if (!config.enabled || !config.custodyAddress || config.markets.length === 0 || !wallet) {
      return json({ error: "Custody claims are launch-gated" }, 503, identity);
    }
    const body = await request.json() as { positionId?: unknown };
    if (typeof body.positionId !== "string") {
      return json({ error: "Invalid custody claim" }, 400, identity);
    }
    const found = await db().query(
      `SELECT * FROM custody_positions
       WHERE id = $1 AND user_id = $2 AND status IN ('repaid', 'repurchased')`,
      [body.positionId, identity.userId],
    );
    if (!found.rowCount) return json({ error: "Repaid custody position not found" }, 404, identity);
    let position = found.rows[0];
    // Use the market this position is actually held in, not the default one —
    // buying BONK back on WIF's terms would settle the wrong asset. Matched
    // across all configured markets, not just enabled ones, so a market that is
    // later switched off can still be claimed out by whoever is still in it.
    const market = config.markets.find((entry) => entry.mint === position.collateral_mint);
    if (!market) {
      return json({ error: "This position's collateral is no longer configured" }, 409, identity);
    }
    if (position.status === "repaid") {
      const locked = await db().query(
        `UPDATE custody_positions SET status = 'claiming', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'repaid' RETURNING *`,
        [body.positionId, identity.userId],
      );
      if (!locked.rowCount) return json({ error: "Claim is already processing" }, 409, identity);
      position = locked.rows[0];
      try {
        const available = BigInt(position.reserve_raw) + BigInt(position.repaid_raw);
        const buy = await buyCollateral({
          market,
          targetCollateralRaw: BigInt(position.collateral_raw),
          maximumUsdcRaw: available,
        });
        position = await transaction(async (client) => {
          const updated = await client.query(
            `UPDATE custody_positions
             SET repurchase_cost_raw = $2, repurchased_raw = $3, buy_signature = $4,
                 status = 'repurchased', failure_reason = NULL, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [position.id, buy.inputAmount.toString(), buy.outputAmount.toString(), buy.signature],
          );
          await recordCustodyEvent(client, {
            positionId: position.id,
            userId: identity.userId,
            eventKey: `custody:buy:${position.id}`,
            action: "collateral_repurchased",
            signature: buy.signature,
            symbol: market.symbol,
            mint: market.mint,
            rawAmount: buy.outputAmount,
            payload: {
              inputUsdcRaw: buy.inputAmount.toString(),
              router: buy.router,
              feeBps: buy.feeBps,
              feeMint: buy.feeMint,
            },
          });
          return updated.rows[0];
        });
      } catch (error) {
    if (isAuthRequired(error)) return authRequired();
        const message = error instanceof Error ? error.message : "Buyback failed";
        await db().query(
          `UPDATE custody_positions
           SET status = 'repaid', failure_reason = $2, updated_at = NOW()
           WHERE id = $1`,
          [position.id, message.slice(0, 240)],
        );
        return json({ error: message }, 409, identity);
      }
    }
    const claimSignature = await sendCustodyTokenTransfer({
      destinationOwner: wallet,
      mint: position.collateral_mint,
      amount: BigInt(position.collateral_raw),
      decimals: position.collateral_decimals,
      tokenProgram: market.tokenProgram,
    });
    const completed = await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE custody_positions
         SET claim_signature = $2, status = 'claimed', updated_at = NOW()
         WHERE id = $1 AND status = 'repurchased' RETURNING *`,
        [position.id, claimSignature],
      );
      if (!updated.rowCount) throw new Error("Position is not ready to claim");
      await recordCustodyEvent(client, {
        positionId: position.id,
        userId: identity.userId,
        eventKey: `custody:claim:${position.id}`,
        action: "collateral_claimed",
        signature: claimSignature,
        symbol: position.collateral_symbol,
        mint: position.collateral_mint,
        rawAmount: BigInt(position.collateral_raw),
      });
      return updated.rows[0];
    });
    return json({ position: positionJson(completed) }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to complete custody claim" }, 400);
  }
}
