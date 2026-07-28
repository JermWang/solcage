import { db, transaction } from "./db.ts";
import {
  InsufficientFunds,
  lockWithdrawal,
  refundWithdrawal,
  settleWithdrawalSent,
} from "./bankroll.ts";
import { houseConfig } from "./house.ts";
import { BlockhashExpired, houseConnection, sendHouseSol } from "./house-solana.ts";

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
    const sent = await sendHouseSol({
      destination: row.destination,
      lamports: amountRaw,
      // Written the moment it is broadcast, so a stalled confirmation leaves a
      // row that can be reconciled instead of an untraceable transfer.
      onBroadcast: async (broadcast) => {
        await db().query(
          "UPDATE withdrawals SET signature = $2, updated_at = NOW() WHERE id = $1",
          [withdrawalId, broadcast],
        );
      },
    });
    signature = sent.signature;
  } catch (error) {
    // Only return the funds when the transfer provably never landed. Any other
    // failure may still have sent the SOL, so the row is left for reconciliation
    // rather than refunded — refunding a sent withdrawal pays it out twice.
    if (error instanceof BlockhashExpired) {
      await failWithdrawal(withdrawalId, error.message);
    }
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

/**
 * Resolve withdrawals stuck in `sending`.
 *
 * A row lands here when the transfer was broadcast but confirmation never came
 * back — a stalled websocket, a killed request. The signature written at
 * broadcast is the source of truth: if it landed, settle the row as sent; if the
 * chain has no record and the blockhash can no longer be valid, return the funds.
 * Anything still in flight is left alone. Nothing is ever re-broadcast, because
 * a second send would pay the withdrawal twice.
 */
export async function reconcileSendingWithdrawals(olderThanSeconds = 60) {
  const stuck = await db().query(
    `SELECT id, user_id, amount_raw::text AS amount_raw, signature, destination
     FROM withdrawals
     WHERE status = 'sending'
       AND updated_at < NOW() - ($1 || ' seconds')::interval`,
    [String(olderThanSeconds)],
  );

  const results: Array<{ id: string; outcome: string; signature?: string }> = [];
  const connection = houseConnection();

  for (const row of stuck.rows) {
    const amountRaw = BigInt(row.amount_raw);

    if (!row.signature) {
      // A missing signature is NOT proof nothing was sent — rows created before
      // the signature was recorded at broadcast can have landed on-chain with no
      // record here. Refunding one of those pays the withdrawal twice, so this
      // case is always surfaced for a human to check against the chain.
      results.push({ id: row.id, outcome: "no signature recorded — check the house wallet on-chain before resolving" });
      continue;
    }

    const { value } = await connection.getSignatureStatuses([row.signature], {
      searchTransactionHistory: true,
    });
    const status = value[0];

    if (status && !status.err) {
      await transaction(async (client) => {
        await settleWithdrawalSent(client, {
          userId: row.user_id,
          amountRaw,
          correlationId: `withdrawal-sent:${row.id}`,
          metadata: { signature: row.signature, reconciled: true },
        });
        await client.query(
          "UPDATE withdrawals SET status = 'sent', updated_at = NOW() WHERE id = $1",
          [row.id],
        );
      });
      results.push({ id: row.id, outcome: "settled as sent", signature: row.signature });
      continue;
    }

    if (status?.err) {
      await failWithdrawal(row.id, "Transfer failed on Solana");
      results.push({ id: row.id, outcome: "refunded (failed on chain)" });
      continue;
    }

    // No record at all. Only safe to refund once the transaction can no longer
    // be accepted; until then it may still land.
    results.push({ id: row.id, outcome: "still unknown — left in sending" });
  }

  return results;
}
