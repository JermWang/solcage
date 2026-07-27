import assert from "node:assert/strict";
import test from "node:test";
import { Provable } from "@provableio/provable-core";
import {
  BACCARAT_SHOE_SIZE,
  baccaratCardPoint,
  baccaratHandTotal,
  createBaccaratShoe,
  dealBaccarat,
  settleBaccarat,
  shouldBankerDraw,
  shouldPlayerDraw,
} from "../lib/games/baccarat.ts";

const suit = "spades";
const card = (rank) => ({ rank, suit });

test("eight-deck shoe contains 416 cards with eight copies of every card", () => {
  const shoe = createBaccaratShoe(() => 0);
  assert.equal(shoe.length, BACCARAT_SHOE_SIZE);
  const counts = new Map();
  for (const item of shoe) {
    const key = `${item.rank}-${item.suit}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 52);
  assert.ok([...counts.values()].every((count) => count === 8));
});

test("Baccarat card points and modulo-ten hand totals are exact", () => {
  assert.equal(baccaratCardPoint(card("A")), 1);
  for (const rank of ["10", "J", "Q", "K"]) assert.equal(baccaratCardPoint(card(rank)), 0);
  assert.equal(baccaratHandTotal([card("9"), card("7"), card("K")]), 6);
  assert.equal(baccaratHandTotal([card("A"), card("2"), card("6")]), 9);
});

test("player and banker third-card tables cover every regulated branch", () => {
  for (let total = 0; total <= 9; total += 1) {
    assert.equal(shouldPlayerDraw(total), total <= 5);
    assert.equal(shouldBankerDraw(total, null), total <= 5);
  }
  for (let third = 0; third <= 9; third += 1) {
    assert.equal(shouldBankerDraw(2, third), true);
    assert.equal(shouldBankerDraw(3, third), third !== 8);
    assert.equal(shouldBankerDraw(4, third), third >= 2 && third <= 7);
    assert.equal(shouldBankerDraw(5, third), third >= 4 && third <= 7);
    assert.equal(shouldBankerDraw(6, third), third === 6 || third === 7);
    assert.equal(shouldBankerDraw(7, third), false);
  }
});

test("natural eight or nine ends the hand after four cards", () => {
  const result = dealBaccarat([
    card("9"), card("7"), card("K"), card("Q"), card("2"), card("3"),
  ]);
  assert.equal(result.natural, true);
  assert.equal(result.cardsDealt, 4);
  assert.equal(result.playerDrewThird, false);
  assert.equal(result.bankerDrewThird, false);
  assert.equal(result.winner, "player");
});

test("player stand and player third-card paths govern the banker draw", () => {
  const playerStands = dealBaccarat([
    card("6"), card("2"), card("K"), card("3"), card("4"), card("9"),
  ]);
  assert.equal(playerStands.playerDrewThird, false);
  assert.equal(playerStands.bankerDrewThird, true);
  assert.equal(playerStands.cardsDealt, 5);
  assert.equal(playerStands.bankerTotal, 9);

  const bankerStandsOnEight = dealBaccarat([
    card("2"), card("A"), card("3"), card("2"), card("8"), card("9"),
  ]);
  assert.equal(bankerStandsOnEight.playerDrewThird, true);
  assert.equal(bankerStandsOnEight.bankerDrewThird, false);
  assert.equal(bankerStandsOnEight.cardsDealt, 5);
});

test("Player, Banker, Tie, and tie-push payouts include the original stake", () => {
  assert.deepEqual(settleBaccarat(100, "player", "player"), {
    outcome: "win", payout: 200, label: "PLAYER WINS", returnMultiplier: 2,
  });
  assert.deepEqual(settleBaccarat(100, "banker", "banker"), {
    outcome: "win", payout: 195, label: "BANKER WINS / 5% COMMISSION", returnMultiplier: 1.95,
  });
  assert.deepEqual(settleBaccarat(100, "tie", "tie"), {
    outcome: "win", payout: 900, label: "TIE WINS", returnMultiplier: 9,
  });
  assert.deepEqual(settleBaccarat(100, "player", "tie"), {
    outcome: "push", payout: 100, label: "TIE / STAKE RETURNED", returnMultiplier: 1,
  });
  assert.equal(settleBaccarat(100, "tie", "banker").payout, 0);
});

test("committed HMAC entropy replays the identical 416-card shoe and hand", () => {
  const input = {
    serverSeed: "baccarat-server-seed",
    clientSeed: "baccarat-client-seed",
    nonce: 0,
    cursor: 0,
  };
  const shuffle = () => {
    const generator = Provable(() => undefined)({ ...input });
    return createBaccaratShoe((max) => generator.ints(1, max - 1, 0)[0]);
  };
  const first = shuffle();
  const second = shuffle();
  assert.deepEqual(first, second);
  assert.deepEqual(dealBaccarat(first), dealBaccarat(second));
});
