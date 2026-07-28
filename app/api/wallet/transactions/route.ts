import { db } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { fromBaseUnits } from "@/lib/bankroll";
import { houseConfig } from "@/lib/house";
import { custodyRuntimeConfig } from "@/lib/custody/config";

export const dynamic = "force-dynamic";

/** How each custody action reads to the player. */
const CUSTODY_LABELS: Record<string, string> = {
  deposit_confirmed: "Collateral received",
  collateral_sold: "Collateral processed",
  advance_sent: "Advance sent to your wallet",
  advance_repaid: "Advance repaid",
  collateral_repurchased: "Collateral reacquired",
  collateral_claimed: "Collateral returned to your wallet",
};

/**
 * One feed of every on-chain money movement for the signed-in player: SOL
 * deposits, withdrawals, and each step of a lending position. Signatures come
 * back so the client can link every row to Solscan.
 */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const house = houseConfig();
    const custody = custodyRuntimeConfig();

    const [deposits, withdrawals, custodyEvents] = await Promise.all([
      db().query(
        `SELECT signature, amount_raw::text AS amount_raw, created_at
         FROM house_deposits WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [identity.userId],
      ),
      db().query(
        `SELECT id, signature, amount_raw::text AS amount_raw, status,
                failure_reason, destination, created_at
         FROM withdrawals WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [identity.userId],
      ),
      // Decimals live on the position, except for the USDC legs, which are
      // denominated in the settlement asset rather than the collateral.
      db().query(
        `SELECT e.position_id, e.action, e.signature, e.asset_symbol,
                e.mint_address, e.raw_amount::text AS raw_amount, e.created_at,
                CASE WHEN e.mint_address = $2 THEN $3::int
                     ELSE COALESCE(p.collateral_decimals, 0) END AS decimals
         FROM custody_events e
         LEFT JOIN custody_positions p ON p.id = e.position_id
         WHERE e.user_id = $1
         ORDER BY e.created_at DESC LIMIT 100`,
        [identity.userId, custody.usdcMint, custody.usdcDecimals],
      ),
    ]);

    const rows = [
      ...deposits.rows.map((row) => ({
        id: `deposit:${row.signature}`,
        kind: "deposit" as const,
        label: "Deposit",
        detail: "Credited to your play balance",
        amount: fromBaseUnits(BigInt(row.amount_raw), house.decimals),
        symbol: house.symbol,
        signature: row.signature as string | null,
        status: "confirmed",
        createdAt: row.created_at,
      })),
      ...withdrawals.rows.map((row) => ({
        id: `withdrawal:${row.id}`,
        kind: "withdrawal" as const,
        label: "Withdrawal",
        detail: row.status === "sent"
          ? "Sent to your wallet"
          : row.status === "rejected" || row.status === "failed"
            ? "Did not send — your balance was returned"
            : "In progress",
        amount: fromBaseUnits(BigInt(row.amount_raw), house.decimals),
        symbol: house.symbol,
        signature: row.signature as string | null,
        status: row.status as string,
        createdAt: row.created_at,
      })),
      ...custodyEvents.rows.map((row) => ({
        id: `custody:${row.action}:${row.position_id}:${row.created_at}`,
        kind: "lending" as const,
        label: CUSTODY_LABELS[row.action as string]
          ?? String(row.action).replaceAll("_", " "),
        detail: "Lending position",
        amount: fromBaseUnits(BigInt(row.raw_amount || "0"), Number(row.decimals ?? 0)),
        symbol: row.asset_symbol as string,
        // Simulated swap legs carry a placeholder, not a real transaction.
        signature: typeof row.signature === "string" && !row.signature.startsWith("simulated-")
          ? row.signature
          : null,
        status: "confirmed",
        createdAt: row.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return json({ network: custody.network, transactions: rows.slice(0, 100) }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: "Unable to load your transactions" }, 400);
  }
}
