import assert from "node:assert/strict";
import test from "node:test";
import { Provable } from "@provableio/provable-core";
import { createShuffledDeck } from "../lib/games/blackjack.ts";
import {
  VIDEO_POKER_PAYTABLE,
  drawVideoPokerHand,
  evaluateVideoPokerHand,
  isCardHeld,
  settleVideoPokerHand,
  validateHoldMask,
} from "../lib/games/videoPoker.ts";

const card = (rank, suit = "spades") => ({ rank, suit });

const hands = [
  ["royal-flush", [card("10"), card("J"), card("Q"), card("K"), card("A")]],
  ["straight-flush", [card("A"), card("2"), card("3"), card("4"), card("5")]],
  ["four-of-a-kind", [card("9"), card("9", "hearts"), card("9", "clubs"), card("9", "diamonds"), card("K")]],
  ["full-house", [card("7"), card("7", "hearts"), card("7", "clubs"), card("Q"), card("Q", "hearts")]],
  ["flush", [card("2"), card("5"), card("8"), card("J"), card("K")]],
  ["straight", [card("5"), card("6", "hearts"), card("7"), card("8"), card("9")]],
  ["three-of-a-kind", [card("4"), card("4", "hearts"), card("4", "clubs"), card("9"), card("K")]],
  ["two-pair", [card("3"), card("3", "hearts"), card("J"), card("J", "clubs"), card("A")]],
  ["jacks-or-better", [card("Q"), card("Q", "hearts"), card("4"), card("8"), card("A")]],
  ["no-win", [card("10"), card("10", "hearts"), card("4"), card("8"), card("A")]],
];

test("Jacks or Better evaluator identifies every paytable branch", () => {
  for (const [rank, hand] of hands) assert.equal(evaluateVideoPokerHand(hand).rank, rank);
});

test("full-pay multipliers and returned stake are exact", () => {
  assert.deepEqual(VIDEO_POKER_PAYTABLE.map((entry) => entry.multiplier), [800, 50, 25, 9, 6, 4, 3, 2, 1]);
  assert.equal(settleVideoPokerHand(hands[0][1], 5).payout, 4000);
  assert.equal(settleVideoPokerHand(hands[8][1], 25).payout, 25);
  assert.equal(settleVideoPokerHand(hands[9][1], 25).payout, 0);
});

test("hold mask validates all five card positions", () => {
  assert.equal(validateHoldMask(0), 0);
  assert.equal(validateHoldMask(31), 31);
  assert.equal(isCardHeld(0b10101, 0), true);
  assert.equal(isCardHeld(0b10101, 1), false);
  assert.equal(isCardHeld(0b10101, 4), true);
  assert.throws(() => validateHoldMask(32), /Invalid/);
  assert.throws(() => validateHoldMask(1.5), /Invalid/);
});

test("draw keeps held cards and consumes replacements in display order", () => {
  const deck = createShuffledDeck(() => 0);
  const initial = deck.slice(0, 5);
  const mixed = drawVideoPokerHand(initial, deck, 0b10101);
  assert.deepEqual(mixed.final, [initial[0], deck[5], initial[2], deck[6], initial[4]]);
  assert.equal(mixed.cursor, 7);
  assert.equal(mixed.replacements, 2);

  assert.deepEqual(drawVideoPokerHand(initial, deck, 31).final, initial);
  assert.deepEqual(drawVideoPokerHand(initial, deck, 0).final, deck.slice(5, 10));
});

test("committed HMAC entropy replays the identical 52-card draw", () => {
  const input = {
    serverSeed: "video-poker-server-seed",
    clientSeed: "video-poker-client-seed",
    nonce: 0,
    cursor: 0,
  };
  const shuffle = () => {
    const generator = Provable(() => undefined)({ ...input });
    return createShuffledDeck((max) => generator.ints(1, max - 1, 0)[0]);
  };
  const first = shuffle();
  const second = shuffle();
  assert.deepEqual(first, second);
  assert.deepEqual(drawVideoPokerHand(first.slice(0, 5), first, 0b01101), drawVideoPokerHand(second.slice(0, 5), second, 0b01101));
});
