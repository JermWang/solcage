/*
 * Hold/draw interaction adapted from pinkkis/phaser-video-poker
 * revision 7e5be6ddceca40bd7bf581a4fed9a8ee45b51a23 (MIT).
 *
 * Full-pay 9/6 Jacks or Better evaluation and paytable adapted from
 * jaredkjar/video-poker revision 10946f9d8dcee2c5ab321ad6f01957f8c842ee40
 * (MIT). SolCage uses a committed HMAC shuffle and server settlement.
 */

import type { PlayingCard } from "@/lib/games/blackjack";

export type VideoPokerRank =
  | "royal-flush"
  | "straight-flush"
  | "four-of-a-kind"
  | "full-house"
  | "flush"
  | "straight"
  | "three-of-a-kind"
  | "two-pair"
  | "jacks-or-better"
  | "no-win";

export type VideoPokerEvaluation = {
  rank: VideoPokerRank;
  name: string;
  multiplier: number;
  paytableIndex: number;
};

export const VIDEO_POKER_HAND_SIZE = 5;
export const VIDEO_POKER_DECK_SIZE = 52;
export const VIDEO_POKER_MAX_HOLD_MASK = 31;

export const VIDEO_POKER_PAYTABLE: ReadonlyArray<VideoPokerEvaluation> = [
  { rank: "royal-flush", name: "Royal Flush", multiplier: 800, paytableIndex: 0 },
  { rank: "straight-flush", name: "Straight Flush", multiplier: 50, paytableIndex: 1 },
  { rank: "four-of-a-kind", name: "Four of a Kind", multiplier: 25, paytableIndex: 2 },
  { rank: "full-house", name: "Full House", multiplier: 9, paytableIndex: 3 },
  { rank: "flush", name: "Flush", multiplier: 6, paytableIndex: 4 },
  { rank: "straight", name: "Straight", multiplier: 4, paytableIndex: 5 },
  { rank: "three-of-a-kind", name: "Three of a Kind", multiplier: 3, paytableIndex: 6 },
  { rank: "two-pair", name: "Two Pair", multiplier: 2, paytableIndex: 7 },
  { rank: "jacks-or-better", name: "Jacks or Better", multiplier: 1, paytableIndex: 8 },
];

const rankValue: Record<PlayingCard["rank"], number> = {
  A: 14,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

const noWin: VideoPokerEvaluation = {
  rank: "no-win",
  name: "No Win",
  multiplier: 0,
  paytableIndex: -1,
};

function paid(rank: VideoPokerRank) {
  return VIDEO_POKER_PAYTABLE.find((entry) => entry.rank === rank) ?? noWin;
}

export function evaluateVideoPokerHand(hand: PlayingCard[]): VideoPokerEvaluation {
  if (hand.length !== VIDEO_POKER_HAND_SIZE) throw new Error("Video Poker requires five cards");

  const values = hand.map((card) => rankValue[card.rank]).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((card) => card.suit === hand[0].suit);
  const unique = [...counts.keys()].sort((a, b) => a - b);
  const wheel = unique.length === 5 && unique.join(",") === "2,3,4,5,14";
  const consecutive = unique.length === 5 && unique[4] - unique[0] === 4;
  const straight = wheel || consecutive;
  const royal = flush && unique.join(",") === "10,11,12,13,14";

  if (royal) return paid("royal-flush");
  if (straight && flush) return paid("straight-flush");
  if (groups[0] === 4) return paid("four-of-a-kind");
  if (groups[0] === 3 && groups[1] === 2) return paid("full-house");
  if (flush) return paid("flush");
  if (straight) return paid("straight");
  if (groups[0] === 3) return paid("three-of-a-kind");
  if (groups[0] === 2 && groups[1] === 2) return paid("two-pair");
  if (groups[0] === 2) {
    const pair = [...counts.entries()].find(([, count]) => count === 2)?.[0] ?? 0;
    if (pair >= 11) return paid("jacks-or-better");
  }
  return noWin;
}

export function validateHoldMask(holdMask: number) {
  if (!Number.isInteger(holdMask) || holdMask < 0 || holdMask > VIDEO_POKER_MAX_HOLD_MASK) {
    throw new Error("Invalid Video Poker hold mask");
  }
  return holdMask;
}

export function isCardHeld(holdMask: number, index: number) {
  validateHoldMask(holdMask);
  if (!Number.isInteger(index) || index < 0 || index >= VIDEO_POKER_HAND_SIZE) {
    throw new Error("Invalid Video Poker card index");
  }
  return Boolean(holdMask & (1 << index));
}

export function drawVideoPokerHand(
  initial: PlayingCard[],
  deck: PlayingCard[],
  holdMask: number,
  cursor = VIDEO_POKER_HAND_SIZE,
) {
  if (initial.length !== VIDEO_POKER_HAND_SIZE) throw new Error("Video Poker initial hand is incomplete");
  if (deck.length !== VIDEO_POKER_DECK_SIZE) throw new Error("Video Poker deck is incomplete");
  validateHoldMask(holdMask);
  let next = cursor;
  const final = initial.map((card, index) => {
    if (isCardHeld(holdMask, index)) return card;
    const replacement = deck[next];
    if (!replacement) throw new Error("Video Poker deck exhausted");
    next += 1;
    return replacement;
  });
  return { final, cursor: next, replacements: next - cursor };
}

export function settleVideoPokerHand(hand: PlayingCard[], bet: number) {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error("Invalid Video Poker stake");
  const evaluation = evaluateVideoPokerHand(hand);
  return {
    ...evaluation,
    outcome: evaluation.multiplier > 0 ? "win" as const : "loss" as const,
    payout: bet * evaluation.multiplier,
  };
}
