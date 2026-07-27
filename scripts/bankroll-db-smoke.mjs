/**
 * Ledger round trip against the real database.
 *
 * The on-chain path is covered by house:devnet-smoke. This covers the half that
 * had never run: postings, advisory locks, balance derivation, idempotency and
 * the global invariant, against the actual Postgres and schema in use.
 *
 * Creates a clearly-marked test account and deletes it at the end; the FK
 * cascades remove every row it wrote.
 */
import { db, ensureSchema, transaction } from "../lib/db.ts";
import {
  availableBalance,
  creditDeposit,
  lockWithdrawal,
  lockedBalance,
  ledgerIsBalanced,
  payWinnings,
  platformRevenue,
  refundWithdrawal,
  settleWithdrawalSent,
  takeStake,
} from "../lib/bankroll.ts";

const LIMITS = {
  minStakeRaw: 1_000_000n,
  maxStakeRaw: 250_000_000n,
  maxPayoutRaw: 500_000_000n,
};
const RAKE_BPS = 200;

const results = [];
const check = (label, pass, detail = "") => {
  results.push({ label, pass, detail });
  if (!pass) throw new Error(`FAILED: ${label} ${detail}`);
};

await ensureSchema();

const userId = crypto.randomUUID();
const suffix = userId.slice(0, 8);
await db().query(
  `INSERT INTO users (id, username, display_name, referral_code)
   VALUES ($1, $2, $3, $4)`,
  [userId, `smoke_${suffix}`, `Smoke ${suffix}`, `SMOKE${suffix.slice(0, 6).toUpperCase()}`],
);

try {
  const startBalanced = await transaction((c) => ledgerIsBalanced(c));
  check("ledger starts balanced", startBalanced);

  // --- deposit ------------------------------------------------------------
  const depositSig = `smoke-${userId}`;
  await transaction((c) =>
    creditDeposit(c, { userId, amountRaw: 1_000_000_000n, signature: depositSig }),
  );
  let balance = await transaction((c) => availableBalance(c, userId));
  check("deposit credits 1 SOL", balance === 1_000_000_000n, `got ${balance}`);

  // Replaying the same signature must credit nothing.
  await transaction((c) =>
    creditDeposit(c, { userId, amountRaw: 1_000_000_000n, signature: depositSig }),
  );
  balance = await transaction((c) => availableBalance(c, userId));
  check("replayed deposit is a no-op", balance === 1_000_000_000n, `got ${balance}`);

  // --- bet with rake ------------------------------------------------------
  const rakeBefore = await transaction((c) => platformRevenue(c));
  const bet = await transaction((c) =>
    takeStake(c, {
      userId,
      stakeRaw: 100_000_000n,
      maxMultiplier: 49,
      rakeBps: RAKE_BPS,
      correlationId: `smoke-bet:${userId}`,
      limits: LIMITS,
    }),
  );
  check("stake debited", bet.balanceRaw === 900_000_000n, `got ${bet.balanceRaw}`);
  check("rake is 2% of stake", bet.rakeRaw === 2_000_000n, `got ${bet.rakeRaw}`);
  const rakeAfter = await transaction((c) => platformRevenue(c));
  check("rake accrued to platform revenue", rakeAfter - rakeBefore === 2_000_000n);

  // Replaying the same round must not double-debit.
  let replayRejected = false;
  try {
    await transaction((c) =>
      takeStake(c, {
        userId,
        stakeRaw: 100_000_000n,
        maxMultiplier: 49,
        rakeBps: RAKE_BPS,
        correlationId: `smoke-bet:${userId}`,
        limits: LIMITS,
      }),
    );
  } catch {
    replayRejected = true;
  }
  check("replayed round is refused", replayRejected);

  // --- win, capped --------------------------------------------------------
  const paid = await transaction((c) =>
    payWinnings(c, {
      userId,
      payoutRaw: 200_000_000_000n, // an 800x hit
      limits: LIMITS,
      correlationId: `smoke-win:${userId}`,
    }),
  );
  check("payout capped at the ceiling", paid.paidRaw === 500_000_000n, `got ${paid.paidRaw}`);
  check("cap is reported", paid.capped === true);
  balance = await transaction((c) => availableBalance(c, userId));
  check("capped win credited", balance === 1_400_000_000n, `got ${balance}`);

  // --- overdraw -----------------------------------------------------------
  let overdrawBlocked = false;
  try {
    await transaction((c) =>
      takeStake(c, {
        userId,
        stakeRaw: 250_000_000n,
        maxMultiplier: 3,
        rakeBps: RAKE_BPS,
        correlationId: `smoke-over:${userId}`,
        limits: { ...LIMITS, maxStakeRaw: 10_000_000_000n },
      }),
    );
  } catch (error) {
    overdrawBlocked = error.name === "InsufficientFunds";
  }
  // 0.25 SOL is affordable here, so this should succeed rather than block.
  check("affordable stake is accepted", overdrawBlocked === false);

  balance = await transaction((c) => availableBalance(c, userId));
  let blocked = false;
  try {
    await transaction((c) =>
      takeStake(c, {
        userId,
        stakeRaw: balance + 1n,
        maxMultiplier: 3,
        rakeBps: RAKE_BPS,
        correlationId: `smoke-over2:${userId}`,
        limits: { ...LIMITS, maxStakeRaw: 10_000_000_000n },
      }),
    );
  } catch (error) {
    blocked = error.name === "InsufficientFunds";
  }
  check("betting more than the balance is blocked", blocked);

  // --- withdrawal lock, refund, settle ------------------------------------
  balance = await transaction((c) => availableBalance(c, userId));
  await transaction((c) =>
    lockWithdrawal(c, { userId, amountRaw: 100_000_000n, correlationId: `smoke-lock:${userId}` }),
  );
  const locked = await transaction((c) => lockedBalance(c, userId));
  const afterLock = await transaction((c) => availableBalance(c, userId));
  check("funds move to locked", locked === 100_000_000n, `got ${locked}`);
  check("available drops by the lock", afterLock === balance - 100_000_000n);

  await transaction((c) =>
    refundWithdrawal(c, { userId, amountRaw: 100_000_000n, correlationId: `smoke-refund:${userId}` }),
  );
  check(
    "refund returns the lock",
    (await transaction((c) => availableBalance(c, userId))) === balance,
  );

  await transaction((c) =>
    lockWithdrawal(c, { userId, amountRaw: 50_000_000n, correlationId: `smoke-lock2:${userId}` }),
  );
  await transaction((c) =>
    settleWithdrawalSent(c, {
      userId,
      amountRaw: 50_000_000n,
      correlationId: `smoke-sent:${userId}`,
      metadata: { signature: "smoke" },
    }),
  );
  check("settled withdrawal clears the lock", (await transaction((c) => lockedBalance(c, userId))) === 0n);

  // --- the invariant that matters ----------------------------------------
  check("ledger still balances", await transaction((c) => ledgerIsBalanced(c)));

  console.log(JSON.stringify({
    ok: true,
    database: "live",
    userId,
    finalAvailable: (await transaction((c) => availableBalance(c, userId))).toString(),
    checks: results.map((r) => r.label),
  }, null, 2));
} finally {
  // Remove the postings first: with ON DELETE RESTRICT the user cannot be
  // deleted while ledger history references it, and deleting postings takes
  // both halves together so the invariant survives cleanup.
  await db().query(
    "DELETE FROM ledger_postings WHERE correlation_id LIKE $1 OR correlation_id LIKE $2",
    [`%${userId}%`, `deposit:smoke-${userId}`],
  );
  await db().query("DELETE FROM users WHERE id = $1", [userId]);
  const balancedAfterCleanup = await transaction((c) => ledgerIsBalanced(c));
  console.log(`cleanup: test account removed, ledger balanced = ${balancedAfterCleanup}`);
  await db().end();
}
