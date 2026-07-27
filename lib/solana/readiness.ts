import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  isSolanaPublicKey,
  isSupportedTokenProgram,
  type CollateralMarket,
} from "@/lib/solana/markets";
import {
  parsePythPriceUpdate,
  pythConfidenceBps,
  PYTH_RECEIVER_PROGRAM_ID,
} from "@/lib/solana/pyth";

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PROTOCOL_DISCRIMINATOR = createHash("sha256").update("account:Protocol").digest().subarray(0, 8);
const MARKET_DISCRIMINATOR = createHash("sha256").update("account:Market").digest().subarray(0, 8);

type RpcAccount = {
  data: [string, "base64"];
  executable: boolean;
  owner: string;
};

type RpcResponse<T> = {
  result?: { value: T };
  error?: { message?: string };
};

export type ReadinessCheck = {
  key: string;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

export type MarketAttestation = {
  symbol: string;
  marketAddress: string;
  collateralVault: string;
  ready: boolean;
  checks: ReadinessCheck[];
};

export type ProtocolReadiness = {
  ready: boolean;
  state: "ready" | "configuration-required" | "rpc-unavailable" | "on-chain-mismatch";
  checkedAt: string;
  protocolAddress: string | null;
  liquidityVault: string | null;
  checks: ReadinessCheck[];
  markets: MarketAttestation[];
};

declare global {
  var __solcageReadinessCache: {
    key: string;
    expiresAt: number;
    result: Promise<ProtocolReadiness>;
  } | undefined;
}

function pass(key: string, label: string, detail: string): ReadinessCheck {
  return { key, label, status: "pass", detail };
}

function fail(key: string, label: string, detail: string): ReadinessCheck {
  return { key, label, status: "fail", detail };
}

function matches(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function publicKeyAt(data: Buffer, offset: number) {
  if (data.length < offset + 32) return null;
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function associatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

async function getMultipleAccounts(rpcUrl: string, addresses: string[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "getMultipleAccounts",
      params: [addresses, { encoding: "base64", commitment: "finalized" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<Array<RpcAccount | null>>;
  if (payload.error || !payload.result) {
    throw new Error(payload.error?.message ?? "Solana RPC did not return account state");
  }
  return payload.result.value;
}

function validateMint(
  account: RpcAccount | null,
  expectedOwner: string,
  expectedDecimals: number,
  label: string,
) {
  const checks: ReadinessCheck[] = [];
  if (!account) return [fail(`${label}-exists`, `${label} mint`, "Mint account does not exist")];
  checks.push(account.owner === expectedOwner
    ? pass(`${label}-program`, `${label} token program`, expectedOwner)
    : fail(`${label}-program`, `${label} token program`, `Expected ${expectedOwner}; found ${account.owner}`));
  const data = Buffer.from(account.data[0], "base64");
  checks.push(data.length >= 46 && data[45] === 1
    ? pass(`${label}-initialized`, `${label} mint initialized`, "Mint state is initialized")
    : fail(`${label}-initialized`, `${label} mint initialized`, "Mint data is missing or uninitialized"));
  checks.push(data.length >= 45 && data[44] === expectedDecimals
    ? pass(`${label}-decimals`, `${label} decimals`, String(expectedDecimals))
    : fail(`${label}-decimals`, `${label} decimals`, `Expected ${expectedDecimals}; found ${data[44] ?? "missing"}`));
  return checks;
}

function validateTokenAccount(
  account: RpcAccount | null,
  expectedProgram: string,
  expectedMint: string,
  expectedAuthority: string,
  key: string,
  label: string,
) {
  if (!account) return [fail(`${key}-exists`, label, "Token account does not exist")];
  const data = Buffer.from(account.data[0], "base64");
  return [
    account.owner === expectedProgram
      ? pass(`${key}-program`, `${label} token program`, expectedProgram)
      : fail(`${key}-program`, `${label} token program`, `Expected ${expectedProgram}; found ${account.owner}`),
    publicKeyAt(data, 0) === expectedMint
      ? pass(`${key}-mint`, `${label} mint`, expectedMint)
      : fail(`${key}-mint`, `${label} mint`, "Token account mint does not match configuration"),
    publicKeyAt(data, 32) === expectedAuthority
      ? pass(`${key}-authority`, `${label} authority`, expectedAuthority)
      : fail(`${key}-authority`, `${label} authority`, "Token account authority does not match its program PDA"),
  ];
}

export async function inspectProtocolReadiness(input: {
  rpcUrl: string;
  programId: string;
  borrowMint: string;
  borrowDecimals: number;
  borrowTokenProgram: string;
  markets: CollateralMarket[];
}): Promise<ProtocolReadiness> {
  const checkedAt = new Date().toISOString();
  const baseChecks: ReadinessCheck[] = [];
  const configurationValid = isSolanaPublicKey(input.programId)
    && isSolanaPublicKey(input.borrowMint)
    && isSupportedTokenProgram(input.borrowTokenProgram)
    && Number.isInteger(input.borrowDecimals)
    && input.borrowDecimals >= 0
    && input.borrowDecimals <= 12
    && input.markets.length > 0;
  if (!configurationValid) {
    return {
      ready: false,
      state: "configuration-required",
      checkedAt,
      protocolAddress: null,
      liquidityVault: null,
      checks: [fail("environment", "Production configuration", "Program, borrow mint, token program, decimals, and at least one enabled market are required")],
      markets: [],
    };
  }

  const programId = new PublicKey(input.programId);
  const borrowMint = new PublicKey(input.borrowMint);
  const borrowTokenProgram = new PublicKey(input.borrowTokenProgram);
  const [protocol] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], programId);
  const liquidityVault = associatedTokenAddress(borrowMint, protocol, borrowTokenProgram);
  const derivedMarkets = input.markets.map((market) => {
    const mint = new PublicKey(market.mint);
    const tokenProgram = new PublicKey(market.tokenProgram);
    const [marketAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), mint.toBuffer()],
      programId,
    );
    return {
      market,
      marketAddress,
      collateralVault: associatedTokenAddress(mint, marketAddress, tokenProgram),
    };
  });
  const addresses = [
    programId.toBase58(),
    protocol.toBase58(),
    borrowMint.toBase58(),
    liquidityVault.toBase58(),
    ...derivedMarkets.flatMap(({ market, marketAddress, collateralVault }) => [
      marketAddress.toBase58(),
      market.mint,
      collateralVault.toBase58(),
      market.priceFeedAccount,
    ]),
  ];

  let accounts: Array<RpcAccount | null>;
  try {
    accounts = await getMultipleAccounts(input.rpcUrl, addresses);
  } catch (error) {
    return {
      ready: false,
      state: "rpc-unavailable",
      checkedAt,
      protocolAddress: protocol.toBase58(),
      liquidityVault: liquidityVault.toBase58(),
      checks: [fail("rpc", "Solana RPC attestation", error instanceof Error ? error.message : "RPC request failed")],
      markets: [],
    };
  }

  const [programAccount, protocolAccount, borrowMintAccount, liquidityVaultAccount] = accounts;
  baseChecks.push(programAccount?.executable
    ? pass("program-executable", "Lending program executable", input.programId)
    : fail("program-executable", "Lending program executable", "Configured address is missing or is not executable"));

  if (!protocolAccount || protocolAccount.owner !== input.programId) {
    baseChecks.push(fail("protocol-account", "Protocol PDA", "Protocol state is missing or owned by another program"));
  } else {
    const data = Buffer.from(protocolAccount.data[0], "base64");
    baseChecks.push(data.length >= 74 && matches(data.subarray(0, 8), PROTOCOL_DISCRIMINATOR)
      ? pass("protocol-discriminator", "Protocol account type", "Anchor discriminator verified")
      : fail("protocol-discriminator", "Protocol account type", "Protocol account data is malformed"));
    baseChecks.push(publicKeyAt(data, 40) === input.borrowMint
      ? pass("protocol-borrow-mint", "Protocol borrow mint", input.borrowMint)
      : fail("protocol-borrow-mint", "Protocol borrow mint", "On-chain protocol state does not match configuration"));
    baseChecks.push(data.length >= 73 && data[72] === 0
      ? pass("protocol-unpaused", "Protocol pause control", "Protocol is unpaused")
      : fail("protocol-unpaused", "Protocol pause control", "Protocol is paused or state is malformed"));
  }
  baseChecks.push(...validateMint(
    borrowMintAccount,
    input.borrowTokenProgram,
    input.borrowDecimals,
    "borrow",
  ));
  baseChecks.push(...validateTokenAccount(
    liquidityVaultAccount,
    input.borrowTokenProgram,
    input.borrowMint,
    protocol.toBase58(),
    "liquidity-vault",
    "Borrow liquidity vault",
  ));

  const marketAttestations = derivedMarkets.map(({ market, marketAddress, collateralVault }, index) => {
    const offset = 4 + index * 4;
    const [marketAccount, mintAccount, vaultAccount, priceAccount] = accounts.slice(offset, offset + 4);
    const checks: ReadinessCheck[] = [];
    if (!marketAccount || marketAccount.owner !== input.programId) {
      checks.push(fail("market-account", `${market.symbol} market PDA`, "Market state is missing or owned by another program"));
    } else {
      const data = Buffer.from(marketAccount.data[0], "base64");
      checks.push(data.length >= 138 && matches(data.subarray(0, 8), MARKET_DISCRIMINATOR)
        ? pass("market-discriminator", `${market.symbol} account type`, "Anchor discriminator verified")
        : fail("market-discriminator", `${market.symbol} account type`, "Market account data is malformed"));
      checks.push(publicKeyAt(data, 8) === protocol.toBase58()
        ? pass("market-protocol", `${market.symbol} protocol`, protocol.toBase58())
        : fail("market-protocol", `${market.symbol} protocol`, "Market points to another protocol"));
      checks.push(publicKeyAt(data, 40) === market.mint
        ? pass("market-mint", `${market.symbol} collateral mint`, market.mint)
        : fail("market-mint", `${market.symbol} collateral mint`, "On-chain mint does not match configuration"));
      const onChainFeedId = data.length >= 104 ? data.subarray(72, 104).toString("hex") : "";
      checks.push(onChainFeedId === market.priceFeedId
        ? pass("market-feed", `${market.symbol} Pyth feed ID`, market.priceFeedId)
        : fail("market-feed", `${market.symbol} Pyth feed ID`, "On-chain feed ID does not match configuration"));
      checks.push(data.length >= 121
        && data.readUInt16LE(104) === market.ltvBps
        && data.readUInt16LE(106) === market.liquidationLtvBps
        ? pass("market-risk", `${market.symbol} risk parameters`, `${market.ltvBps}/${market.liquidationLtvBps} bps`)
        : fail("market-risk", `${market.symbol} risk parameters`, "On-chain LTV thresholds do not match configuration"));
      checks.push(data.length >= 121 && data[120] === 1
        ? pass("market-enabled", `${market.symbol} market enabled`, "On-chain market is enabled")
        : fail("market-enabled", `${market.symbol} market enabled`, "On-chain market is disabled or malformed"));
    }
    checks.push(...validateMint(mintAccount, market.tokenProgram, market.decimals, market.symbol.toLowerCase()));
    checks.push(...validateTokenAccount(
      vaultAccount,
      market.tokenProgram,
      market.mint,
      marketAddress.toBase58(),
      "collateral-vault",
      `${market.symbol} collateral vault`,
    ));
    if (!priceAccount || priceAccount.owner !== PYTH_RECEIVER_PROGRAM_ID) {
      checks.push(fail(
        "price-update",
        `${market.symbol} Pyth price account`,
        priceAccount
          ? `Expected Pyth Receiver ownership; found ${priceAccount.owner}`
          : "Configured price-update account does not exist",
      ));
    } else {
      const price = parsePythPriceUpdate(Buffer.from(priceAccount.data[0], "base64"));
      const marketData = marketAccount ? Buffer.from(marketAccount.data[0], "base64") : null;
      const maximumAge = marketData && marketData.length >= 120
        ? marketData.readBigUInt64LE(110)
        : null;
      const maximumConfidenceBps = marketData && marketData.length >= 120
        ? BigInt(marketData.readUInt16LE(118))
        : null;
      const now = BigInt(Math.floor(Date.now() / 1_000));
      const confidenceBps = price ? pythConfidenceBps(price.price, price.confidence) : null;
      checks.push(price
        ? pass("price-shape", `${market.symbol} Pyth account type`, "PriceUpdateV2 discriminator verified")
        : fail("price-shape", `${market.symbol} Pyth account type`, "Pyth account data is malformed"));
      checks.push(price?.verification === "full"
        ? pass("price-verification", `${market.symbol} oracle verification`, "Full guardian verification")
        : fail("price-verification", `${market.symbol} oracle verification`, "Price update is not fully verified"));
      checks.push(price?.feedId === market.priceFeedId
        ? pass("price-feed-id", `${market.symbol} oracle feed`, market.priceFeedId)
        : fail("price-feed-id", `${market.symbol} oracle feed`, "Price account contains another feed ID"));
      checks.push(price && price.price > 0n
        ? pass("price-positive", `${market.symbol} oracle price`, "Positive price")
        : fail("price-positive", `${market.symbol} oracle price`, "Price is missing or non-positive"));
      checks.push(
        price
        && maximumAge !== null
        && price.publishTime <= now + 30n
        && price.publishTime + maximumAge >= now
          ? pass("price-fresh", `${market.symbol} oracle freshness`, `Published ${now - price.publishTime}s ago`)
          : fail("price-fresh", `${market.symbol} oracle freshness`, "Price exceeds the on-chain maximum age"),
      );
      checks.push(
        confidenceBps !== null
        && maximumConfidenceBps !== null
        && confidenceBps <= maximumConfidenceBps
          ? pass("price-confidence", `${market.symbol} oracle confidence`, `${confidenceBps} bps`)
          : fail("price-confidence", `${market.symbol} oracle confidence`, "Confidence interval exceeds the market limit"),
      );
    }
    return {
      symbol: market.symbol,
      marketAddress: marketAddress.toBase58(),
      collateralVault: collateralVault.toBase58(),
      ready: checks.every((check) => check.status === "pass"),
      checks,
    };
  });

  const ready = baseChecks.every((check) => check.status === "pass")
    && marketAttestations.length > 0
    && marketAttestations.every((market) => market.ready);
  return {
    ready,
    state: ready ? "ready" : "on-chain-mismatch",
    checkedAt,
    protocolAddress: protocol.toBase58(),
    liquidityVault: liquidityVault.toBase58(),
    checks: baseChecks,
    markets: marketAttestations,
  };
}

export function cachedProtocolReadiness(
  input: Parameters<typeof inspectProtocolReadiness>[0],
) {
  const key = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const cached = globalThis.__solcageReadinessCache;
  if (cached && cached.key === key && cached.expiresAt > Date.now()) return cached.result;
  const result = inspectProtocolReadiness(input);
  globalThis.__solcageReadinessCache = {
    key,
    expiresAt: Date.now() + 15_000,
    result,
  };
  return result;
}
