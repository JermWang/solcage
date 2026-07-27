import assert from "node:assert/strict";
import test from "node:test";
import { Provable } from "@provableio/provable-core";
import {
  evaluateSlotMatrix,
  SLOT_REEL_STRIPS,
  slotExpectedReturn,
  slotMatrixFromStops,
  spinSlots,
} from "../lib/games/slots.ts";

test("all five reel strips keep the audited forty-stop distribution", () => {
  const expected = {
    WILD: 2,
    CROWN: 3,
    SEVEN: 4,
    SOL: 5,
    DIAMOND: 6,
    CHIP: 8,
    LIME: 11,
    VAULT: 1,
  };
  for (const strip of SLOT_REEL_STRIPS) {
    assert.equal(strip.length, 40);
    const counts = Object.fromEntries(
      Object.keys(expected).map((symbol) => [
        symbol,
        strip.filter((candidate) => candidate === symbol).length,
      ]),
    );
    assert.deepEqual(counts, expected);
  }
});

test("reel stops deterministically produce a five-by-three matrix", () => {
  const matrix = slotMatrixFromStops([0, 7, 13, 19, 29]);
  assert.equal(matrix.length, 3);
  assert.ok(matrix.every((row) => row.length === 5));
  assert.deepEqual(matrix, slotMatrixFromStops([0, 7, 13, 19, 29]));
  assert.throws(() => slotMatrixFromStops([0, 1, 2]), /Invalid slot reel stops/);
  assert.throws(() => slotMatrixFromStops([0, 1, 2, 3, 40]), /Invalid slot reel stops/);
});

test("wild substitution and nine paylines choose the highest valid award", () => {
  const matrix = [
    ["CROWN", "WILD", "CROWN", "CROWN", "CROWN"],
    ["SOL", "DIAMOND", "CHIP", "LIME", "SEVEN"],
    ["CHIP", "SOL", "LIME", "SEVEN", "DIAMOND"],
  ];
  const result = evaluateSlotMatrix(matrix);
  const topLine = result.lineWins.find((win) => win.line === 1);
  assert.equal(topLine?.symbol, "CROWN");
  assert.equal(topLine?.count, 5);
  assert.equal(topLine?.multiplier, 550);
  assert.deepEqual(topLine?.cells, [
    { reel: 0, row: 0 },
    { reel: 1, row: 0 },
    { reel: 2, row: 0 },
    { reel: 3, row: 0 },
    { reel: 4, row: 0 },
  ]);
});

test("the committed HMAC generator replays identical slot stops and outcome", () => {
  const input = {
    serverSeed: "slots-server-seed",
    clientSeed: "slots-client-seed",
    nonce: 0,
    cursor: 0,
  };
  const first = Provable(() => undefined)({ ...input }).ints(5, 39, 0);
  const second = Provable(() => undefined)({ ...input }).ints(5, 39, 0);
  assert.deepEqual(first, second);
  assert.deepEqual(spinSlots(first), spinSlots(second));
});

test("exact payline and scatter expectation stays near the designed 96 percent RTP", () => {
  const expected = slotExpectedReturn();
  assert.ok(expected.lineReturn > 0.93 && expected.lineReturn < 0.95, String(expected.lineReturn));
  assert.ok(expected.scatterReturn > 0.02 && expected.scatterReturn < 0.03, String(expected.scatterReturn));
  assert.ok(expected.totalReturn > 0.958 && expected.totalReturn < 0.963, String(expected.totalReturn));
});
