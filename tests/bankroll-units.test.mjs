import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBalanced,
  toBaseUnits,
  fromBaseUnits,
  LedgerError,
  StakeRejected,
  capPayout,
} from "../lib/bankroll.ts";

test("base unit conversion is exact", () => {
  assert.equal(toBaseUnits("1", 9), 1_000_000_000n);
  assert.equal(toBaseUnits("0.1", 9), 100_000_000n);
  assert.equal(toBaseUnits("0.000000001", 9), 1n);
  assert.equal(fromBaseUnits(1_500_000_000n, 9), "1.5");
  assert.equal(fromBaseUnits(0n, 9), "0");
});

test("float drift cannot enter the ledger", () => {
  // 0.1 + 0.2 is 0.30000000000000004 in float; base units must stay exact.
  assert.equal(toBaseUnits("0.1", 9) + toBaseUnits("0.2", 9), toBaseUnits("0.3", 9));
});

test("rejects amounts finer than the token", () => {
  assert.throws(() => toBaseUnits("0.0000000001", 9), StakeRejected);
  assert.throws(() => toBaseUnits("-1", 9), StakeRejected);
  assert.throws(() => toBaseUnits("abc", 9), StakeRejected);
});

test("a balanced posting is accepted", () => {
  assert.doesNotThrow(() =>
    assertBalanced([
      { account: "USER_AVAILABLE", userId: "u1", amountRaw: -100n },
      { account: "HOUSE_TREASURY", amountRaw: 100n },
    ]),
  );
});

test("value cannot be created or destroyed", () => {
  // Credit a player without debiting anything — the exact bug double-entry exists to catch.
  assert.throws(
    () => assertBalanced([{ account: "USER_AVAILABLE", userId: "u1", amountRaw: 100n }]),
    LedgerError,
  );
  // Legs that do not net to zero.
  assert.throws(
    () =>
      assertBalanced([
        { account: "USER_AVAILABLE", userId: "u1", amountRaw: -100n },
        { account: "HOUSE_TREASURY", amountRaw: 99n },
      ]),
    LedgerError,
  );
});

test("player accounts must name a player", () => {
  assert.throws(
    () =>
      assertBalanced([
        { account: "USER_AVAILABLE", amountRaw: -100n },
        { account: "HOUSE_TREASURY", amountRaw: 100n },
      ]),
    LedgerError,
  );
});

test("empty and zero-value postings are refused", () => {
  assert.throws(() => assertBalanced([]), LedgerError);
  assert.throws(
    () =>
      assertBalanced([
        { account: "USER_AVAILABLE", userId: "u1", amountRaw: 0n },
        { account: "HOUSE_TREASURY", amountRaw: 0n },
      ]),
    LedgerError,
  );
});

test("a full round trip nets to zero across every account", () => {
  const legs = [
    // deposit 1 SOL
    { account: "EXTERNAL", amountRaw: -1_000_000_000n },
    { account: "USER_AVAILABLE", userId: "u1", amountRaw: 1_000_000_000n },
    // bet 0.1
    { account: "USER_AVAILABLE", userId: "u1", amountRaw: -100_000_000n },
    { account: "HOUSE_TREASURY", amountRaw: 100_000_000n },
    // win 0.2
    { account: "HOUSE_TREASURY", amountRaw: -200_000_000n },
    { account: "USER_AVAILABLE", userId: "u1", amountRaw: 200_000_000n },
    // withdraw the lot
    { account: "USER_AVAILABLE", userId: "u1", amountRaw: -1_100_000_000n },
    { account: "WITHDRAWAL_PENDING", userId: "u1", amountRaw: 1_100_000_000n },
    { account: "WITHDRAWAL_PENDING", userId: "u1", amountRaw: -1_100_000_000n },
    { account: "EXTERNAL", amountRaw: 1_100_000_000n },
  ];
  assert.equal(legs.reduce((sum, l) => sum + l.amountRaw, 0n), 0n);
  // House is down exactly the 0.1 it lost on the round.
  const treasury = legs
    .filter((l) => l.account === "HOUSE_TREASURY")
    .reduce((sum, l) => sum + l.amountRaw, 0n);
  assert.equal(treasury, -100_000_000n);
});

test("the win ceiling bounds every payout", () => {
  const limits = { minStakeRaw: 1_000_000n, maxStakeRaw: 250_000_000n, maxPayoutRaw: 500_000_000n };
  // An 800x hit on a 0.25 SOL stake would be 200 SOL — twenty times the bankroll.
  assert.equal(capPayout(200_000_000_000n, limits), 500_000_000n);
  // Anything under the ceiling is paid in full.
  assert.equal(capPayout(120_000_000n, limits), 120_000_000n);
  assert.equal(capPayout(500_000_000n, limits), 500_000_000n);
  assert.equal(capPayout(0n, limits), 0n);
});

test("rake splits a stake without creating or losing value", () => {
  const stake = 1_000_000_000n; // 1 SOL
  const rake = (stake * 200n) / 10_000n; // 2%
  assert.equal(rake, 20_000_000n);
  const legs = [
    { account: "USER_AVAILABLE", userId: "u1", amountRaw: -stake },
    { account: "HOUSE_TREASURY", amountRaw: stake - rake },
    { account: "PLATFORM_REVENUE", amountRaw: rake },
  ];
  assert.doesNotThrow(() => assertBalanced(legs));
  assert.equal(legs.reduce((s, l) => s + l.amountRaw, 0n), 0n);
});

test("rake rounds down and the remainder stays with the house", () => {
  // 2% of 3 base units is 0.06 -> integer division yields 0, never 1.
  const stake = 3n;
  const rake = (stake * 200n) / 10_000n;
  assert.equal(rake, 0n);
  assert.equal(stake - rake, 3n);
  // A stake small enough to rake nothing still balances.
  assert.doesNotThrow(() =>
    assertBalanced([
      { account: "USER_AVAILABLE", userId: "u1", amountRaw: -stake },
      { account: "HOUSE_TREASURY", amountRaw: stake },
    ]),
  );
});

test("rake lowers effective RTP by its own rate", () => {
  // Dice is designed at 98% RTP. A 2% turnover rake compounds on top.
  const designedRtp = 0.98;
  const rakeRate = 0.02;
  const effective = designedRtp * (1 - rakeRate);
  assert.ok(effective < designedRtp);
  assert.equal(Math.round(effective * 10000) / 100, 96.04);
});
