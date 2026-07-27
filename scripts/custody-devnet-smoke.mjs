import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEPLOYER_PATH = process.env.SOLCAGE_DEVNET_DEPLOYER_KEYPAIR
  ?? "tmp/solcage-devnet-deployer-keypair.json";
const COLLATERAL_MINT = new PublicKey(
  process.env.SOLCAGE_DEVNET_COLLATERAL_MINT
    ?? "5fLyZ36yegahuEkB34XPA9CzENkNSBHnbRmbn69xZwDu",
);
const USDC_MINT = new PublicKey(
  process.env.SOLCAGE_DEVNET_USDC_MINT
    ?? "FEgTrkW1bY7EHPbjaFrPgqXWmr6yDLeaSxXX5ChSZWnB",
);
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const DECIMALS = 6;
const COLLATERAL_RAW = 10_000_000n;
const SALE_PROCEEDS_RAW = 10_000_000n;
const ADVANCE_RAW = 2_000_000n;

function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}

function ata(mint, owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  )[0];
}

function createAta(payer, mint, owner) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata(mint, owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function checkedInstruction(code, keys, amount) {
  const data = Buffer.alloc(10);
  data[0] = code;
  data.writeBigUInt64LE(amount, 1);
  data[9] = DECIMALS;
  return new TransactionInstruction({ programId: TOKEN_PROGRAM, keys, data });
}

function mintTo(mint, destination, authority, amount) {
  return checkedInstruction(14, [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ], amount);
}

function burn(source, mint, authority, amount) {
  return checkedInstruction(15, [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ], amount);
}

function transfer(source, mint, destination, authority, amount) {
  return checkedInstruction(12, [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ], amount);
}

async function submit(connection, payer, signers, instructions, label) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(...instructions);
  const signature = await connection.sendTransaction(transaction, signers, {
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "finalized",
  );
  if (confirmation.value.err) throw new Error(`${label} failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}

async function rawBalance(connection, account) {
  return BigInt((await connection.getTokenAccountBalance(account, "finalized")).value.amount);
}

const connection = new Connection(RPC_URL, "confirmed");
const deployer = loadKeypair(DEPLOYER_PATH);
const user = Keypair.generate();
const custody = Keypair.generate();
const userCollateral = ata(COLLATERAL_MINT, user.publicKey);
const custodyCollateral = ata(COLLATERAL_MINT, custody.publicKey);
const userUsdc = ata(USDC_MINT, user.publicKey);
const custodyUsdc = ata(USDC_MINT, custody.publicKey);

const signatures = {};
signatures.setup = await submit(connection, deployer, [deployer], [
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: user.publicKey, lamports: 20_000_000 }),
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: custody.publicKey, lamports: 20_000_000 }),
  createAta(deployer.publicKey, COLLATERAL_MINT, user.publicKey),
  createAta(deployer.publicKey, COLLATERAL_MINT, custody.publicKey),
  createAta(deployer.publicKey, USDC_MINT, user.publicKey),
  createAta(deployer.publicKey, USDC_MINT, custody.publicKey),
  mintTo(COLLATERAL_MINT, userCollateral, deployer.publicKey, COLLATERAL_RAW),
], "setup");

signatures.deposit = await submit(connection, user, [user], [
  transfer(userCollateral, COLLATERAL_MINT, custodyCollateral, user.publicKey, COLLATERAL_RAW),
], "collateral deposit");

signatures.sell = await submit(connection, deployer, [deployer, custody], [
  burn(custodyCollateral, COLLATERAL_MINT, custody.publicKey, COLLATERAL_RAW),
  mintTo(USDC_MINT, custodyUsdc, deployer.publicKey, SALE_PROCEEDS_RAW),
], "deterministic devnet sale");

signatures.advance = await submit(connection, custody, [custody], [
  transfer(custodyUsdc, USDC_MINT, userUsdc, custody.publicKey, ADVANCE_RAW),
], "USDC advance");

signatures.repay = await submit(connection, user, [user], [
  transfer(userUsdc, USDC_MINT, custodyUsdc, user.publicKey, ADVANCE_RAW),
], "USDC repayment");

signatures.buyback = await submit(connection, deployer, [deployer, custody], [
  burn(custodyUsdc, USDC_MINT, custody.publicKey, SALE_PROCEEDS_RAW),
  mintTo(COLLATERAL_MINT, custodyCollateral, deployer.publicKey, COLLATERAL_RAW),
], "deterministic devnet buyback");

signatures.claim = await submit(connection, custody, [custody], [
  transfer(custodyCollateral, COLLATERAL_MINT, userCollateral, custody.publicKey, COLLATERAL_RAW),
], "collateral claim");

const balances = {
  userCollateral: await rawBalance(connection, userCollateral),
  custodyCollateral: await rawBalance(connection, custodyCollateral),
  userUsdc: await rawBalance(connection, userUsdc),
  custodyUsdc: await rawBalance(connection, custodyUsdc),
};
if (
  balances.userCollateral !== COLLATERAL_RAW
  || balances.custodyCollateral !== 0n
  || balances.userUsdc !== 0n
  || balances.custodyUsdc !== 0n
) {
  throw new Error(`Unexpected final balances: ${JSON.stringify(
    Object.fromEntries(Object.entries(balances).map(([key, value]) => [key, value.toString()])),
  )}`);
}

console.log(JSON.stringify({
  ok: true,
  network: "devnet",
  user: user.publicKey.toBase58(),
  custody: custody.publicKey.toBase58(),
  liabilityRaw: COLLATERAL_RAW.toString(),
  advanceRaw: ADVANCE_RAW.toString(),
  signatures,
  finalBalances: Object.fromEntries(
    Object.entries(balances).map(([key, value]) => [key, value.toString()]),
  ),
}, null, 2));
