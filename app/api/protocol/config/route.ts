import { json } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const programId = process.env.SOLCAGE_LENDING_PROGRAM_ID ?? "";
  const vaultAuthority = process.env.SOLCAGE_VAULT_AUTHORITY ?? "";
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const programConfigured = Boolean(programId && vaultAuthority);

  return json({
    network: process.env.SOLANA_NETWORK ?? "mainnet-beta",
    rpcHost: new URL(rpcUrl).host,
    programId: programId || null,
    vaultAuthority: vaultAuthority || null,
    programConfigured,
    transactionMode: programConfigured ? "read-only" : "configuration-required",
  });
}
