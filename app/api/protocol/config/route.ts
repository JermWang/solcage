import { json } from "@/lib/identity";
import {
  collateralMarketsFromEnvironment,
  SPL_TOKEN_PROGRAM_ID,
} from "@/lib/solana/markets";
import { cachedProtocolReadiness } from "@/lib/solana/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const programId = process.env.SOLCAGE_LENDING_PROGRAM_ID ?? "";
  const borrowMint = process.env.SOLCAGE_BORROW_MINT ?? "";
  const borrowDecimals = Number(process.env.SOLCAGE_BORROW_DECIMALS ?? "6");
  const borrowTokenProgram = process.env.SOLCAGE_BORROW_TOKEN_PROGRAM ?? SPL_TOKEN_PROGRAM_ID;
  const serverRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const clientRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const markets = collateralMarketsFromEnvironment().filter((market) => market.enabled);
  const readiness = await cachedProtocolReadiness({
    rpcUrl: serverRpcUrl,
    programId,
    borrowMint,
    borrowDecimals,
    borrowTokenProgram,
    markets,
  });
  let rpcHost = "api.mainnet-beta.solana.com";
  try {
    rpcHost = new URL(serverRpcUrl).host;
  } catch {
    // Keep the public fallback host without returning a potentially malformed secret value.
  }

  return json({
    network: process.env.SOLANA_NETWORK ?? "mainnet-beta",
    rpcHost,
    clientRpcUrl,
    programId: programId || null,
    protocolAddress: readiness.protocolAddress,
    liquidityVault: readiness.liquidityVault,
    borrowMint: borrowMint || null,
    borrowDecimals,
    borrowTokenProgram,
    programConfigured: readiness.ready,
    transactionMode: readiness.ready ? "enabled" : readiness.state,
    readiness,
    markets: markets.map((market) => ({
      symbol: market.symbol,
      mint: market.mint,
      decimals: market.decimals,
      ltvBps: market.ltvBps,
      liquidationLtvBps: market.liquidationLtvBps,
      priceFeedAccount: market.priceFeedAccount,
      priceFeedId: market.priceFeedId,
      priceFeedShardId: market.priceFeedShardId,
      tokenProgram: market.tokenProgram,
      enabled: market.enabled,
      attested: readiness.markets.find((attestation) => attestation.symbol === market.symbol)?.ready ?? false,
      marketAddress: readiness.markets.find((attestation) => attestation.symbol === market.symbol)?.marketAddress ?? null,
      collateralVault: readiness.markets.find((attestation) => attestation.symbol === market.symbol)?.collateralVault ?? null,
    })),
  });
}
