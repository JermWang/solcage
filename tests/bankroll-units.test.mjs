import assert from "node:assert/strict";
import test from "node:test";
import { toBaseUnits, fromBaseUnits, StakeRejected } from "../lib/bankroll.ts";

test("base unit conversion is exact", () => {
  assert.equal(toBaseUnits("1", 9), 1_000_000_000n);
  assert.equal(toBaseUnits("0.1", 9), 100_000_000n);
  assert.equal(toBaseUnits("0.000000001", 9), 1n);
  assert.equal(fromBaseUnits(1_500_000_000n, 9), "1.5");
  assert.equal(fromBaseUnits(0n, 9), "0");
});

test("float drift cannot enter the ledger", () => {
  // 0.1 + 0.2 in float is 0.30000000000000004; base units must stay exact.
  assert.equal(toBaseUnits("0.1", 9) + toBaseUnits("0.2", 9), toBaseUnits("0.3", 9));
});

test("rejects amounts finer than the token", () => {
  assert.throws(() => toBaseUnits("0.0000000001", 9), StakeRejected);
  assert.throws(() => toBaseUnits("-1", 9), StakeRejected);
  assert.throws(() => toBaseUnits("abc", 9), StakeRejected);
});
