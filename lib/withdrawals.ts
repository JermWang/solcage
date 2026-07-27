import { db, transaction } from "./db";
import {
  InsufficientFunds,
  lockWithdrawal,
  refundWithdrawal,
  settleWithdrawalSent,
} from "./bankroll";
import { houseConfig } from "./house";
import { sendHouseSol } from "./house-solana";

/**
 * Withdrawal lifecycle:
 *   requested -> (approved | pending_review) -> sending -> sent
 *                                            -> rejected | failed
 *
 * Funds are locked out of the spendable balance at request time, not at send,
 * so a pending withdrawal cannot be wagered while it is in flight. Every exit
 * that is not `sent` refunds the lock.
 */

function envRaw(name: string, fallback: bigint) {
  const value = process.env[name];
  return value && /^\d+$/.test(value) ? BigInt(value) : fallback;
}

/** Above this, a human approves it. */
function reviewThresholdRaw() {
  return envRaw("SOLCAGE_WITHDRAWAL_REVIEW_RAW", 1_000_000_000n); // 1 SOL
}

function dailyMaxRaw() {
  return envRaw("SOLCAGE_WITHDRAWAL_DAILY_MAX_RAW", 5_000_000_000n); // 5 SOL
}

function dailyMaxCount() {
  const value = Number(process.env.SOLCAGE_WITHDRAWAL_DAILY_MAX_COUNT ?? "10");
  return Number.isInteger(value) && value > 0 ? value : 10;
}

export type WithdrawalRequest = {
  id: string;
  status: "approved" | "pending_review";
  amountRaw: bigint;
  destination: string;
  requiresReview: boolean;
};

export async function requestWithdrawal(input: {
  userId: string;
  destination: string;
  amountRaw: bigint;
}): Promise<WithdrawalRequest> {
  if (input.amountRaw <= 0n) throw new Error("Amount must be positive");

  return transaction(async (client) => {
    // Refuse a second identical request while one is still in flight.
    const duplicate = await client.query(
      `SELECT id FROM withdrawals
       WHERE user_id = $1 AND destination = $2 AND amount_raw = $3
         AND status IN ('approved', 'pending_review', 'sending')`,
      [input.userId, input.destination, input.amountRaw.toString()],
    );
    if (duplicate.rowCount) throw new Error("An identical withdrawal is already in progress");

    // Velocity over a rolling day. Exceeding it forces review rather than
    // blocking the player outright.
    const recent = await client.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_raw), 0)::text AS total
       FROM withdrawals
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
         AND status NOT IN ('rejected', 'failed')`,
      [input.userId],
    );
    const count = recent.rows[0].count as number;
    const total = BigInt(recent.rows[0].total) + input.amountRaw;
    const overVelocity = count >= dailyMaxCount() || total > dailyMaxRaw();
    const requiresReview = input.amountRaw >= reviewThresholdRaw() || overVelocity;

    const id = crypto.randomUUID();
    // Throws InsufficientFunds if the player cannot cover it.
    await lockWithdrawal(client, {
      userId: input.userId,
      amountRaw: input.amountRaw,
      correlationId: `withdrawal-lock:${id}`,
    });

    await client.query(
      `INSERT INTO withdrawals (id, user_id, destination, amount_raw, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, input.userId, input.destination, input.amountRaw.toString(),
        requiresReview ? "pending_review" : "approved"],
    );

    return {
      id,
      status: requiresReview ? "pending_review" as const : "approved" as const,
      amountRaw: input.amountRaw,
      destination: input.destination,
      requiresReview,
    };
  });
}

/**
 * Broadcast an approved withdrawal.
 *
 * The row is claimed approved -> sending in one statement, so only the caller
 * that flips it proceeds. A row left in `sending` is deliberately NOT retried:
 * a transaction that timed out may still have landed, and Solana gives no
 * idempotency key to make a second attempt safe. Those rows are surfaced for
 * manual reconciliation instead.
 */
export async function sendApprovedWithdrawal(withdrawalId: string) {
  const claim = await db().query(
    `UPDATE withdrawals SET status = 'sending', updated_at = NOW()
     WHERE id = $1 AND status = 'approved'
     RETURNING user_id, destination, amount_raw`,
    [withdrawalId],
  );
  if (!claim.rowCount) return { sent: false, reason: "not claimable" as const };

  const row = claim.rows[0];
  const amountRaw = BigInt(row.amount_raw);

  let signature: string;
  try {
    const sent = await sendHouseSol({ destination: row.destination, lamports: amountRaw });
    signature = sent.signature;
  } catch (error) {
    await failWithdrawal(withdrawalId, error instanceof Error ? error.message : "send failed");
    throw error;
  }

  await transaction(async (client) => {
    await settleWithdrawalSent(client, {
      userId: row.user_id,
      amountRaw,
      correlationId: `withdrawal-sent:${withdrawalId}`,
      metadata: { signature },
    });
    await client.query(
      "UPDATE withdrawals SET status = 'sent', signature = $2, updated_at = NOW() WHERE id = $1",
      [withdrawalId, signature],
    );
  });

  return { sent: true as const, signature };
}

/** Refund the lock and mark the row failed. Never called once `sent`. */
async function failWithdrawal(withdrawalId: string, reason: string) {
  await transaction(async (client) => {
    const found = await client.query(
      "SELECT user_id, amount_raw, status FROM withdrawals WHERE id = $1",
      [withdrawalId],
    );
    if (!found.rowCount) return;
    const row = found.rows[0];
    if (row.status !== "sent") {
      await refundWithdrawal(client, {
        userId: row.user_id,
        amountRaw: BigInt(row.amount_raw),
        correlationId: `withdrawal-refund:${withdrawalId}`,
      });
    }
    await client.query(
      "UPDATE withdrawals SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE id = $1",
      [withdrawalId, reason.slice(0, 240)],
    );
  });
}

export async function rejectWithdrawal(withdrawalId: string, note: string) {
  await transaction(async (client) => {
    const found = await client.query(
      "SELECT user_id, amount_raw, status FROM withdrawals WHERE id = $1 FOR UPDATE",
      [withdrawalId],
    );
    if (!found.rowCount) throw new Error("Withdrawal not found");
    const row = found.rows[0];
    if (row.status === "sent") throw new Error("Cannot reject a sent withdrawal");
    await refundWithdrawal(client, {
      userId: row.user_id,
      amountRaw: BigInt(row.amount_raw),
      correlationId: `withdrawal-refund:${withdrawalId}`,
    });
    await client.query(
      "UPDATE withdrawals SET status = 'rejected', failure_reason = $2, updated_at = NOW() WHERE id = $1",
      [withdrawalId, note.slice(0, 240)],
    );
  });
}

export { InsufficientFunds };
export const withdrawalLimits = () => ({
  reviewThresholdRaw: reviewThresholdRaw(),
  dailyMaxRaw: dailyMaxRaw(),
  dailyMaxCount: dailyMaxCount(),
  decimals: houseConfig().decimals,
});
