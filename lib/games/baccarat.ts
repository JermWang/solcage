/*
 * Eight-deck Baccarat shoe structure informed by namanadlakha3/
 * An-Application-based-on-Probability-Prediction-using-Randomization-Algorithms
 * revision 4ed8bd9e8aebdbb7ee9fa4d858a55978afce5d1b (MIT).
 *
 * Punto Banco draw rules follow Pennsylvania Code 58 Pa. Code § 631a.11.
 * SolCage replaces the source simulator's RNG with committed HMAC-SHA256
 * entropy and settles every wager on the server.
 */

import type { PlayingCard, Rank, Suit } from "@/lib/games/blackjack";

export type BaccaratSelection = "player" | "banker" | "tie";
export type BaccaratWinner = BaccaratSelection;
export type BaccaratOutcome = "win" | "loss" | "push";

export type BaccaratDeal = {
  player: PlayingCard[];
  banker: PlayingCard[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  natural: boolean;
  playerDrewThird: boolean;
  bankerDrewThird: boolean;
  cardsDealt: number;
};

const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const BACCARAT_DECK_COUNT = 8;
export const BACCARAT_SHOE_SIZE = BACCARAT_DECK_COUNT * 52;

export function createBaccaratShoe(
  randomInt: (max: number) => number,
  deckCount = BACCARAT_DECK_COUNT,
) {
  if (!Number.isInteger(deckCount) || deckCount < 1) throw new Error("Invalid Baccarat deck count");
  const shoe: PlayingCard[] = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of suits) {
      for (const rank of ranks) shoe.push({ suit, rank });
    }
  }
  for (let index = shoe.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
      throw new Error("Baccarat shuffle returned an out-of-range index");
    }
    [shoe[index], shoe[swapIndex]] = [shoe[swapIndex], shoe[index]];
  }
  return shoe;
}

export function baccaratCardPoint(card: PlayingCard) {
  if (card.rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(card.rank)) return 0;
  return Number(card.rank);
}

export function baccaratHandTotal(hand: PlayingCard[]) {
  return hand.reduce((total, card) => total + baccaratCardPoint(card), 0) % 10;
}

export function shouldPlayerDraw(playerTotal: number) {
  return playerTotal <= 5;
}

export function shouldBankerDraw(bankerTotal: number, playerThirdPoint: number | null) {
  if (playerThirdPoint === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThirdPoint !== 8;
  if (bankerTotal === 4) return playerThirdPoint >= 2 && playerThirdPoint <= 7;
  if (bankerTotal === 5) return playerThirdPoint >= 4 && playerThirdPoint <= 7;
  if (bankerTotal === 6) return playerThirdPoint === 6 || playerThirdPoint === 7;
  return false;
}

export function dealBaccarat(shoe: PlayingCard[]): BaccaratDeal {
  if (shoe.length < 6) throw new Error("Baccarat shoe needs at least six cards");

  const player: PlayingCard[] = [shoe[0], shoe[2]];
  const banker: PlayingCard[] = [shoe[1], shoe[3]];
  let cursor = 4;
  const openingPlayerTotal = baccaratHandTotal(player);
  const openingBankerTotal = baccaratHandTotal(banker);
  const natural = openingPlayerTotal >= 8 || openingBankerTotal >= 8;
  let playerDrewThird = false;
  let bankerDrewThird = false;

  if (!natural) {
    let playerThirdPoint: number | null = null;
    if (shouldPlayerDraw(openingPlayerTotal)) {
      const third = shoe[cursor];
      cursor += 1;
      player.push(third);
      playerThirdPoint = baccaratCardPoint(third);
      playerDrewThird = true;
    }
    if (shouldBankerDraw(openingBankerTotal, playerThirdPoint)) {
      banker.push(shoe[cursor]);
      cursor += 1;
      bankerDrewThird = true;
    }
  }

  const playerTotal = baccaratHandTotal(player);
  const bankerTotal = baccaratHandTotal(banker);
  const winner: BaccaratWinner = playerTotal === bankerTotal
    ? "tie"
    : playerTotal > bankerTotal
      ? "player"
      : "banker";

  return {
    player,
    banker,
    playerTotal,
    bankerTotal,
    winner,
    natural,
    playerDrewThird,
    bankerDrewThird,
    cardsDealt: cursor,
  };
}

export function settleBaccarat(
  bet: number,
  selection: BaccaratSelection,
  winner: BaccaratWinner,
) {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error("Invalid Baccarat stake");

  if (winner === "tie" && selection !== "tie") {
    return {
      outcome: "push" as const,
      payout: bet,
      label: "TIE / STAKE RETURNED",
      returnMultiplier: 1,
    };
  }
  if (selection !== winner) {
    return {
      outcome: "loss" as const,
      payout: 0,
      label: `${winner.toUpperCase()} WINS`,
      returnMultiplier: 0,
    };
  }

  const returnMultiplier = winner === "banker" ? 1.95 : winner === "tie" ? 9 : 2;
  return {
    outcome: "win" as const,
    payout: bet * returnMultiplier,
    label: winner === "banker" ? "BANKER WINS / 5% COMMISSION" : `${winner.toUpperCase()} WINS`,
    returnMultiplier,
  };
}
