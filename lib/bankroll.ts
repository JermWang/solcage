import type { PoolClient } from "pg";

/**
 * Player bankroll.
 *
 * Every balance is derived: SUM(amount_raw) over wallet_ledger. Nothing stores
 * a running total, so a crash between two writes can never leave a balance that
 * disagrees with its own history.
 *
 * Every write carries an event_key with a UNIQUE constraint. Replaying the same
 * settlement is a no-op rather than a double credit — the same idempotency
 * pattern the reward ledger already uses.
 */

export type LedgerKind =
  | "deposit"
  | "bet"
  | "win"
  | "refund"
  | "withdrawal"
  | "withdrawal_reversal"
  | "adjustment";

export class InsufficientFunds extends Error {
  // Written out rather than declared as parameter properties: the repo's test
  // runner uses --experimental-strip-types, which rejects that syntax.
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

/**
 * Serialise every balance-changing operation for one player. Without this two
 * concurrent bets can both read the same balance and both pass the funds check.
 * Transaction-scoped, so it releases on commit or rollback.
 */
async function lockPlayer(client: PoolClient, userId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`bankroll:${userId}`]);
}

export async function balanceRaw(client: PoolClient, userId: string) {
  const result = await client.query(
    "SELECT COALESCE(SUM(amount_raw), 0)::text AS balance FROM wallet_ledger WHERE user_id = $1",
    [userId],
  );
  return BigInt(result.rows[0].balance);
}

type EntryInput = {
  userId: string;
  kind: LedgerKind;
  amountRaw: bigint;
  eventKey: string;
  metadata?: Record<string, unknown>;
};

/** Append one entry. Returns false when the event_key was already recorded. */
export async function appendEntry(client: PoolClient, input: EntryInput) {
  const inserted = await client.query(
    `INSERT INTO wallet_ledger (id, user_id, kind, amount_raw, event_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (event_key) DO NOTHING`,
    [
      crypto.randomUUID(),
      input.userId,
      input.kind,
      input.amountRaw.toString(),
      input.eventKey,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return Boolean(inserted.rowCount);
}

export type WagerLimits = {
  /** Smallest accepted stake, in base units. */
  minStakeRaw: bigint;
  /** Largest accepted stake, in base units. */
  maxStakeRaw: bigint;
  /**
   * Largest amount a single round may return. Checked against the stake and the
   * game's top multiplier, so one 30x hit cannot exceed what the house can pay.
   */
  maxPayoutRaw: bigint;
};

/**
 * Take a stake. Locks the player, verifies the stake against the limits and the
 * player's own funds, then writes the debit. Must be called inside the same
 * transaction that settles the round.
 */
export async function takeStake(
  client: PoolClient,
  input: {
    userId: string;
    stakeRaw: bigint;
    maxMultiplier: number;
    eventKey: string;
    limits: WagerLimits;
    metadata?: Record<string, unknown>;
  },
) {
  const { stakeRaw, limits } = input;
  if (stakeRaw <= 0n) throw new StakeRejected("Stake must be positive");
  if (stakeRaw < limits.minStakeRaw) throw new StakeRejected("Stake is below the table minimum");
  if (stakeRaw > limits.maxStakeRaw) throw new StakeRejected("Stake is above the table maximum");

  // Cap exposure by what this round could pay, not by the stake alone: a small
  // stake on a 30x game still commits the house to 30x.
  const worstCasePayout = stakeRaw * BigInt(Math.ceil(input.maxMultiplier));
  if (worstCasePayout > limits.maxPayoutRaw) {
    throw new StakeRejected("Stake exceeds the maximum exposure for this game");
  }

  await lockPlayer(client, input.userId);
  const available = await balanceRaw(client, input.userId);
  if (available < stakeRaw) throw new InsufficientFunds(available, stakeRaw);

  const written = await appendEntry(client, {
    userId: input.userId,
    kind: "bet",
    amountRaw: -stakeRaw,
    eventKey: input.eventKey,
    metadata: input.metadata,
  });
  if (!written) throw new StakeRejected("This round was already settled");
  return available - stakeRaw;
}

/** Credit a winning round. Safe to call with zero — a loss writes nothing. */
export async function payWinnings(
  client: PoolClient,
  input: { userId: string; payoutRaw: bigint; eventKey: string; metadata?: Record<string, unknown> },
) {
  if (input.payoutRaw <= 0n) return false;
  return appendEntry(client, {
    userId: input.userId,
    kind: "win",
    amountRaw: input.payoutRaw,
    eventKey: input.eventKey,
    metadata: input.metadata,
  });
}

/** Convert a decimal amount of the house token into base units without float drift. */
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
