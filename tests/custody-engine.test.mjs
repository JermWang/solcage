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
