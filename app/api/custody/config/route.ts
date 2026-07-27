import { Connection, PublicKey } from "@solana/web3.js";
import { json } from "@/lib/identity";
import { custodyRuntimeConfig } from "@/lib/custody/config";
import { maybeProxyCustody } from "@/lib/custody/proxy";
import { associatedTokenAddress, custodySigner } from "@/lib/custody/solana";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const proxied = await maybeProxyCustody(request);
  if (proxied) return proxied;
  const config = custodyRuntimeConfig();
  const checks: Array<{ key: string; label: string; status: "pass" | "fail"; detail: string }> = [];
  const check = (key: string, label: string, passed: boolean, detail: string) => {
    checks.push({ key, label, status: passed ? "pass" : "fail", detail });
  };
  check("operator-enabled", "Custody operator switch", config.enabled, config.enabled ? "Enabled" : "Disabled");
  check(
    "custody-wallet",
    "Custody wallet",
    Boolean(config.custodyAddress),
    config.custodyAddress ?? "Not configured",
  );
  let signerReady = false;
  try {
    signerReady = custodySigner().publicKey.toBase58() === config.custodyAddress;
  } catch {
    signerReady = false;
  }
  check(
    "signing-key",
    "Custody signer",
    signerReady,
    signerReady ? "Server-side signer matches custody wallet" : "Signer missing or mismatched",
  );
  check(
    "market-config",
    "Collateral market",
    Boolean(config.market?.enabled),
    config.market?.enabled ? `${config.market.symbol} configuration loaded` : "No enabled custody market",
  );
  const swapReady = config.swapMode === "simulated"
    ? config.network === "devnet"
    : config.network === "mainnet-beta" && config.hasJupiterKey;
  check(
    "swap-adapter",
    "Swap execution",
    swapReady,
    config.swapMode === "simulated"
      ? (swapReady ? "Devnet deterministic adapter" : "Simulation is restricted to devnet")
      : (config.hasJupiterKey ? "Jupiter Swap V2 configured" : "Jupiter API key unavailable"),
  );

  let rpcHost = "unavailable";
  try {
    rpcHost = new URL(config.rpcUrl).host;
  } catch {
    // Do not echo malformed or secret RPC values.
  }
  if (config.custodyAddress && config.market) {
    try {
      const connection = new Connection(config.rpcUrl, "confirmed");
      const custody = new PublicKey(config.custodyAddress);
      const marketMint = new PublicKey(config.market.mint);
      const marketProgram = new PublicKey(config.market.tokenProgram);
      const usdcMint = new PublicKey(config.usdcMint);
      const usdcProgram = new PublicKey(config.usdcTokenProgram);
      const [walletBalance, accounts] = await Promise.all([
        connection.getBalance(custody, "confirmed"),
        connection.getMultipleAccountsInfo([
          marketMint,
          usdcMint,
          associatedTokenAddress(marketMint, custody, marketProgram),
          associatedTokenAddress(usdcMint, custody, usdcProgram),
        ], "confirmed"),
      ]);
      const [marketMintAccount, usdcMintAccount, collateralAccount, usdcAccount] = accounts;
      check(
        "market-mint",
        "Collateral mint",
        Boolean(
          marketMintAccount
          && marketMintAccount.owner.equals(marketProgram)
          && marketMintAccount.data.length >= 45
          && marketMintAccount.data[44] === config.market.decimals
        ),
        marketMintAccount ? config.market.mint : "Mint does not exist on this network",
      );
      check(
        "usdc-mint",
        "Settlement mint",
        Boolean(
          usdcMintAccount
          && usdcMintAccount.owner.equals(usdcProgram)
          && usdcMintAccount.data.length >= 45
          && usdcMintAccount.data[44] === config.usdcDecimals
        ),
        usdcMintAccount ? config.usdcMint : "Settlement mint does not exist on this network",
      );
      check(
        "operator-sol",
        "Operator fee balance",
        walletBalance >= 5_000_000,
        `${(walletBalance / 1_000_000_000).toFixed(4)} SOL`,
      );
      check(
        "collateral-account",
        "Custody collateral account",
        true,
        collateralAccount ? "Initialized" : "Created atomically on first deposit",
      );
      // Advances are paid out of the proceeds of the deposit itself, so no
      // settlement float is required — the account only has to exist for those
      // proceeds to land in. Balance is reported, not gated.
      const settlementReady = Boolean(usdcAccount && usdcAccount.data.length >= 72);
      const settlementRaw = settlementReady ? usdcAccount!.data.readBigUInt64LE(64) : 0n;
      check(
        "settlement-account",
        "Settlement account",
        settlementReady,
        settlementReady
          ? `Initialized · ${settlementRaw.toString()} base units held`
          : "Send any amount of the settlement token once to create the account",
      );
    } catch {
      check("rpc", "Solana RPC", false, "Unable to attest custody accounts");
    }
  }

  const ready = checks.every((item) => item.status === "pass");
  return json({
    network: config.network,
    rpcHost,
    clientRpcUrl: config.clientRpcUrl,
    custodyAddress: config.custodyAddress,
    usdcMint: config.usdcMint,
    usdcDecimals: config.usdcDecimals,
    usdcTokenProgram: config.usdcTokenProgram,
    swapMode: config.swapMode,
    transactionMode: ready ? "enabled" : "launch-gated",
    ready,
    checks,
    market: config.market
      ? {
          symbol: config.market.symbol,
          name: config.market.name,
          mint: config.market.mint,
          decimals: config.market.decimals,
          tokenProgram: config.market.tokenProgram,
          advanceBps: config.market.advanceBps,
          maxPositionRaw: config.market.maxPositionRaw.toString(),
          maxActiveLiabilityRaw: config.market.maxActiveLiabilityRaw.toString(),
          enabled: config.market.enabled,
        }
      : null,
  });
}
