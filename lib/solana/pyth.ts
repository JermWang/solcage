import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
export const PYTH_PUSH_ORACLE_PROGRAM_ID = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";

const PRICE_UPDATE_DISCRIMINATOR = createHash("sha256")
  .update("account:PriceUpdateV2")
  .digest()
  .subarray(0, 8);

export type PythPriceUpdate = {
  verification: "full" | "partial";
  signatures: number | null;
  feedId: string;
  price: bigint;
  confidence: bigint;
  exponent: number;
  publishTime: bigint;
};

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function derivePythPriceFeedAccount(
  feedId: string,
  shardId = 0,
  pushOracleProgramId = PYTH_PUSH_ORACLE_PROGRAM_ID,
) {
  const normalizedFeedId = feedId.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedFeedId)) {
    throw new Error("Pyth feed ID must be 32 bytes of hexadecimal data.");
  }
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65_535) {
    throw new Error("Pyth shard ID must be an unsigned 16-bit integer.");
  }
  const shard = Buffer.alloc(2);
  shard.writeUInt16LE(shardId);
  return PublicKey.findProgramAddressSync(
    [shard, Buffer.from(normalizedFeedId, "hex")],
    new PublicKey(pushOracleProgramId),
  )[0];
}

export function parsePythPriceUpdate(data: Buffer): PythPriceUpdate | null {
  if (
    data.length < 133
    || !bytesEqual(data.subarray(0, 8), PRICE_UPDATE_DISCRIMINATOR)
  ) {
    return null;
  }

  const verificationTag = data[40];
  let verification: PythPriceUpdate["verification"];
  let signatures: number | null;
  let feedOffset: number;
  if (verificationTag === 1) {
    verification = "full";
    signatures = null;
    feedOffset = 41;
  } else if (verificationTag === 0) {
    verification = "partial";
    signatures = data[41];
    feedOffset = 42;
  } else {
    return null;
  }
  if (data.length < feedOffset + 92) return null;

  return {
    verification,
    signatures,
    feedId: data.subarray(feedOffset, feedOffset + 32).toString("hex"),
    price: data.readBigInt64LE(feedOffset + 32),
    confidence: data.readBigUInt64LE(feedOffset + 40),
    exponent: data.readInt32LE(feedOffset + 48),
    publishTime: data.readBigInt64LE(feedOffset + 52),
  };
}

export function pythConfidenceBps(price: bigint, confidence: bigint) {
  if (price <= 0n) return null;
  return (confidence * 10_000n) / price;
}
