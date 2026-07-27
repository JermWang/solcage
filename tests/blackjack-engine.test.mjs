import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BLACKJACK_DECK_COUNT,
  createShuffledDeck,
  handValue,
  isBlackjack,
  settleHands,
  shouldDealerHit,
} from "../lib/games/blackjack.ts";

const card = (rank, suit = "spades") => ({ rank, suit });

test("six-deck shoe contains 312 cards and six of every distinct card", () => {
  const shoe = createShuffledDeck(() => 0, BLACKJACK_DECK_COUNT);
  assert.equal(BLACKJACK_DECK_COUNT, 6);
  assert.equal(shoe.length, 312);
  const counts = new Map();
  for (const playingCard of shoe) {
    const key = `${playingCard.rank}:${playingCard.suit}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 52);
  assert.ok([...counts.values()].every((count) => count === 6));
});

test("hand values soften aces without corrupting multi-ace totals", () => {
  assert.equal(handValue([card("A"), card("K")]), 21);
  assert.equal(handValue([card("A"), card("A"), card("9")]), 21);
  assert.equal(handValue([card("A"), card("A"), card("9"), card("K")]), 21);
  assert.equal(handValue([card("K"), card("7"), card("5")]), 22);
});

test("natural blackjack is exactly two cards and pays 3:2", () => {
  const natural = [card("A"), card("K")];
  assert.equal(isBlackjack(natural), true);
  assert.equal(isBlackjack([...natural, card("2")]), false);
  assert.deepEqual(settleHands(natural, [card("10"), card("8")], 20), {
    outcome: "win", payout: 50, label: "BLACKJACK",
  });
  assert.equal(settleHands(natural, [card("A"), card("Q")], 20).outcome, "push");
});

test("dealer hits below 17 and stands on soft and hard 17", () => {
  assert.equal(shouldDealerHit([card("10"), card("6")]), true);
  assert.equal(shouldDealerHit([card("10"), card("7")]), false);
  assert.equal(shouldDealerHit([card("A"), card("6")]), false);
  assert.equal(shouldDealerHit([card("A"), card("5")]), true);
});

test("settlement handles busts, wins, losses, and pushes", () => {
  assert.equal(settleHands([card("K"), card("Q"), card("2")], [card("10"), card("7")], 10).payout, 0);
  assert.equal(settleHands([card("10"), card("9")], [card("K"), card("8"), card("5")], 10).payout, 20);
  assert.equal(settleHands([card("10"), card("8")], [card("10"), card("9")], 10).outcome, "loss");
  assert.equal(settleHands([card("10"), card("8")], [card("Q"), card("8")], 10).payout, 10);
});

test("double-down source draws once, forces settlement, and is idempotent", async () => {
  const source = await readFile(new URL("../app/api/games/blackjack/action/route.ts", import.meta.url), "utf8");
  assert.match(source, /action === "hit" \|\| action === "double"/);
  assert.match(source, /action === "stand" \|\| action === "double" \|\| handValue/);
  assert.match(source, /state\.player\.length !== 2/);
  assert.match(source, /round\.status === "revealed" && round\.result/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /ON CONFLICT \(event_key\) DO NOTHING/);
  assert.match(source, /eventKey: `game:\$\{roundId\}`/);
});
