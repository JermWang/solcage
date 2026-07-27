import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildLendingInstruction,
  deriveAssociatedTokenAddress,
  deriveLendingAccounts,
} from "../lib/solana/lendingClient.ts";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("3UmM2kDDvyJMNXULcH2m7ACfSLURWtQKmvW17S97U4At");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PYTH_RECEIVER_PROGRAM_ID = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
const HIGH_PRICE_ACCOUNT = Keypair.fromSeed(new Uint8Array(32).fill(41)).publicKey;
const LOW_PRICE_ACCOUNT = Keypair.fromSeed(new Uint8Array(32).fill(42)).publicKey;
const PRICE_FEED_ID = createHash("sha256").update("solcage-local-price-feed").digest();
const TOKEN_DECIMALS = 6;

function discriminator(namespace, name) {
  return createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
}

function u64(value) {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(BigInt(value));
  return data;
}

function u16(value) {
  const data = Buffer.alloc(2);
  data.writeUInt16LE(value);
  return data;
}

function i64(value) {
  const data = Buffer.alloc(8);
  data.writeBigInt64LE(BigInt(value));
  return data;
}

function i32(value) {
  const data = Buffer.alloc(4);
  data.writeInt32LE(value);
  return data;
}

function buildPriceUpdate(price) {
  const now = BigInt(Math.floor(Date.now() / 1_000));
  const serialized = Buffer.concat([
    discriminator("account", "PriceUpdateV2"),
    Buffer.alloc(32),
    Buffer.from([1]), // VerificationLevel::Full
    PRICE_FEED_ID,
    i64(price),
    u64(100_000n),
    i32(-8),
    i64(now),
    i64(now - 1n),
    i64(price),
    u64(100_000n),
    u64(1n),
  ]);
  assert.equal(serialized.length, 133);
  return Buffer.concat([serialized, Buffer.alloc(1)]);
}

function accountFixture(address, data) {
  return {
    pubkey: address.toBase58(),
    account: {
      lamports: 2_000_000,
      data: [data.toString("base64"), "base64"],
      owner: PYTH_RECEIVER_PROGRAM_ID.toBase58(),
      executable: false,
      rentEpoch: 0,
      space: data.length,
    },
  };
}

async function writeFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const highPath = `${directory}/pyth-high.json`;
  const lowPath = `${directory}/pyth-low.json`;
  await Promise.all([
    writeFile(
      highPath,
      `${JSON.stringify(accountFixture(HIGH_PRICE_ACCOUNT, buildPriceUpdate(200_000_000n)), null, 2)}\n`,
    ),
    writeFile(
      lowPath,
      `${JSON.stringify(accountFixture(LOW_PRICE_ACCOUNT, buildPriceUpdate(50_000_000n)), null, 2)}\n`,
    ),
  ]);
  process.stdout.write(`${HIGH_PRICE_ACCOUNT.toBase58()} ${highPath}\n`);
  process.stdout.write(`${LOW_PRICE_ACCOUNT.toBase58()} ${lowPath}\n`);
}

function initializeMint2Instruction(mint, mintAuthority) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data: Buffer.concat([
      Buffer.from([20, TOKEN_DECIMALS]),
      mintAuthority.toBuffer(),
      Buffer.from([0]),
    ]),
  });
}

function mintToInstruction(mint, destination, authority, amount) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([7]), u64(amount)]),
  });
}

function createAssociatedTokenInstruction(payer, owner, mint) {
  const address = deriveAssociatedTokenAddress(mint, owner, TOKEN_PROGRAM_ID);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function anchorInstruction(name, keys, data = Buffer.alloc(0)) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.concat([discriminator("global", name), data]),
  });
}

async function send(connection, payer, instructions, signers = []) {
  const transaction = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, transaction, [payer, ...signers], {
    commitment: "confirmed",
  });
}

async function fund(connection, keypair) {
  const signature = await connection.requestAirdrop(keypair.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature, "confirmed");
}

async function createMint(connection, payer) {
  const mint = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(82);
  await send(connection, payer, [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: rent,
      space: 82,
      programId: TOKEN_PROGRAM_ID,
    }),
    initializeMint2Instruction(mint.publicKey, payer.publicKey),
  ], [mint]);
  return mint.publicKey;
}

async function tokenAmount(connection, account) {
  const info = await connection.getAccountInfo(account, "confirmed");
  assert(info, `Missing token account ${account.toBase58()}`);
  return info.data.readBigUInt64LE(64);
}

async function positionState(connection, position) {
  const info = await connection.getAccountInfo(position, "confirmed");
  assert(info, `Missing position ${position.toBase58()}`);
  return {
    collateral: info.data.readBigUInt64LE(72),
    debt: info.data.readBigUInt64LE(80),
  };
}

function clientMarket(collateralMint, priceAccount) {
  return {
    symbol: "SMOKE",
    mint: collateralMint.toBase58(),
    decimals: TOKEN_DECIMALS,
    tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    priceFeedAccount: priceAccount.toBase58(),
    enabled: true,
  };
}

function clientInstruction(action, amount, owner, collateralMint, borrowMint, priceAccount) {
  return buildLendingInstruction({
    action,
    amount,
    programId: PROGRAM_ID.toBase58(),
    owner: owner.toBase58(),
    borrowMint: borrowMint.toBase58(),
    borrowTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    market: clientMarket(collateralMint, priceAccount),
  });
}

async function runSmoke() {
  const connection = new Connection(RPC_URL, "confirmed");
  assert(await connection.getAccountInfo(PROGRAM_ID), "Compiled SolCage program is not loaded");

  const admin = Keypair.generate();
  const owner = Keypair.generate();
  const borrower = Keypair.generate();
  const liquidator = Keypair.generate();
  await Promise.all([
    fund(connection, admin),
    fund(connection, owner),
    fund(connection, borrower),
    fund(connection, liquidator),
  ]);

  const collateralMint = await createMint(connection, admin);
  const borrowMint = await createMint(connection, admin);
  const ownerAccounts = deriveLendingAccounts(
    PROGRAM_ID.toBase58(),
    collateralMint.toBase58(),
    owner.publicKey.toBase58(),
  );
  const borrowerAccounts = deriveLendingAccounts(
    PROGRAM_ID.toBase58(),
    collateralMint.toBase58(),
    borrower.publicKey.toBase58(),
  );
  const { protocol, market } = ownerAccounts;
  const liquidityVault = deriveAssociatedTokenAddress(borrowMint, protocol, TOKEN_PROGRAM_ID);
  const collateralVault = deriveAssociatedTokenAddress(collateralMint, market, TOKEN_PROGRAM_ID);

  const ownerCollateral = deriveAssociatedTokenAddress(collateralMint, owner.publicKey, TOKEN_PROGRAM_ID);
  const ownerBorrow = deriveAssociatedTokenAddress(borrowMint, owner.publicKey, TOKEN_PROGRAM_ID);
  const borrowerCollateral = deriveAssociatedTokenAddress(collateralMint, borrower.publicKey, TOKEN_PROGRAM_ID);
  const borrowerBorrow = deriveAssociatedTokenAddress(borrowMint, borrower.publicKey, TOKEN_PROGRAM_ID);
  const liquidatorCollateral = deriveAssociatedTokenAddress(
    collateralMint,
    liquidator.publicKey,
    TOKEN_PROGRAM_ID,
  );
  const liquidatorBorrow = deriveAssociatedTokenAddress(borrowMint, liquidator.publicKey, TOKEN_PROGRAM_ID);

  await send(connection, admin, [
    createAssociatedTokenInstruction(admin.publicKey, owner.publicKey, collateralMint),
    createAssociatedTokenInstruction(admin.publicKey, owner.publicKey, borrowMint),
    createAssociatedTokenInstruction(admin.publicKey, borrower.publicKey, collateralMint),
    createAssociatedTokenInstruction(admin.publicKey, borrower.publicKey, borrowMint),
    createAssociatedTokenInstruction(admin.publicKey, liquidator.publicKey, collateralMint),
    createAssociatedTokenInstruction(admin.publicKey, liquidator.publicKey, borrowMint),
  ]);
  await send(connection, admin, [
    mintToInstruction(collateralMint, ownerCollateral, admin.publicKey, 250_000_000n),
    mintToInstruction(collateralMint, borrowerCollateral, admin.publicKey, 200_000_000n),
    mintToInstruction(borrowMint, liquidatorBorrow, admin.publicKey, 50_000_000n),
  ]);

  await send(connection, admin, [
    anchorInstruction("initialize_protocol", [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: borrowMint, isSigner: false, isWritable: false },
      { pubkey: protocol, isSigner: false, isWritable: true },
      { pubkey: liquidityVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]),
  ]);
  await send(connection, admin, [
    mintToInstruction(borrowMint, liquidityVault, admin.publicKey, 500_000_000n),
  ]);

  const marketConfig = Buffer.concat([
    PRICE_FEED_ID,
    u16(5_000),
    u16(7_000),
    u16(500),
    u64(300n),
    u16(1_000),
  ]);
  await send(connection, admin, [
    anchorInstruction("initialize_market", [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: protocol, isSigner: false, isWritable: false },
      { pubkey: collateralMint, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: collateralVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], marketConfig),
    anchorInstruction("set_market_enabled", [
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: protocol, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
    ], Buffer.from([1])),
  ]);

  await send(connection, owner, [
    clientInstruction("deposit", 100_000_000n, owner.publicKey, collateralMint, borrowMint, HIGH_PRICE_ACCOUNT),
  ]);
  await send(connection, owner, [
    clientInstruction("borrow", 40_000_000n, owner.publicKey, collateralMint, borrowMint, HIGH_PRICE_ACCOUNT),
  ]);
  await send(connection, owner, [
    clientInstruction("repay", 40_000_000n, owner.publicKey, collateralMint, borrowMint, HIGH_PRICE_ACCOUNT),
  ]);
  await send(connection, owner, [
    clientInstruction("withdraw", 100_000_000n, owner.publicKey, collateralMint, borrowMint, HIGH_PRICE_ACCOUNT),
  ]);
  assert.deepEqual(await positionState(connection, ownerAccounts.position), {
    collateral: 0n,
    debt: 0n,
  });
  assert.equal(await tokenAmount(connection, ownerCollateral), 250_000_000n);
  assert.equal(await tokenAmount(connection, ownerBorrow), 0n);

  await send(connection, borrower, [
    clientInstruction(
      "deposit",
      100_000_000n,
      borrower.publicKey,
      collateralMint,
      borrowMint,
      HIGH_PRICE_ACCOUNT,
    ),
  ]);
  await send(connection, borrower, [
    clientInstruction(
      "borrow",
      50_000_000n,
      borrower.publicKey,
      collateralMint,
      borrowMint,
      HIGH_PRICE_ACCOUNT,
    ),
  ]);
  assert.deepEqual(await positionState(connection, borrowerAccounts.position), {
    collateral: 100_000_000n,
    debt: 50_000_000n,
  });
  assert.equal(await tokenAmount(connection, borrowerBorrow), 50_000_000n);

  await send(connection, liquidator, [
    anchorInstruction("liquidate", [
      { pubkey: liquidator.publicKey, isSigner: true, isWritable: true },
      { pubkey: protocol, isSigner: false, isWritable: false },
      { pubkey: collateralMint, isSigner: false, isWritable: false },
      { pubkey: borrowMint, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: borrowerAccounts.position, isSigner: false, isWritable: true },
      { pubkey: LOW_PRICE_ACCOUNT, isSigner: false, isWritable: false },
      { pubkey: liquidatorBorrow, isSigner: false, isWritable: true },
      { pubkey: liquidityVault, isSigner: false, isWritable: true },
      { pubkey: liquidatorCollateral, isSigner: false, isWritable: true },
      { pubkey: collateralVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ]),
  ]);

  assert.deepEqual(await positionState(connection, borrowerAccounts.position), {
    collateral: 0n,
    debt: 0n,
  });
  assert.equal(await tokenAmount(connection, liquidatorBorrow), 0n);
  assert.equal(await tokenAmount(connection, liquidatorCollateral), 100_000_000n);
  assert.equal(await tokenAmount(connection, liquidityVault), 500_000_000n);
  assert.equal(await tokenAmount(connection, collateralVault), 0n);
  process.stdout.write(
    "SolCage localnet flow passed: initialize, enable, deposit, borrow, repay, withdraw, liquidate.\n",
  );
}

const command = process.argv[2] ?? "run";
if (command === "fixtures") {
  const directory = process.argv[3];
  assert(directory, "Pass a fixture output directory");
  await writeFixtures(directory);
} else if (command === "run") {
  await runSmoke();
} else {
  throw new Error(`Unknown command: ${command}`);
}
