import assert from "node:assert/strict";
import test from "node:test";
import { Provable } from "@provableio/provable-core";
import {
  KENO_DRAW_COUNT,
  KENO_ENTROPY_COUNT,
  KENO_MAX_PICKS,
  KENO_MIN_PICKS,
  KENO_NUMBER_COUNT,
  kenoExpectedReturn,
  kenoMultiplier,
  uniqueKenoDraw,
  validateKenoSelections,
} from "../lib/games/keno.ts";

test("Keno selections are sorted, unique, and bounded", () => {
  assert.deepEqual(validateKenoSelections([80, 4, 12, 7, 1]), [1, 4, 7, 12, 80]);
  assert.throws(() => validateKenoSelections([1, 2, 3, 4]), /between 5 and 10/);
  assert.throws(() => validateKenoSelections([1, 2, 3, 4, 4]), /Invalid Keno selection/);
  assert.throws(() => validateKenoSelections([1, 2, 3, 4, 81]), /Invalid Keno selection/);
  assert.equal(KENO_MIN_PICKS, 5);
  assert.equal(KENO_MAX_PICKS, 10);
});

test("Keno draw preserves deterministic order while removing duplicates", () => {
  const entropy = Array.from({ length: 20 }, (_, index) => [index + 1, index + 1]).flat();
  const draw = uniqueKenoDraw(entropy);
  assert.equal(draw.length, KENO_DRAW_COUNT);
  assert.deepEqual(draw, Array.from({ length: 20 }, (_, index) => index + 1));
  assert.throws(() => uniqueKenoDraw([1, 1, 2, 2]), /Insufficient Keno entropy/);
  assert.throws(() => uniqueKenoDraw([0, ...entropy]), /Invalid Keno entropy/);
});

test("the HMAC generator reproduces the same twenty-number draw", () => {
  const draw = () => {
    const generator = Provable(() => undefined)({
      serverSeed: "server-seed-for-reproducible-keno-test",
      clientSeed: "client-seed-for-reproducible-keno-test",
      nonce: 0,
      cursor: 0,
    });
    return uniqueKenoDraw(generator.ints(KENO_ENTROPY_COUNT, KENO_NUMBER_COUNT, 1));
  };
  assert.deepEqual(draw(), draw());
  assert.equal(new Set(draw()).size, KENO_DRAW_COUNT);
});

test("every Keno table stays close to the designed 96 percent return", () => {
  for (let picks = KENO_MIN_PICKS; picks <= KENO_MAX_PICKS; picks += 1) {
    const expected = kenoExpectedReturn(picks);
    assert.ok(expected >= 0.959 && expected <= 0.962, `${picks} picks returned ${expected}`);
    assert.equal(kenoMultiplier(picks, 0), 0);
    assert.ok(kenoMultiplier(picks, picks) > 100);
  }
});
