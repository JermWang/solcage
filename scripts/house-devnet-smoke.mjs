/**
 * Devnet round trip for the house bankroll's on-chain path.
 *
 * Exercises the two pieces that handle real money and had never executed:
 *   1. a player deposit, verified the way the server verifies it
 *   2. a withdrawal sent out of the house wallet
 *
 * Runs entirely on devnet. Nothing here touches the mainnet house wallet.
 */
import fs from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PLAYER_PATH = process.env.SOLCAGE_DEVNET_DEPLOYER_KEYPAIR
  ?? "tmp/solcage-devnet-deployer-keypair.json";
const DEPOSIT_LAMPORTS = 20_000_000n; // 0.02 SOL
const WITHDRAW_LAMPORTS = 8_000_000n; // 0.008 SOL
const HOUSE_RESERVE_LAMPORTS = 20_000_000n;

function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}

/** Mirror of lib/house-solana.ts verifyIncomingSol, against a parsed tx. */
async function verifyIncomingSol(connection, { signature, owner, destination, lamports }) {
  const tx = await connection.getParsedTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta || tx.meta.err) throw new Error("Transaction missing, unfinalized, or failed");
  const signers = tx.transaction.message.accountKeys
    .filter((k) => k.signer)
    .map((k) => k.pubkey.toBase58());
  if (!signers.includes(owner)) throw new Error("Verified wallet did not sign the transfer");
  const transfers = tx.transaction.message.instructions.filter((ix) => {
    const info = ix.parsed?.info ?? {};
    return ix.programId.toBase58() === SystemProgram.programId.toBase58()
      && ix.parsed?.type === "transfer"
      && info.source === owner
      && info.destination === destination
      && String(info.lamports) === lamports.toString();
  });
  if (transfers.length !== 1) throw new Error("Expected exactly one matching deposit transfer");
  return { slot: tx.slot, blockTime: tx.blockTime };
}

const connection = new Connection(RPC_URL, "confirmed");
const player = loadKeypair(PLAYER_PATH);
// Ephemeral house wallet: this must never reuse the mainnet key.
const house = Keypair.generate();

const playerStart = BigInt(await connection.getBalance(player.publicKey, "confirmed"));
if (playerStart < DEPOSIT_LAMPORTS + HOUSE_RESERVE_LAMPORTS + 10_000_000n) {
  throw new Error(
    `Devnet player wallet needs more SOL (has ${Number(playerStart) / LAMPORTS_PER_SOL})`,
  );
}

// --- 1. deposit: player -> house -----------------------------------------
const depositTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: player.publicKey,
    toPubkey: house.publicKey,
    lamports: Number(DEPOSIT_LAMPORTS + HOUSE_RESERVE_LAMPORTS),
  }),
);
const depositSig = await sendAndConfirmTransaction(connection, depositTx, [player], {
  commitment: "finalized",
});

// Verify exactly as the server would, including the amount check.
const verified = await verifyIncomingSol(connection, {
  signature: depositSig,
  owner: player.publicKey.toBase58(),
  destination: house.publicKey.toBase58(),
  lamports: DEPOSIT_LAMPORTS + HOUSE_RESERVE_LAMPORTS,
});

// A wrong amount must be rejected, not quietly accepted.
let rejectedWrongAmount = false;
try {
  await verifyIncomingSol(connection, {
    signature: depositSig,
    owner: player.publicKey.toBase58(),
    destination: house.publicKey.toBase58(),
    lamports: 999n,
  });
} catch {
  rejectedWrongAmount = true;
}
if (!rejectedWrongAmount) throw new Error("Verifier accepted a mismatched amount");

// A different claimed sender must also be rejected.
let rejectedWrongOwner = false;
try {
  await verifyIncomingSol(connection, {
    signature: depositSig,
    owner: house.publicKey.toBase58(),
    destination: house.publicKey.toBase58(),
    lamports: DEPOSIT_LAMPORTS + HOUSE_RESERVE_LAMPORTS,
  });
} catch {
  rejectedWrongOwner = true;
}
if (!rejectedWrongOwner) throw new Error("Verifier accepted a mismatched sender");

// --- 2. withdrawal: house -> player --------------------------------------
const houseBalance = BigInt(await connection.getBalance(house.publicKey, "confirmed"));
if (houseBalance < WITHDRAW_LAMPORTS + HOUSE_RESERVE_LAMPORTS) {
  throw new Error("House wallet cannot cover the withdrawal plus its reserve");
}
const withdrawTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: house.publicKey,
    toPubkey: player.publicKey,
    lamports: Number(WITHDRAW_LAMPORTS),
  }),
);
const withdrawSig = await sendAndConfirmTransaction(connection, withdrawTx, [house], {
  commitment: "confirmed",
});

const houseEnd = BigInt(await connection.getBalance(house.publicKey, "confirmed"));
if (houseEnd < HOUSE_RESERVE_LAMPORTS - 5_000_000n) {
  throw new Error(`House wallet fell below its reserve: ${houseEnd}`);
}

console.log(JSON.stringify({
  ok: true,
  network: "devnet",
  player: player.publicKey.toBase58(),
  house: house.publicKey.toBase58(),
  deposit: {
    signature: depositSig,
    lamports: (DEPOSIT_LAMPORTS + HOUSE_RESERVE_LAMPORTS).toString(),
    slot: verified.slot,
    rejectedWrongAmount,
    rejectedWrongOwner,
  },
  withdrawal: { signature: withdrawSig, lamports: WITHDRAW_LAMPORTS.toString() },
  houseBalanceAfter: houseEnd.toString(),
}, null, 2));
