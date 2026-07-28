import assert from "node:assert/strict";
import test from "node:test";
import { buyCollateral, sellCollateral } from "../lib/custody/swap.ts";
import { simulatedSaleOutput } from "../lib/custody/config.ts";

const MARKET = {
  symbol: "SOLCAGE",
  name: "SolCage",
  mint: "5fLyZ36yegahuEkB34XPA9CzENkNSBHnbRmbn69xZwDu",
  decimals: 6,
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  advanceBps: 2_000,
  simulatedPriceMicros: 1_000_000n,
  maxPositionRaw: 1_000_000_000n,
  maxActiveLiabilityRaw: 10_000_000_000n,
  enabled: true,
};

function withDevnetSimulation() {
  process.env.SOLANA_NETWORK = "devnet";
  process.env.SOLCAGE_CUSTODY_SWAP_MODE = "simulated";
}

test("devnet custody accounting sells, advances, repays, and reacquires the exact liability", async () => {
  withDevnetSimulation();
  const collateral = 125_000_000n;
  const sale = await sellCollateral({ market: MARKET, collateralRaw: collateral });
  const advance = sale.outputAmount * BigInt(MARKET.advanceBps) / 10_000n;
  const reserve = sale.outputAmount - advance;
  const repayment = advance;
  const buy = await buyCollateral({
    market: MARKET,
    targetCollateralRaw: collateral,
    maximumUsdcRaw: reserve + repayment,
  });

  assert.equal(sale.outputAmount, 125_000_000n);
  assert.equal(advance, 25_000_000n);
  assert.equal(reserve, 100_000_000n);
  assert.equal(buy.inputAmount, sale.outputAmount);
  assert.equal(buy.outputAmount, collateral);
  assert.match(sale.signature, /^simulated-sell:/);
  assert.match(buy.signature, /^simulated-buy:/);
});

test("buyback fails closed when position funds cannot cover the exact token liability", async () => {
  withDevnetSimulation();
  await assert.rejects(
    buyCollateral({
      market: MARKET,
      targetCollateralRaw: 10_000_000n,
      maximumUsdcRaw: 9_999_999n,
    }),
    /cannot cover the simulated buyback/,
  );
});

test("the deterministic adapter cannot execute on mainnet", async () => {
  process.env.SOLANA_NETWORK = "mainnet-beta";
  process.env.SOLCAGE_CUSTODY_SWAP_MODE = "simulated";
  await assert.rejects(
    sellCollateral({ market: MARKET, collateralRaw: 1_000_000n }),
    /restricted to devnet/,
  );
});

test("simulated price conversion preserves base-unit precision", () => {
  assert.equal(simulatedSaleOutput(1_500_001n, MARKET), 1_500_001n);
});

test("collateral markets parse as a list, reject bad entries, and resolve by mint", async () => {
  const { custodyMarketsFromEnvironment, enabledCustodyMarkets, custodyMarketByMint, custodyMarketFromEnvironment } =
    await import("../lib/custody/config.ts");

  const bonk = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const wif = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
  const base = {
    name: "Test", decimals: 5, advanceBps: 2000,
    simulatedPriceMicros: "1000000", maxPositionRaw: "1000", maxActiveLiabilityRaw: "10000", enabled: true,
  };

  // A single object still works — the original launch shape.
  process.env.SOLCAGE_CUSTODY_MARKET = JSON.stringify({ ...base, symbol: "BONK", mint: bonk });
  assert.equal(custodyMarketsFromEnvironment().length, 1);
  assert.equal(custodyMarketFromEnvironment().symbol, "BONK");

  // An array yields every valid market.
  process.env.SOLCAGE_CUSTODY_MARKET = JSON.stringify([
    { ...base, symbol: "BONK", mint: bonk },
    { ...base, symbol: "WIF", mint: wif, advanceBps: 1500 },
  ]);
  assert.deepEqual(custodyMarketsFromEnvironment().map((m) => m.symbol), ["BONK", "WIF"]);
  assert.equal(custodyMarketByMint(wif).advanceBps, 1500);

  // A malformed entry is dropped without taking the good ones down.
  process.env.SOLCAGE_CUSTODY_MARKET = JSON.stringify([
    { ...base, symbol: "BONK", mint: bonk },
    { ...base, symbol: "BAD", mint: "not-a-real-mint" },
    { ...base, symbol: "WIF", mint: wif },
  ]);
  assert.deepEqual(custodyMarketsFromEnvironment().map((m) => m.symbol), ["BONK", "WIF"]);

  // A duplicate mint keeps only the first, so two markets cannot share a cap.
  process.env.SOLCAGE_CUSTODY_MARKET = JSON.stringify([
    { ...base, symbol: "BONK", mint: bonk, maxPositionRaw: "1000" },
    { ...base, symbol: "CLONE", mint: bonk, maxPositionRaw: "999999" },
  ]);
  assert.equal(custodyMarketsFromEnvironment().length, 1);
  assert.equal(custodyMarketsFromEnvironment()[0].symbol, "BONK");

  // Disabled markets are excluded from what a player can post, and a mint that
  // is not approved never resolves — the guard the deposit route relies on.
  process.env.SOLCAGE_CUSTODY_MARKET = JSON.stringify([
    { ...base, symbol: "BONK", mint: bonk, enabled: true },
    { ...base, symbol: "WIF", mint: wif, enabled: false },
  ]);
  assert.deepEqual(enabledCustodyMarkets().map((m) => m.symbol), ["BONK"]);
  assert.equal(custodyMarketByMint(wif), null, "a disabled market must not be postable");
  assert.equal(custodyMarketByMint("11111111111111111111111111111111"), null);
  assert.equal(custodyMarketByMint(undefined), null);

  delete process.env.SOLCAGE_CUSTODY_MARKET;
  assert.deepEqual(custodyMarketsFromEnvironment(), []);
});
