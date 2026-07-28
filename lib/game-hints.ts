/**
 * Beginner guidance for every table.
 *
 * Written for someone who has never played the game before: what it is in one
 * line, the exact sequence of things to do, and the one thing new players most
 * often get wrong. Kept out of the game components so the wording can be
 * reviewed in one place.
 */
export type GameHint = {
  title: string;
  /** One sentence. What is this game? */
  summary: string;
  /** Literal, in order. Each step is something to actually do. */
  steps: string[];
  /** The single most useful thing to know. */
  tip: string;
};

export const GAME_HINTS: Record<string, GameHint> = {
  "video-poker": {
    title: "How Neon Draw works",
    summary: "You get five cards, keep the ones you want, and the rest are replaced. You win if your final five make a pair of Jacks or better.",
    steps: [
      "Set your stake, then press DEAL to get five cards.",
      "Click any cards you want to KEEP — they light up as HELD. Everything you don't hold gets thrown away.",
      "Press DRAW. Your unheld cards are replaced with new ones.",
      "Your final five-card hand is paid using the paytable on the left.",
    ],
    tip: "Holding means keeping. If you're unsure, hold any pair — a pair of Jacks, Queens, Kings or Aces already pays, and lower pairs can improve to three of a kind.",
  },
  dice: {
    title: "How Neon Dice works",
    summary: "A number between 0.00 and 99.99 is rolled. You pick the line it has to land under, or over, to win.",
    steps: [
      "Pick ROLL UNDER or ROLL OVER.",
      "Drag the win-chance slider. A bigger chance pays less; a smaller chance pays more.",
      "Set your stake and press ROLL.",
    ],
    tip: "Win chance and payout always move in opposite directions. A 50% chance pays about 2×; a 5% chance pays about 20×.",
  },
  roulette: {
    title: "How Sol Spin works",
    summary: "A ball lands on one number. You bet on where it lands — a single number, or a colour or group.",
    steps: [
      "Choose a bet: a single number, or a broader one like red/black.",
      "Set your stake and spin.",
      "If the ball lands on something you covered, you're paid.",
    ],
    tip: "Single numbers pay 35× but hit rarely. Red/black or odd/even hit far more often and pay about 2× — that's the gentler place to start.",
  },
  slots: {
    title: "How Neon Vault works",
    summary: "Five reels spin and stop. Matching symbols across a line pay out.",
    steps: [
      "Set your stake.",
      "Press spin.",
      "Matching symbols are paid automatically — there's nothing to decide after the spin.",
    ],
    tip: "This is pure chance with no decisions, which makes it the simplest table on the floor if you're just getting a feel for things.",
  },
  plinko: {
    title: "How Neon Plinko works",
    summary: "A ball drops through a pyramid of pegs and lands in a slot. Each slot has its own multiplier.",
    steps: [
      "Set your stake.",
      "Drop the ball.",
      "Whatever slot it lands in is your multiplier.",
    ],
    tip: "The outside slots pay the most but are hit least often — the ball drifts toward the middle far more than it reaches the edges.",
  },
  mines: {
    title: "How Crystal Mines works",
    summary: "A grid hides crystals and mines. Every crystal you reveal raises your multiplier — but hitting a mine ends the round with nothing.",
    steps: [
      "Set your stake and start the board.",
      "Click tiles one at a time. Each crystal pushes your multiplier up.",
      "Press cash out whenever you want to keep what you've built.",
    ],
    tip: "The whole game is deciding when to stop. Cashing out after a few safe tiles is a real win — there's no bonus for clearing the board.",
  },
  crash: {
    title: "How Cage Crash works",
    summary: "A multiplier climbs from 1× upward and crashes at a random point. Cash out before it crashes and you keep the multiplier.",
    steps: [
      "Set your stake and launch the round.",
      "Watch the multiplier climb.",
      "Press cash out before it crashes. If it crashes first, the round is lost.",
    ],
    tip: "Set an auto-cashout before you start. It takes the round out of your hands and is how most players avoid holding on too long.",
  },
  keno: {
    title: "How Cage Keno works",
    summary: "You pick some numbers, then twenty are drawn. You're paid on how many of yours come up.",
    steps: [
      "Pick your numbers on the grid.",
      "Set your stake and draw.",
      "Twenty numbers are drawn; matches against your picks decide the payout.",
    ],
    tip: "Picking more numbers doesn't mean winning more — each pick count has its own paytable. Start with a small spread and see how it pays.",
  },
  blackjack: {
    title: "How Cage Blackjack works",
    summary: "Get closer to 21 than the dealer without going over. Cards are worth their number, face cards 10, aces 1 or 11.",
    steps: [
      "Set your stake and press DEAL.",
      "Choose HIT to take another card, or STAND to keep what you have.",
      "Go over 21 and you lose the hand. Otherwise the dealer plays and the closer hand wins.",
    ],
    tip: "If your total is 11 or lower you cannot possibly bust, so taking a card is always safe there.",
  },
  baccarat: {
    title: "How Cage Baccarat works",
    summary: "Two hands are dealt — Player and Banker. You bet on which will be closer to 9. You aren't either hand.",
    steps: [
      "Bet on PLAYER, BANKER, or TIE.",
      "Set your stake and deal.",
      "Both hands are drawn by fixed rules — nothing is left for you to decide.",
    ],
    tip: "Banker wins slightly more often than Player, and Tie pays big but lands rarely. There are no decisions after the deal, so it's an easy one to learn.",
  },
};

export function gameHint(id: string): GameHint | null {
  return GAME_HINTS[id] ?? null;
}
