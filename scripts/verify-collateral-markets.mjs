import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  derivePythPriceFeedAccount,
  parsePythPriceUpdate,
  pythConfidenceBps,
  PYTH_RECEIVER_PROGRAM_ID,
} from "../lib/solana/pyth.ts";

const configPath = process.argv[2] ?? "config/collateral-markets.mainnet.json";
const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const config = JSON.parse(await readFile(configPath, "utf8"));
assert(Array.isArray(config), "Collateral market manifest must be an array");
const markets = config.filter((market) => market.enabled);
assert(markets.length > 0, "Collateral market manifest has no enabled markets");

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `Solana RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  assert(!payload.error, payload.error?.message ?? "Solana RPC request failed");
  return payload.result;
}

async function dexMetrics(mint) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `DEX Screener returned HTTP ${response.status}`);
  const payload = await response.json();
  const pairs = (payload.pairs ?? [])
    .filter((pair) => pair.chainId === "solana")
    .sort((left, right) => (Number(right.liquidity?.usd) || 0) - (Number(left.liquidity?.usd) || 0));
  // Use the deepest pool's market cap. Taking the maximum across every pool
  // lets a dust-liquidity spoof pair manufacture an impossible valuation.
  const marketCap = Number(pairs[0]?.marketCap) || 0;
  const uniquePairs = new Map();
  for (const pair of pairs) uniquePairs.set(pair.pairAddress, pair);
  const liquidity = [...uniquePairs.values()]
    .reduce((total, pair) => total + (Number(pair.liquidity?.usd) || 0), 0);
  return { marketCap, liquidity, pairCount: uniquePairs.size };
}

const addresses = markets.flatMap((market) => [market.mint, market.priceFeedAccount]);
const result = await rpc("getMultipleAccounts", [
  addresses,
  { encoding: "base64", commitment: "finalized" },
]);
assert(Array.isArray(result?.value), "Solana RPC did not return account data");
const now = BigInt(Math.floor(Date.now() / 1_000));
const rows = [];

for (const [index, market] of markets.entries()) {
  const mintAccount = result.value[index * 2];
  const priceAccount = result.value[index * 2 + 1];
  assert(mintAccount, `${market.symbol} mint does not exist`);
  assert.equal(mintAccount.owner, market.tokenProgram, `${market.symbol} token program mismatch`);
  const mintData = Buffer.from(mintAccount.data[0], "base64");
  assert(mintData.length >= 82, `${market.symbol} mint data is malformed`);
  assert.equal(mintData[44], market.decimals, `${market.symbol} decimal mismatch`);
  assert.equal(mintData[45], 1, `${market.symbol} mint is not initialized`);

  assert.equal(
    derivePythPriceFeedAccount(market.priceFeedId, market.priceFeedShardId).toBase58(),
    market.priceFeedAccount,
    `${market.symbol} Pyth account is not the configured shard/feed PDA`,
  );
  assert(priceAccount, `${market.symbol} Pyth price account does not exist`);
  assert.equal(
    priceAccount.owner,
    PYTH_RECEIVER_PROGRAM_ID,
    `${market.symbol} Pyth account owner mismatch`,
  );
  const price = parsePythPriceUpdate(Buffer.from(priceAccount.data[0], "base64"));
  assert(price, `${market.symbol} Pyth PriceUpdateV2 data is malformed`);
  assert.equal(price.verification, "full", `${market.symbol} Pyth price is not fully verified`);
  assert.equal(price.feedId, market.priceFeedId, `${market.symbol} Pyth feed ID mismatch`);
  assert(price.price > 0n, `${market.symbol} Pyth price is not positive`);
  const age = now - price.publishTime;
  assert(age >= -30n, `${market.symbol} Pyth publish time is too far in the future`);
  assert(
    age <= BigInt(market.maxPriceAgeSeconds),
    `${market.symbol} Pyth price is stale by ${age}s`,
  );
  const confidenceBps = pythConfidenceBps(price.price, price.confidence);
  assert(confidenceBps !== null, `${market.symbol} Pyth confidence cannot be calculated`);
  assert(
    confidenceBps <= BigInt(market.maxConfidenceBps),
    `${market.symbol} Pyth confidence is ${confidenceBps} bps`,
  );

  const dex = await dexMetrics(market.mint);
  assert(
    dex.marketCap >= market.minimumMarketCapUsd,
    `${market.symbol} market cap $${dex.marketCap} is below $${market.minimumMarketCapUsd}`,
  );
  assert(
    dex.liquidity >= market.minimumLiquidityUsd,
    `${market.symbol} liquidity $${dex.liquidity} is below $${market.minimumLiquidityUsd}`,
  );
  rows.push({
    symbol: market.symbol,
    decimals: market.decimals,
    marketCapUsd: Math.round(dex.marketCap),
    liquidityUsd: Math.round(dex.liquidity),
    pythAgeSeconds: Number(age),
    confidenceBps: Number(confidenceBps),
    dexPairs: dex.pairCount,
  });
}

console.table(rows);
process.stdout.write(`Verified ${rows.length} enabled collateral markets from mint to oracle to liquidity.\n`);
