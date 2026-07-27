import { json } from "@/lib/identity";
import { collateralMarketsFromEnvironment, isSolanaPublicKey } from "@/lib/solana/markets";

export const dynamic = "force-dynamic";

export async function GET() {
  const programId = process.env.SOLCAGE_LENDING_PROGRAM_ID ?? "";
  const vaultAuthority = process.env.SOLCAGE_VAULT_AUTHORITY ?? "";
  const borrowMint = process.env.SOLCAGE_BORROW_MINT ?? "";
  const borrowDecimals = Number(process.env.SOLCAGE_BORROW_DECIMALS ?? "6");
  const serverRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const clientRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const markets = collateralMarketsFromEnvironment();
  const programConfigured = isSolanaPublicKey(programId)
    && isSolanaPublicKey(borrowMint)
    && Number.isInteger(borrowDecimals)
    && borrowDecimals >= 0
    && borrowDecimals <= 12
    && markets.some((market) => market.enabled);
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
    vaultAuthority: vaultAuthority || null,
    borrowMint: borrowMint || null,
    borrowDecimals,
    programConfigured,
    transactionMode: programConfigured ? "enabled" : "configuration-required",
    markets: markets.map((market) => ({
      symbol: market.symbol,
      mint: market.mint,
      decimals: market.decimals,
      ltvBps: market.ltvBps,
      liquidationLtvBps: market.liquidationLtvBps,
      priceFeedAccount: market.priceFeedAccount,
      tokenProgram: market.tokenProgram,
      enabled: market.enabled,
    })),
  });
}
