import { transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { verifiedWallet } from "@/lib/custody/database";
import { creditDeposit, fromBaseUnits, availableBalance } from "@/lib/bankroll";
import { houseConfig, houseReadiness } from "@/lib/house";
import { verifyIncomingSol } from "@/lib/house-solana";

export const dynamic = "force-dynamic";

function positiveRaw(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) return null;
  const amount = BigInt(value);
  return amount <= 18_446_744_073_709_551_615n ? amount : null;
}

/**
 * Credit a deposit the player has already sent on-chain.
 *
 * The client tells us a signature; nothing is trusted beyond that. The chain is
 * the source of truth for who sent what, and house_deposits keys on the
 * signature so a replayed confirmation credits nothing twice.
 */
export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const config = houseConfig();
    const readiness = houseReadiness(config);
    if (!readiness.ready || !config.wallet) {
      return json({ error: "The cashier is closed", checks: readiness.checks }, 503, identity);
    }
    if (config.mint) {
      return json({ error: "Token deposits are not enabled on this table" }, 503, identity);
    }

    const wallet = await verifiedWallet(identity.userId);
    if (!wallet) return json({ error: "Verify your Solana wallet first" }, 403, identity);

    const body = await request.json() as { signature?: unknown; rawAmount?: unknown };
    const amountRaw = positiveRaw(body.rawAmount);
    if (!amountRaw || typeof body.signature !== "string" || body.signature.length > 96) {
      return json({ error: "Invalid deposit confirmation" }, 400, identity);
    }

    // Verify against the finalized chain before any ledger write.
    const settlement = await verifyIncomingSol({
      signature: body.signature,
      owner: wallet,
      destination: config.wallet,
      lamports: amountRaw,
    });

    const result = await transaction(async (client) => {
      const claimed = await client.query(
        `INSERT INTO house_deposits (signature, user_id, wallet_address, amount_raw, slot)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (signature) DO NOTHING`,
        [body.signature, identity.userId, wallet, amountRaw.toString(), settlement.slot],
      );
      // Already credited on an earlier call — report the balance, change nothing.
      if (!claimed.rowCount) {
        return { credited: false, balanceRaw: await availableBalance(client, identity.userId) };
      }
      await creditDeposit(client, {
        userId: identity.userId,
        amountRaw,
        signature: body.signature as string,
        metadata: { slot: settlement.slot, wallet },
      });
      return { credited: true, balanceRaw: await availableBalance(client, identity.userId) };
    });

    return json({
      credited: result.credited,
      balanceRaw: result.balanceRaw.toString(),
      balance: fromBaseUnits(result.balanceRaw, config.decimals),
      symbol: config.symbol,
      signature: body.signature,
    }, result.credited ? 201 : 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to credit deposit" }, 400);
  }
}
