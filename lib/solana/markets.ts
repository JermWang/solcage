import bs58 from "bs58";

export const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SPL_TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type CollateralMarket = {
  symbol: string;
  mint: string;
  decimals: number;
  ltvBps: number;
  liquidationLtvBps: number;
  priceFeedAccount: string;
  priceFeedId: string;
  tokenProgram: string;
  enabled: boolean;
};

function isPublicKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null;
}

export function isSolanaPublicKey(value: unknown): value is string {
  return isPublicKey(value);
}

export function collateralMarketsFromEnvironment(): CollateralMarket[] {
  const source = process.env.SOLCAGE_COLLATERAL_MARKETS;
  if (!source) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const markets: CollateralMarket[] = [];
  const seenMints = new Set<string>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const symbol = typeof entry.symbol === "string" ? entry.symbol.trim().toUpperCase() : "";
    const decimals = boundedInteger(entry.decimals, 0, 12);
    const ltvBps = boundedInteger(entry.ltvBps, 1, 5_000);
    const liquidationLtvBps = boundedInteger(entry.liquidationLtvBps, 2, 8_000);
    const tokenProgram = entry.tokenProgram ?? SPL_TOKEN_PROGRAM_ID;
    const priceFeedId = typeof entry.priceFeedId === "string"
      ? entry.priceFeedId.replace(/^0x/, "").toLowerCase()
      : "";

    if (
      !/^[A-Z0-9]{2,16}$/.test(symbol)
      || !isPublicKey(entry.mint)
      || !isPublicKey(entry.priceFeedAccount)
      || !isPublicKey(tokenProgram)
      || decimals === null
      || ltvBps === null
      || liquidationLtvBps === null
      || liquidationLtvBps <= ltvBps
      || !/^[0-9a-f]{64}$/.test(priceFeedId)
      || seenMints.has(entry.mint)
    ) {
      continue;
    }

    seenMints.add(entry.mint);
    markets.push({
      symbol,
      mint: entry.mint,
      decimals,
      ltvBps,
      liquidationLtvBps,
      priceFeedAccount: entry.priceFeedAccount,
      priceFeedId,
      tokenProgram,
      enabled: entry.enabled !== false,
    });
  }
  return markets;
}
