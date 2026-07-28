import { VIDEO_POKER_PAYTABLE } from "./games/videoPoker.ts";
import { KENO_PAYTABLE } from "./games/keno.ts";

/**
 * Full rules for each table, written for someone reading them for the first
 * time — and, where a paytable exists, generated from the same constants the
 * settlement engine uses, so what a player is shown can never drift from what
 * they are actually paid.
 */
export type RulesSection = {
  heading: string;
  body?: string;
  list?: string[];
  table?: { columns: [string, string]; rows: Array<[string, string]> };
};

export type GameRules = {
  title: string;
  variant: string;
  /** Long-run return to player, stated plainly. */
  rtp: string;
  sections: RulesSection[];
};

/** Every round is committed before you act and revealed after. Same for all games. */
const FAIRNESS: RulesSection = {
  heading: "How to check the round was fair",
  body:
    "Before you act, the server generates a secret seed and shows you its SHA-256 hash. It cannot change the seed afterwards without the hash no longer matching. Your own client seed is mixed in, so neither side alone decides the outcome. After the round the server reveals the seed — hash it yourself and confirm it matches what you were shown, then re-derive the result. Every settled round on this site keeps its proof.",
};

const HOUSE_EDGE_NOTE: RulesSection = {
  heading: "What the house edge means",
  body:
    "The return figure is a long-run average across many rounds, not a promise about your session. A 98% return means the house keeps about 2% of everything staked over time. Any single session can land well above or well below that in either direction — short runs are dominated by variance, not by the percentage.",
};

const HAND_RANKINGS: Array<[string, string]> = [
  ["Royal Flush", "10, J, Q, K, A — all the same suit"],
  ["Straight Flush", "Five in a row, all the same suit"],
  ["Four of a Kind", "Four cards of the same rank"],
  ["Full House", "Three of one rank plus a pair"],
  ["Flush", "Any five cards of the same suit"],
  ["Straight", "Five in a row, any suits"],
  ["Three of a Kind", "Three cards of the same rank"],
  ["Two Pair", "Two separate pairs"],
  ["Jacks or Better", "One pair, but only Jacks, Queens, Kings or Aces"],
];

function videoPokerPayRows(): Array<[string, string]> {
  return VIDEO_POKER_PAYTABLE.map((entry) => [entry.name, `${entry.multiplier}× your stake`]);
}

function kenoPayRows(): Array<[string, string]> {
  return Object.entries(KENO_PAYTABLE).map(([picks, payouts]) => {
    const paying = payouts
      .map((value, hits) => (value > 0 ? `${hits} hits pays ${value}×` : null))
      .filter(Boolean)
      .join(" · ");
    return [`Picking ${picks} numbers`, paying || "No paying combinations"];
  });
}

export const GAME_RULES: Record<string, GameRules> = {
  "video-poker": {
    title: "Neon Draw",
    variant: "9/6 Jacks or Better",
    rtp: "99.54% with perfect play — the highest return on the floor",
    sections: [
      {
        heading: "The idea",
        body: "You are dealt five cards. You choose which to keep, the rest are replaced once, and your final five cards are paid according to the paytable. You are not playing against a dealer or other players — you are only trying to make one of the paying hands below.",
      },
      {
        heading: "Playing a round",
        list: [
          "Set your stake and press DEAL. Five cards appear.",
          "Click any card you want to KEEP. It lights up as HELD. This is not a bet — it means 'do not replace this card'.",
          "Cards you do not hold are discarded when you press DRAW, and replaced with new ones.",
          "Press DRAW. Your final five cards are compared to the paytable and paid automatically.",
        ],
      },
      {
        heading: "What pays",
        body: "Anything below a pair of Jacks pays nothing. A pair of 10s or lower is not a winning hand — this is the single most common surprise for new players.",
        table: { columns: ["Hand", "Pays"], rows: videoPokerPayRows() },
      },
      {
        heading: "What each hand means",
        table: { columns: ["Hand", "What it is"], rows: HAND_RANKINGS },
      },
      {
        heading: "If you are not sure what to hold",
        list: [
          "Holding a paying hand you already have is never wrong.",
          "With any pair, hold the pair and draw three.",
          "With four cards to a flush or straight, hold those four and draw one.",
          "With nothing at all, holding no cards and drawing five is a normal, correct play.",
        ],
      },
      HOUSE_EDGE_NOTE,
      FAIRNESS,
    ],
  },

  dice: {
    title: "Neon Dice",
    variant: "Provably fair dice",
    rtp: "98%",
    sections: [
      {
        heading: "The idea",
        body: "A number between 0.00 and 99.99 is rolled. You choose a line and whether the roll has to land under or over it.",
      },
      {
        heading: "Playing a round",
        list: [
          "Choose ROLL UNDER or ROLL OVER.",
          "Move the win-chance slider to set your line.",
          "Set your stake and roll. If the number lands on your side of the line, you are paid.",
        ],
      },
      {
        heading: "Chance and payout",
        body: "These always move in opposite directions. Roughly: a 50% chance pays about 1.96×, a 25% chance about 3.92×, a 5% chance about 19.6×. Picking a smaller chance does not improve your long-run return — it only changes how often you win and how much you win when you do.",
      },
      HOUSE_EDGE_NOTE,
      FAIRNESS,
    ],
  },

  roulette: {
    title: "Sol Spin",
    variant: "European roulette — single zero",
    rtp: "97.30%",
    sections: [
      {
        heading: "The idea",
        body: "A wheel of 37 pockets — 1 to 36 plus a single zero — is spun and the ball lands in one. You bet on where it will land. Single zero matters: European wheels have one zero, not two, which makes the return better than an American wheel.",
      },
      {
        heading: "Playing a round",
        list: [
          "Choose what to back — a single number, or a group such as red/black, odd/even, or high/low.",
          "Set your stake and spin.",
          "If the ball lands in a pocket your bet covers, you are paid.",
        ],
      },
      {
        heading: "What pays",
        table: {
          columns: ["Bet", "Pays"],
          rows: [
            ["Single number", "35 to 1"],
            ["Red / black, odd / even, high / low", "1 to 1"],
            ["Zero", "Only single-number bets on zero win — even-money bets lose"],
          ],
        },
      },
      HOUSE_EDGE_NOTE,
      FAIRNESS,
    ],
  },

  blackjack: {
    title: "Cage Blackjack",
    variant: "Single hand — no split, double only where offered, no insurance",
    rtp: "Depends on your decisions; near 99% with sound play",
    sections: [
      {
        heading: "The idea",
        body: "Get closer to 21 than the dealer without going over. Number cards are worth their number, face cards are 10, and an ace is 1 or 11 — whichever helps you.",
      },
      {
        heading: "Playing a hand",
        list: [
          "Set your stake and press DEAL.",
          "HIT takes another card. STAND keeps what you have.",
          "Going over 21 is a bust and loses immediately, before the dealer plays.",
          "If you stand, the dealer draws to their fixed rule and the closer total wins.",
        ],
      },
      {
        heading: "Two things worth knowing",
        list: [
          "On 11 or lower you cannot bust, so taking a card is always safe.",
          "The dealer must keep drawing to a set total — they have no choice, so there is nothing to read.",
        ],
      },
      FAIRNESS,
    ],
  },

  baccarat: {
    title: "Cage Baccarat",
    variant: "Eight-deck punto banco",
    rtp: "About 98.9% on banker, 98.8% on player",
    sections: [
      {
        heading: "The idea",
        body: "Two hands are dealt — Player and Banker. You are neither of them. You simply bet on which will finish closer to 9. Both hands are then drawn by fixed rules with no decisions from anyone.",
      },
      {
        heading: "Playing a round",
        list: [
          "Bet on PLAYER, BANKER, or TIE.",
          "Set your stake and deal.",
          "Cards are drawn automatically and the closer hand to 9 wins.",
        ],
      },
      {
        heading: "Which bet to make",
        body: "Banker wins slightly more often than Player and is the better of the two. Tie pays much more but lands rarely and has a considerably worse return — it is the expensive bet on the table.",
      },
      FAIRNESS,
    ],
  },

  mines: {
    title: "Crystal Mines",
    variant: "Provably fair grid",
    rtp: "97%",
    sections: [
      {
        heading: "The idea",
        body: "A grid hides crystals and mines. Every crystal you uncover raises your multiplier. Uncover a mine and the round ends with nothing.",
      },
      {
        heading: "Playing a round",
        list: [
          "Set your stake and start the board.",
          "Reveal tiles one at a time. Each safe tile increases what you would collect.",
          "Press cash out at any point to bank the current amount and end the round.",
        ],
      },
      {
        heading: "The only real decision",
        body: "When to stop. Every additional tile is worth more but is riskier than the last, and there is no bonus for clearing the board. Deciding your cash-out point before you start is how most players avoid pushing one tile too far.",
      },
      HOUSE_EDGE_NOTE,
      FAIRNESS,
    ],
  },

  crash: {
    title: "Cage Crash",
    variant: "Server-timed multiplier",
    rtp: "99%",
    sections: [
      {
        heading: "The idea",
        body: "A multiplier starts at 1× and climbs. At a random point it crashes. If you cash out before the crash you keep your stake multiplied by wherever you stopped. If you do not, the round is lost.",
      },
      {
        heading: "Playing a round",
        list: [
          "Set your stake, and optionally an auto-cashout multiplier.",
          "Launch the round and watch the multiplier climb.",
          "Cash out before it crashes.",
        ],
      },
      {
        heading: "Use auto-cashout",
        body: "Setting an auto-cashout before you start takes the decision out of the moment. The crash point is already fixed before the round begins — waiting longer does not make it more 'due' to keep climbing.",
      },
      FAIRNESS,
    ],
  },

  plinko: {
    title: "Neon Plinko",
    variant: "Provably fair drop",
    rtp: "97%",
    sections: [
      {
        heading: "The idea",
        body: "A ball falls through a field of pegs, bouncing left or right at each one, and lands in a slot at the bottom. Each slot carries its own multiplier.",
      },
      {
        heading: "Playing a round",
        list: ["Set your stake.", "Drop the ball.", "The slot it lands in is your multiplier — there is nothing to decide after the drop."],
      },
      {
        heading: "Why the edges pay more",
        body: "Reaching an outer slot needs almost every bounce to go the same way, which is rare. The middle slots are hit far more often and pay far less. That shape is the game — the big multipliers exist precisely because they seldom land.",
      },
      FAIRNESS,
    ],
  },

  keno: {
    title: "Cage Keno",
    variant: "Verified draw",
    rtp: "About 97%",
    sections: [
      {
        heading: "The idea",
        body: "You choose between 5 and 10 numbers. Twenty numbers are then drawn, and you are paid on how many of yours appear.",
      },
      {
        heading: "Playing a round",
        list: ["Pick your numbers on the grid.", "Set your stake and draw.", "Twenty numbers are drawn; your matches decide the payout."],
      },
      {
        heading: "What pays, by how many you pick",
        body: "Each pick count has its own paytable. Picking more numbers is not automatically better — it raises the number of hits you need before anything pays at all.",
        table: { columns: ["Your picks", "Paying hits"], rows: kenoPayRows() },
      },
      FAIRNESS,
    ],
  },

  slots: {
    title: "Neon Vault",
    variant: "Five-reel slot",
    rtp: "96.03%",
    sections: [
      {
        heading: "The idea",
        body: "Five reels spin and stop. Matching symbols along a payline pay out. There are no decisions once the reels are spinning.",
      },
      {
        heading: "Playing a round",
        list: ["Set your stake.", "Spin.", "Any winning lines are paid automatically."],
      },
      {
        heading: "Worth knowing",
        body: "Reels are not 'due'. Each spin is generated independently from that round's seeds, so a long run without a win does not make the next spin more likely to pay.",
      },
      HOUSE_EDGE_NOTE,
      FAIRNESS,
    ],
  },
};

export function gameRules(id: string): GameRules | null {
  return GAME_RULES[id] ?? null;
}
