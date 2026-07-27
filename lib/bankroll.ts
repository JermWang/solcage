import type { PoolClient } from "pg";

/**
 * Player bankroll — double-entry.
 *
 * Every economic event is one posting whose legs sum to zero. Money is only
 * ever moved between accounts, never created or destroyed, so a bug shows up as
 * an imbalance instead of silently minting value. `postLedger` refuses to write
 * an unbalanced posting at all.
 *
 * A balance is derived: SUM(amount_raw) over the account's legs. Nothing caches
 * a total, so a crash between writes cannot leave a number that disagrees with
 * its own history.
 *
 * Idempotency lives on ledger_postings.correlation_id (UNIQUE). Replaying a
 * settlement inserts nothing and posts no legs.
 */

/** Where value sits. USER_* accounts are per-player; the rest are the house's. */
export type Account =
  | "USER_AVAILABLE"
  | "WITHDRAWAL_PENDING"
  | "HOUSE_TREASURY"
  | "PLATFORM_REVENUE"
  | "EXTERNAL";

export type Reason =
  | "DEPOSIT"
  | "BET"
  | "WIN"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_SENT"
  | "WITHDRAWAL_REFUND"
  | "ADJUSTMENT";

export type Leg = { account: Account; userId?: string | null; amountRaw: bigint };

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export class InsufficientFunds extends Error {
  balanceRaw: bigint;
  requestedRaw: bigint;
  constructor(balanceRaw: bigint, requestedRaw: bigint) {
    super("Insufficient balance");
    this.name = "InsufficientFunds";
    this.balanceRaw = balanceRaw;
    this.requestedRaw = requestedRaw;
  }
}

export class StakeRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StakeRejected";
  }
}

const USER_SCOPED: Account[] = ["USER_AVAILABLE", "WITHDRAWAL_PENDING"];

/** Refuse anything that would not balance, before it reaches the database. */
export function assertBalanced(legs: Leg[]) {
  if (!legs.length) throw new LedgerError("Posting has no legs");
  const total = legs.reduce((sum, l) => sum + l.amountRaw, 0n);
  if (total !== 0n) throw new LedgerError(`Posting does not balance (net ${total})`);
  for (const leg of legs) {
    if (leg.amountRaw === 0n) throw new LedgerError("Posting contains a zero leg");
    if (USER_SCOPED.includes(leg.account) && !leg.userId) {
      throw new LedgerError(`${leg.account} requires a userId`);
    }
  }
}

/**
 * Post a balanced set of legs. Returns false when correlationId was already
 * used, in which case nothing is written.
 */
export async function postLedger(
  client: PoolClient,
  input: { correlationId: string; reason: Reason; legs: Leg[]; metadata?: Record<string, unknown> },
) {
  assertBalanced(input.legs);
  const posting = await client.query(
    `INSERT INTO ledger_postings (id, correlation_id, reason, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (correlation_id) DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), input.correlationId, input.reason, JSON.stringify(input.metadata ?? {})],
  );
  if (!posting.rowCount) return false;
  const postingId = posting.rows[0].id as string;
  for (const leg of input.legs) {
    await client.query(
      `INSERT INTO ledger_entries (id, posting_id, account, user_id, amount_raw)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), postingId, leg.account, leg.userId ?? null, leg.amountRaw.toString()],
    );
  }
  return true;
}

async function accountBalance(client: PoolClient, account: Account, userId?: string) {
  const result = userId
    ? await client.query(
        `SELECT COALESCE(SUM(amount_raw), 0)::text AS balance
         FROM ledger_entries WHERE account = $1 AND user_id = $2`,
        [account, userId],
      )
    : await client.query(
        `SELECT COALESCE(SUM(amount_raw), 0)::text AS balance
         FROM ledger_entries WHERE account = $1 AND user_id IS NULL`,
        [account],
      );
  return BigInt(result.rows[0].balance);
}

/** Spendable balance — excludes anything locked behind a withdrawal. */
export function availableBalance(client: PoolClient, userId: string) {
  return accountBalance(client, "USER_AVAILABLE", userId);
}

export function lockedBalance(client: PoolClient, userId: string) {
  return accountBalance(client, "WITHDRAWAL_PENDING", userId);
}

export function treasuryBalance(client: PoolClient) {
  return accountBalance(client, "HOUSE_TREASURY");
}

/**
 * Serialise balance-changing work for one player. Without this, two concurrent
 * bets both read the same balance and both pass the funds check.
 * Transaction-scoped: released on commit or rollback.
 */
export async function lockPlayer(client: PoolClient, userId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`bankroll:${userId}`]);
}

/** Credit a confirmed on-chain deposit. Value enters from EXTERNAL. */
export async function creditDeposit(
  client: PoolClient,
  input: { userId: string; amountRaw: bigint; signature: string; metadata?: Record<string, unknown> },
) {
  if (input.amountRaw <= 0n) throw new LedgerError("Deposit must be positive");
  return postLedger(client, {
    correlationId: `deposit:${input.signature}`,
    reason: "DEPOSIT",
    metadata: input.metadata,
    legs: [
      { account: "EXTERNAL", amountRaw: -input.amountRaw },
      { account: "USER_AVAILABLE", userId: input.userId, amountRaw: input.amountRaw },
    ],
  });
}

export type WagerLimits = {
  minStakeRaw: bigint;
  maxStakeRaw: bigint;
  /**
   * Hard ceiling on what any single round can pay out, applied at settlement.
   * This is what bounds tail risk — not the stake — so an 800x game can be
   * offered at a real stake without one hand taking the bankroll. A capped win
   * is a material term and must be shown to players before they bet.
   */
  maxPayoutRaw: bigint;
};

/** Apply the house's per-round win ceiling. Returns the amount actually paid. */
export function capPayout(payoutRaw: bigint, limits: WagerLimits) {
  return payoutRaw > limits.maxPayoutRaw ? limits.maxPayoutRaw : payoutRaw;
}

/**
 * Take a stake: player -> treasury. Must run inside the transaction that settles
 * the round, so a failure anywhere rolls the debit back with it.
 */
export async function takeStake(
  client: PoolClient,
  input: {
    userId: string;
    stakeRaw: bigint;
    maxMultiplier: number;
    /** House rake in basis points, taken off the stake as it enters. */
    rakeBps?: number;
    correlationId: string;
    limits: WagerLimits;
    metadata?: Record<string, unknown>;
  },
) {
  const { stakeRaw, limits } = input;
  if (stakeRaw <= 0n) throw new StakeRejected("Stake must be positive");
  if (stakeRaw < limits.minStakeRaw) throw new StakeRejected("Stake is below the table minimum");
  if (stakeRaw > limits.maxStakeRaw) throw new StakeRejected("Stake is above the table maximum");

  // Exposure is bounded by the payout ceiling applied at settlement, not by
  // refusing the stake — so high-multiplier games stay playable at real sizes.

  await lockPlayer(client, input.userId);
  const available = await availableBalance(client, input.userId);
  if (available < stakeRaw) throw new InsufficientFunds(available, stakeRaw);

  // Rake is taken off the stake as it enters, so it is never part of the
  // treasury the house can lose back to the player. Integer division; any
  // remainder stays with the treasury rather than being invented.
  const rakeRaw = (stakeRaw * BigInt(input.rakeBps ?? 0)) / 10_000n;
  const toTreasury = stakeRaw - rakeRaw;
  const legs: Leg[] = [
    { account: "USER_AVAILABLE", userId: input.userId, amountRaw: -stakeRaw },
    { account: "HOUSE_TREASURY", amountRaw: toTreasury },
  ];
  if (rakeRaw > 0n) legs.push({ account: "PLATFORM_REVENUE", amountRaw: rakeRaw });

  const written = await postLedger(client, {
    correlationId: input.correlationId,
    reason: "BET",
    metadata: { ...input.metadata, rakeRaw: rakeRaw.toString() },
    legs,
  });
  if (!written) throw new StakeRejected("This round was already settled");
  return { balanceRaw: available - stakeRaw, rakeRaw };
}

/** Rake accrued and not yet swept out to the custody wallet. */
export function platformRevenue(client: PoolClient) {
  return accountBalance(client, "PLATFORM_REVENUE");
}

/**
 * Record rake leaving the system after it has actually moved on-chain. Call
 * only once the transfer is confirmed — the ledger must not claim money left
 * the house if it never did.
 */
export async function recordRakeSweep(
  client: PoolClient,
  input: { amountRaw: bigint; signature: string },
) {
  return postLedger(client, {
    correlationId: `rake-sweep:${input.signature}`,
    reason: "ADJUSTMENT",
    metadata: { signature: input.signature, kind: "rake_sweep" },
    legs: [
      { account: "PLATFORM_REVENUE", amountRaw: -input.amountRaw },
      { account: "EXTERNAL", amountRaw: input.amountRaw },
    ],
  });
}

/**
 * Pay a winning round: treasury -> player. A loss posts nothing.
 * The win ceiling is enforced here rather than at each call site, so no game
 * can pay past it by forgetting to check. Returns what was actually paid.
 */
export async function payWinnings(
  client: PoolClient,
  input: {
    userId: string;
    payoutRaw: bigint;
    limits: WagerLimits;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const paidRaw = capPayout(input.payoutRaw, input.limits);
  if (paidRaw <= 0n) return { paidRaw: 0n, capped: false, posted: false };
  const capped = paidRaw < input.payoutRaw;
  const posted = await postLedger(client, {
    correlationId: input.correlationId,
    reason: "WIN",
    metadata: { ...input.metadata, uncappedRaw: input.payoutRaw.toString(), capped },
    legs: [
      { account: "HOUSE_TREASURY", amountRaw: -paidRaw },
      { account: "USER_AVAILABLE", userId: input.userId, amountRaw: paidRaw },
    ],
  });
  return { paidRaw, capped, posted };
}

/**
 * Lock funds at the moment a withdrawal is requested, not when it is sent.
 * Until it settles the balance is unspendable but still the player's.
 */
export async function lockWithdrawal(
  client: PoolClient,
  input: { userId: string; amountRaw: bigint; correlationId: string },
) {
  if (input.amountRaw <= 0n) throw new LedgerError("Withdrawal must be positive");
  await lockPlayer(client, input.userId);
  const available = await availableBalance(client, input.userId);
  if (available < input.amountRaw) throw new InsufficientFunds(available, input.amountRaw);
  return postLedger(client, {
    correlationId: input.correlationId,
    reason: "WITHDRAWAL_REQUESTED",
    legs: [
      { account: "USER_AVAILABLE", userId: input.userId, amountRaw: -input.amountRaw },
      { account: "WITHDRAWAL_PENDING", userId: input.userId, amountRaw: input.amountRaw },
    ],
  });
}

/** Withdrawal confirmed on-chain: the locked amount leaves the system. */
export async function settleWithdrawalSent(
  client: PoolClient,
  input: { userId: string; amountRaw: bigint; correlationId: string; metadata?: Record<string, unknown> },
) {
  return postLedger(client, {
    correlationId: input.correlationId,
    reason: "WITHDRAWAL_SENT",
    metadata: input.metadata,
    legs: [
      { account: "WITHDRAWAL_PENDING", userId: input.userId, amountRaw: -input.amountRaw },
      { account: "EXTERNAL", amountRaw: input.amountRaw },
    ],
  });
}

/** Rejected or failed withdrawal: unlock back to spendable. */
export async function refundWithdrawal(
  client: PoolClient,
  input: { userId: string; amountRaw: bigint; correlationId: string },
) {
  return postLedger(client, {
    correlationId: input.correlationId,
    reason: "WITHDRAWAL_REFUND",
    legs: [
      { account: "WITHDRAWAL_PENDING", userId: input.userId, amountRaw: -input.amountRaw },
      { account: "USER_AVAILABLE", userId: input.userId, amountRaw: input.amountRaw },
    ],
  });
}

/**
 * Whole-system invariant: every leg ever written sums to zero. Any non-zero
 * result means value was created or destroyed and needs investigating before
 * anything else happens.
 */
export async function ledgerIsBalanced(client: PoolClient) {
  const result = await client.query(
    "SELECT COALESCE(SUM(amount_raw), 0)::text AS net FROM ledger_entries",
  );
  return BigInt(result.rows[0].net) === 0n;
}

/** Convert a decimal amount into base units without float drift. */
export function toBaseUnits(amount: string, decimals: number) {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new StakeRejected("Invalid amount");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new StakeRejected("Too many decimal places");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function fromBaseUnits(raw: bigint, decimals: number) {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
