import { PublicKey } from "@solana/web3.js";

export const CLASSIC_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type CustodyMarket = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  advanceBps: number;
  simulatedPriceMicros: bigint;
  maxPositionRaw: bigint;
  maxActiveLiabilityRaw: bigint;
  enabled: boolean;
};

export type CustodySwapMode = "simulated" | "jupiter";

function publicKey(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return new PublicKey(value).toBase58() === value ? value : null;
  } catch {
    return null;
  }
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

/** Validate one market entry. Returns null if anything is off — never throws. */
function parseMarket(value: Record<string, unknown>): CustodyMarket | null {
  try {
    const mint = publicKey(value.mint);
    const tokenProgram = publicKey(value.tokenProgram ?? CLASSIC_TOKEN_PROGRAM_ID);
    const decimals = integer(value.decimals, 0, 12);
    const advanceBps = integer(value.advanceBps, 1, 5_000);
    const simulatedPriceMicros = BigInt(String(value.simulatedPriceMicros ?? "0"));
    const maxPositionRaw = BigInt(String(value.maxPositionRaw ?? "0"));
    const maxActiveLiabilityRaw = BigInt(String(value.maxActiveLiabilityRaw ?? "0"));
    if (
      typeof value.symbol !== "string"
      || !/^[A-Z0-9]{2,16}$/.test(value.symbol)
      || typeof value.name !== "string"
      || value.name.length < 2
      || value.name.length > 48
      || !mint
      || !tokenProgram
      || decimals === null
      || advanceBps === null
      || simulatedPriceMicros <= 0n
      || maxPositionRaw <= 0n
      || maxActiveLiabilityRaw < maxPositionRaw
    ) return null;
    return {
      symbol: value.symbol,
      name: value.name,
      mint,
      decimals,
      tokenProgram,
      advanceBps,
      simulatedPriceMicros,
      maxPositionRaw,
      maxActiveLiabilityRaw,
      enabled: value.enabled === true,
    };
  } catch {
    return null;
  }
}

/**
 * All configured collateral markets.
 *
 * SOLCAGE_CUSTODY_MARKET accepts either a single object (the original launch
 * shape, still supported) or an array of them. Entries that fail validation are
 * dropped rather than taking the whole list down, and a duplicate mint keeps
 * only its first entry so a copy-paste slip cannot create two markets that
 * share a liability cap.
 */
export function custodyMarketsFromEnvironment(): CustodyMarket[] {
  const source = process.env.SOLCAGE_CUSTODY_MARKET;
  if (!source) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const markets: CustodyMarket[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const market = parseMarket(entry as Record<string, unknown>);
    if (!market || seen.has(market.mint)) continue;
    seen.add(market.mint);
    markets.push(market);
  }
  return markets;
}

/** Markets a player can actually post right now. */
export function enabledCustodyMarkets(): CustodyMarket[] {
  return custodyMarketsFromEnvironment().filter((market) => market.enabled);
}

/** Look up a market by mint, only among enabled ones. */
export function custodyMarketByMint(mint: unknown): CustodyMarket | null {
  if (typeof mint !== "string") return null;
  return enabledCustodyMarkets().find((market) => market.mint === mint) ?? null;
}

/**
 * The default market: the first enabled one, else the first configured. Kept so
 * single-market callers and existing copy keep working.
 */
export function custodyMarketFromEnvironment(): CustodyMarket | null {
  const markets = custodyMarketsFromEnvironment();
  return markets.find((market) => market.enabled) ?? markets[0] ?? null;
}

export function custodyRuntimeConfig() {
  const network = process.env.SOLANA_NETWORK ?? "mainnet-beta";
  const swapMode: CustodySwapMode =
    process.env.SOLCAGE_CUSTODY_SWAP_MODE === "jupiter" ? "jupiter" : "simulated";
  return {
    network,
    rpcUrl: process.env.SOLANA_RPC_URL ?? (
      network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"
    ),
    clientRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? (
      network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"
    ),
    enabled: process.env.SOLCAGE_CUSTODY_ENABLED === "true",
    custodyAddress: publicKey(process.env.SOLCAGE_CUSTODY_WALLET),
    usdcMint: publicKey(process.env.SOLCAGE_CUSTODY_USDC_MINT) ?? MAINNET_USDC_MINT,
    usdcDecimals: integer(process.env.SOLCAGE_CUSTODY_USDC_DECIMALS ?? "6", 0, 12) ?? 6,
    usdcTokenProgram: publicKey(process.env.SOLCAGE_CUSTODY_USDC_TOKEN_PROGRAM)
      ?? CLASSIC_TOKEN_PROGRAM_ID,
    swapMode,
    market: custodyMarketFromEnvironment(),
    markets: custodyMarketsFromEnvironment(),
    hasSigningKey: Boolean(process.env.SOLCAGE_CUSTODY_SECRET_KEY),
    hasJupiterKey: Boolean(process.env.JUPITER_API_KEY),
  };
}

export function simulatedSaleOutput(collateralRaw: bigint, market: CustodyMarket) {
  return collateralRaw * market.simulatedPriceMicros / (10n ** BigInt(market.decimals));
}
