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

export function custodyMarketFromEnvironment(): CustodyMarket | null {
  const source = process.env.SOLCAGE_CUSTODY_MARKET;
  if (!source) return null;
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
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
    hasSigningKey: Boolean(process.env.SOLCAGE_CUSTODY_SECRET_KEY),
    hasJupiterKey: Boolean(process.env.JUPITER_API_KEY),
  };
}

export function simulatedSaleOutput(collateralRaw: bigint, market: CustodyMarket) {
  return collateralRaw * market.simulatedPriceMicros / (10n ** BigInt(market.decimals));
}
