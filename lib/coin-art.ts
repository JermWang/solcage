/**
 * Token artwork by symbol, in one place so the landing carousel and the lending
 * collateral table always show the same picture for the same coin. Extensions
 * differ per file, which is why this is a lookup rather than a built path.
 */
const COIN_ART: Record<string, string> = {
  FARTCOIN: "/coin-art/fartcoin.webp",
  BONK: "/coin-art/bonk.webp",
  WIF: "/coin-art/wif.jpg",
  PENGU: "/coin-art/pengu.webp",
  POPCAT: "/coin-art/popcat.webp",
  SOLCAGE: "/media/solcage-pfp.png",
};

/** Artwork for a token, falling back to the SolCage mark for anything unknown. */
export function coinArt(symbol: string): string {
  return COIN_ART[symbol?.toUpperCase()] ?? "/media/solcage-pfp.png";
}
