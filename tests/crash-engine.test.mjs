import assert from "node:assert/strict";
import test from "node:test";
import {
  crashMultiplierAtElapsed,
  crashPointFromInt,
  elapsedForCrashMultiplier,
  CRASH_MAX_MULTIPLIER,
  CRASH_RANDOM_MAX,
} from "../lib/games/crash.ts";

test("crash entropy curve is bounded and monotonic", () => {
  assert.equal(crashPointFromInt(0), 1);
  assert.equal(crashPointFromInt(CRASH_RANDOM_MAX - 1), CRASH_MAX_MULTIPLIER);
  assert.throws(() => crashPointFromInt(-1), /Invalid crash entropy/);
  assert.throws(() => crashPointFromInt(CRASH_RANDOM_MAX), /Invalid crash entropy/);

  let previous = 0;
  for (let value = 0; value < CRASH_RANDOM_MAX; value += 997) {
    const point = crashPointFromInt(value);
    assert.ok(point >= previous);
    assert.ok(point >= 1 && point <= CRASH_MAX_MULTIPLIER);
    previous = point;
  }
});

test("crash display clock is bounded and invertible to cent precision", () => {
  assert.equal(crashMultiplierAtElapsed(-1), 1);
  assert.equal(crashMultiplierAtElapsed(0), 1);
  for (const multiplier of [1.01, 1.5, 2, 5, 25, 100]) {
    const elapsed = elapsedForCrashMultiplier(multiplier);
    const displayed = crashMultiplierAtElapsed(elapsed);
    assert.ok(displayed >= multiplier - 0.01 && displayed <= multiplier);
  }
  assert.equal(crashMultiplierAtElapsed(1_000_000), CRASH_MAX_MULTIPLIER);
});
