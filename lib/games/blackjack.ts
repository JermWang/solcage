/*
 * Blackjack rules and state transitions adapted from sbolel/blackjack-party
 * revision a81996993ea78f6bb8103f236fc5916d26bcef33 (MIT).
 * SolCage replaces browser RNG with its committed HMAC-SHA256 generator.
 */

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type PlayingCard = { suit: Suit; rank: Rank };
export const BLACKJACK_DECK_COUNT = 6;

const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createShuffledDeck(randomInt: (max: number) => number, deckCount = 1) {
  const deck = Array.from(
    { length: deckCount },
    () => suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank }))),
  ).flat();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function handValue(hand: PlayingCard[]) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      value += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      value += 10;
    } else {
      value += Number(card.rank);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }
  return value;
}

export function isBlackjack(hand: PlayingCard[]) {
  return hand.length === 2 && handValue(hand) === 21;
}

export function shouldDealerHit(hand: PlayingCard[]) {
  return handValue(hand) < 17;
}

export function settleHands(player: PlayingCard[], dealer: PlayingCard[], bet: number) {
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  const playerNatural = isBlackjack(player);
  const dealerNatural = isBlackjack(dealer);

  if (playerValue > 21) return { outcome: "loss" as const, payout: 0, label: "PLAYER BUST" };
  if (dealerValue > 21) return { outcome: "win" as const, payout: bet * 2, label: "DEALER BUST" };
  if (playerNatural && !dealerNatural) return { outcome: "win" as const, payout: bet * 2.5, label: "BLACKJACK" };
  if (dealerNatural && !playerNatural) return { outcome: "loss" as const, payout: 0, label: "DEALER BLACKJACK" };
  if (playerValue > dealerValue) return { outcome: "win" as const, payout: bet * 2, label: "PLAYER WINS" };
  if (playerValue < dealerValue) return { outcome: "loss" as const, payout: 0, label: "DEALER WINS" };
  return { outcome: "push" as const, payout: bet, label: "PUSH" };
}
