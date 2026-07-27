import { VersionedTransaction } from "@solana/web3.js";
import { custodyRuntimeConfig, simulatedSaleOutput, type CustodyMarket } from "./config.ts";
import { custodySigner } from "./solana.ts";

const JUPITER_BASE_URL = "https://api.jup.ag/swap/v2";

type JupiterOrder = {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  feeBps: number;
  feeMint: string;
  errorCode?: number;
  errorMessage?: string;
};

type JupiterExecution = {
  status: "Success" | "Failed";
  signature?: string;
  code: number;
  totalInputAmount?: string;
  totalOutputAmount?: string;
  error?: string;
};

async function jupiterOrder(input: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  taker?: string;
}) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) throw new Error("Jupiter API key is not configured");
  const query = new URLSearchParams({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.amount.toString(),
  });
  if (input.taker) query.set("taker", input.taker);
  const response = await fetch(`${JUPITER_BASE_URL}/order?${query}`, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Jupiter order failed with HTTP ${response.status}`);
  const order = await response.json() as JupiterOrder;
  if (BigInt(order.outAmount || "0") <= 0n) {
    throw new Error(order.errorMessage ?? "Jupiter returned no executable output");
  }
  return order;
}

async function executeJupiterOrder(order: JupiterOrder) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey || !order.transaction) {
    throw new Error(order.errorMessage ?? "Jupiter did not return an executable transaction");
  }
  const signer = custodySigner();
  const transaction = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  transaction.sign([signer]);
  const response = await fetch(`${JUPITER_BASE_URL}/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      signedTransaction: Buffer.from(transaction.serialize()).toString("base64"),
      requestId: order.requestId,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Jupiter execution failed with HTTP ${response.status}`);
  const result = await response.json() as JupiterExecution;
  if (result.status !== "Success" || result.code !== 0 || !result.signature) {
    throw new Error(result.error ?? `Jupiter execution failed with code ${result.code}`);
  }
  return {
    signature: result.signature,
    inputAmount: BigInt(result.totalInputAmount ?? "0"),
    outputAmount: BigInt(result.totalOutputAmount ?? "0"),
    router: order.router,
    feeBps: order.feeBps,
    feeMint: order.feeMint,
  };
}

export async function sellCollateral(input: {
  market: CustodyMarket;
  collateralRaw: bigint;
}) {
  const config = custodyRuntimeConfig();
  if (config.swapMode === "simulated") {
    if (config.network !== "devnet") throw new Error("Simulated swaps are restricted to devnet");
    return {
      signature: `simulated-sell:${crypto.randomUUID()}`,
      inputAmount: input.collateralRaw,
      outputAmount: simulatedSaleOutput(input.collateralRaw, input.market),
      router: "devnet-simulator",
      feeBps: 0,
      feeMint: config.usdcMint,
    };
  }
  if (config.network !== "mainnet-beta") throw new Error("Jupiter execution is restricted to mainnet-beta");
  const signer = custodySigner();
  const order = await jupiterOrder({
    inputMint: input.market.mint,
    outputMint: config.usdcMint,
    amount: input.collateralRaw,
    taker: signer.publicKey.toBase58(),
  });
  return executeJupiterOrder(order);
}

export async function buyCollateral(input: {
  market: CustodyMarket;
  targetCollateralRaw: bigint;
  maximumUsdcRaw: bigint;
}) {
  const config = custodyRuntimeConfig();
  if (config.swapMode === "simulated") {
    if (config.network !== "devnet") throw new Error("Simulated swaps are restricted to devnet");
    const cost = simulatedSaleOutput(input.targetCollateralRaw, input.market);
    if (cost > input.maximumUsdcRaw) throw new Error("Position reserve cannot cover the simulated buyback");
    return {
      signature: `simulated-buy:${crypto.randomUUID()}`,
      inputAmount: cost,
      outputAmount: input.targetCollateralRaw,
      router: "devnet-simulator",
      feeBps: 0,
      feeMint: config.usdcMint,
    };
  }
  if (config.network !== "mainnet-beta") throw new Error("Jupiter execution is restricted to mainnet-beta");
  const highQuote = await jupiterOrder({
    inputMint: config.usdcMint,
    outputMint: input.market.mint,
    amount: input.maximumUsdcRaw,
  });
  if (BigInt(highQuote.outAmount) < input.targetCollateralRaw) {
    throw new Error("Position reserve is insufficient to repurchase the owed collateral");
  }
  let low = 1n;
  let high = input.maximumUsdcRaw;
  for (let index = 0; index < 10 && high - low > 1n; index += 1) {
    const middle = (low + high) / 2n;
    const quote = await jupiterOrder({
      inputMint: config.usdcMint,
      outputMint: input.market.mint,
      amount: middle,
    });
    if (BigInt(quote.outAmount) >= input.targetCollateralRaw) high = middle;
    else low = middle + 1n;
  }
  const signer = custodySigner();
  const order = await jupiterOrder({
    inputMint: config.usdcMint,
    outputMint: input.market.mint,
    amount: high,
    taker: signer.publicKey.toBase58(),
  });
  const result = await executeJupiterOrder(order);
  if (result.outputAmount < input.targetCollateralRaw) {
    throw new Error("Executed buyback did not acquire the full collateral liability");
  }
  return result;
}
