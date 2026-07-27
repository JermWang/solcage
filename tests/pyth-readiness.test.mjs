import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collateralMarketsFromEnvironment } from "../lib/solana/markets.ts";
import {
  derivePythPriceFeedAccount,
  parsePythPriceUpdate,
  pythConfidenceBps,
} from "../lib/solana/pyth.ts";

const sponsoredFeeds = {
  FARTCOIN: {
    id: "58cd29ef0e714c5affc44f269b2c1899a52da4169d7acc147b9da692e6953608",
    account: "2t8eUbYKjidMs3uSeYM9jXM9uudYZwGkSeTB4TKjmvnC",
  },
  BONK: {
    id: "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    account: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
  },
  WIF: {
    id: "4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
    account: "6B23K3tkb51vLZA14jcEQVCA1pfHptzEHFA93V5dYwbT",
  },
  PENGU: {
    id: "bed3097008b9b5e3c93bec20be79cb43986b85a996475589351a21e67bae9b61",
    account: "27zzC5wXCeZeuJ3h9uAJzV5tGn6r5Tzo98S1ZceYKEb8",
  },
};

function i64(value) {
  const data = Buffer.alloc(8);
  data.writeBigInt64LE(BigInt(value));
  return data;
}

function u64(value) {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(BigInt(value));
  return data;
}

function i32(value) {
  const data = Buffer.alloc(4);
  data.writeInt32LE(value);
  return data;
}

function priceUpdate({ feedId, partial = false }) {
  const discriminator = createHash("sha256").update("account:PriceUpdateV2").digest().subarray(0, 8);
  const verification = partial ? Buffer.from([0, 5]) : Buffer.from([1]);
  const serialized = Buffer.concat([
    discriminator,
    Buffer.alloc(32),
    verification,
    Buffer.from(feedId, "hex"),
    i64(125_000_000n),
    u64(250_000n),
    i32(-8),
    i64(1_800_000_000n),
    i64(1_799_999_999n),
    i64(124_500_000n),
    u64(240_000n),
    u64(99n),
  ]);
  return Buffer.concat([serialized, Buffer.alloc(Math.max(0, 134 - serialized.length))]);
}

test("derives the official shard-zero sponsored memecoin accounts", () => {
  for (const feed of Object.values(sponsoredFeeds)) {
    assert.equal(derivePythPriceFeedAccount(feed.id, 0).toBase58(), feed.account);
  }
});

test("decodes fully verified Pyth PriceUpdateV2 data exactly", () => {
  const feed = sponsoredFeeds.FARTCOIN;
  const parsed = parsePythPriceUpdate(priceUpdate({ feedId: feed.id }));
  assert.deepEqual(parsed, {
    verification: "full",
    signatures: null,
    feedId: feed.id,
    price: 125_000_000n,
    confidence: 250_000n,
    exponent: -8,
    publishTime: 1_800_000_000n,
  });
  assert.equal(pythConfidenceBps(parsed.price, parsed.confidence), 20n);
});

test("distinguishes partial verification and rejects malformed accounts", () => {
  const feed = sponsoredFeeds.BONK;
  const parsed = parsePythPriceUpdate(priceUpdate({ feedId: feed.id, partial: true }));
  assert.equal(parsed.verification, "partial");
  assert.equal(parsed.signatures, 5);
  assert.equal(parsePythPriceUpdate(Buffer.alloc(134)), null);
  assert.equal(pythConfidenceBps(0n, 1n), null);
  assert.throws(() => derivePythPriceFeedAccount("nope", 0), /32 bytes/);
  assert.throws(() => derivePythPriceFeedAccount(feed.id, 65_536), /16-bit/);
});

test("accepts the reviewed manifest only when feed PDA derivation matches", async () => {
  const previous = process.env.SOLCAGE_COLLATERAL_MARKETS;
  try {
    const manifest = JSON.parse(
      await readFile(new URL("../config/collateral-markets.mainnet.json", import.meta.url), "utf8"),
    );
    process.env.SOLCAGE_COLLATERAL_MARKETS = JSON.stringify(manifest);
    const parsed = collateralMarketsFromEnvironment();
    assert.equal(parsed.length, 5);
    assert.deepEqual(
      parsed.filter((market) => market.enabled).map((market) => market.symbol),
      ["FARTCOIN", "BONK", "WIF", "PENGU"],
    );
    manifest[0].priceFeedAccount = sponsoredFeeds.BONK.account;
    process.env.SOLCAGE_COLLATERAL_MARKETS = JSON.stringify(manifest);
    assert.equal(
      collateralMarketsFromEnvironment().some((market) => market.symbol === "FARTCOIN"),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.SOLCAGE_COLLATERAL_MARKETS;
    else process.env.SOLCAGE_COLLATERAL_MARKETS = previous;
  }
});
