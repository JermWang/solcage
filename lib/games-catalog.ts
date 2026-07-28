/**
 * Canonical list of playable games, in one place so counts shown to players
 * cannot drift from what is actually on the floor.
 */
export const GAME_IDS = [
  "roulette",
  "baccarat",
  "video-poker",
  "dice",
  "slots",
  "plinko",
  "blackjack",
  "mines",
  "crash",
  "keno",
] as const;

/** Ids withheld from the floor. NEXT_PUBLIC_ so client and server agree. */
export function hiddenGameIds(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_SOLCAGE_HIDDEN_GAMES ?? "";
  return new Set(raw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
}

/** Games a player can actually open right now. */
export function visibleGameCount(): number {
  const hidden = hiddenGameIds();
  return GAME_IDS.filter((id) => !hidden.has(id)).length;
}

/** Zero-padded to two digits to match the marquee styling ("09"). */
export function visibleGameCountLabel(): string {
  return String(visibleGameCount()).padStart(2, "0");
}
