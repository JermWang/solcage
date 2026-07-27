import assert from "node:assert/strict";
import test from "node:test";
import { Provable } from "@provableio/provable-core";
import {
  diceMultiplier,
  diceTarget,
  displayDiceUnits,
  settleDice,
} from "../lib/games/dice.ts";

test("under and over targets preserve the selected number of winning outcomes", () => {
  assert.equal(diceTarget(4_950, "under"), 4_950);
  assert.equal(diceTarget(4_950, "over"), 5_049);
  assert.equal(settleDice(4_949, 4_950, "under").won, true);
  assert.equal(settleDice(4_950, 4_950, "under").won, false);
  assert.equal(settleDice(5_050, 4_950, "over").won, true);
  assert.equal(settleDice(5_049, 4_950, "over").won, false);
});

test("dice multiplier keeps exact expected return at 98 percent", () => {
  for (const chanceBps of [100, 250, 1_000, 2_500, 4_950, 7_500, 9_500]) {
    const probability = chanceBps / 10_000;
    assert.ok(Math.abs(probability * diceMultiplier(chanceBps) - 0.98) < 1e-12);
  }
});

test("committed HMAC entropy replays the same bounded roll", () => {
  const input = {
    serverSeed: "dice-server-seed",
    clientSeed: "dice-client-seed",
    nonce: 0,
    cursor: 0,
  };
  const first = Provable(() => undefined)({ ...input }).ints(1, 9_999, 0)[0];
  const second = Provable(() => undefined)({ ...input }).ints(1, 9_999, 0)[0];
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 9_999);
  assert.deepEqual(settleDice(first, 4_950, "under"), settleDice(second, 4_950, "under"));
});

test("dice inputs and display units are strictly bounded", () => {
  assert.equal(displayDiceUnits(0), "0.00");
  assert.equal(displayDiceUnits(9_999), "99.99");
  assert.throws(() => settleDice(-1, 4_950, "under"), /Invalid dice roll/);
  assert.throws(() => settleDice(10_000, 4_950, "under"), /Invalid dice roll/);
  assert.throws(() => settleDice(5_000, 99, "under"), /Invalid dice win chance/);
  assert.throws(() => settleDice(5_000, 9_501, "under"), /Invalid dice win chance/);
});

