import type { PoolClient } from "pg";
import { db } from "@/lib/db";

export async function verifiedWallet(userId: string) {
  const result = await db().query(
    `SELECT wallet_address FROM users
     WHERE id = $1 AND wallet_verified_at IS NOT NULL`,
    [userId],
  );
  return result.rows[0]?.wallet_address as string | undefined;
}

export async function recordCustodyEvent(
  client: PoolClient,
  input: {
    positionId: string;
    userId: string;
    eventKey: string;
    action: string;
    signature?: string | null;
    symbol: string;
    mint: string;
    rawAmount: bigint;
    payload?: Record<string, unknown>;
  },
) {
  await client.query(
    `INSERT INTO custody_events
     (id, position_id, user_id, event_key, action, signature, asset_symbol, mint_address, raw_amount, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (event_key) DO NOTHING`,
    [
      crypto.randomUUID(),
      input.positionId,
      input.userId,
      input.eventKey,
      input.action,
      input.signature ?? null,
      input.symbol,
      input.mint,
      input.rawAmount.toString(),
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

export function positionJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    symbol: row.collateral_symbol,
    mint: row.collateral_mint,
    decimals: row.collateral_decimals,
    collateralRaw: String(row.collateral_raw),
    saleProceedsRaw: row.sale_proceeds_raw === null ? null : String(row.sale_proceeds_raw),
    advanceRaw: row.advance_raw === null ? null : String(row.advance_raw),
    reserveRaw: row.reserve_raw === null ? null : String(row.reserve_raw),
    repaidRaw: String(row.repaid_raw),
    repurchaseCostRaw: row.repurchase_cost_raw === null ? null : String(row.repurchase_cost_raw),
    repurchasedRaw: row.repurchased_raw === null ? null : String(row.repurchased_raw),
    status: row.status,
    depositSignature: row.deposit_signature,
    sellSignature: row.sell_signature,
    advanceSignature: row.advance_signature,
    repaySignature: row.repay_signature,
    buySignature: row.buy_signature,
    claimSignature: row.claim_signature,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

