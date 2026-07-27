import bs58 from "bs58";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { houseConfig } from "./house.ts";

/**
 * Native SOL movement for the house bankroll.
 *
 * The custody helpers only speak SPL, and native SOL is not an SPL transfer —
 * it is a System Program instruction with no token account. This is the
 * equivalent path for the house wallet.
 */

/** Left in the wallet so it stays rent-exempt and can still pay fees. */
export const HOUSE_RESERVE_LAMPORTS = 20_000_000n; // 0.02 SOL

type ParsedInstruction = {
  programId: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

type ParsedTransaction = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown } | null;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer: boolean }>;
      instructions: ParsedInstruction[];
    };
  };
};

export function houseConnection() {
  const url = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return new Connection(url, "confirmed");
}

/** Accepts a JSON byte array or a base58 secret, and refuses a mismatched wallet. */
export function houseSigner() {
  const value = process.env.SOLCAGE_HOUSE_SECRET_KEY?.trim();
  if (!value) throw new Error("House signing key is not configured");
  let secret: Uint8Array;
  try {
    secret = value.startsWith("[")
      ? new Uint8Array(JSON.parse(value) as number[])
      : bs58.decode(value);
  } catch {
    throw new Error("House signing key is malformed");
  }
  const signer = Keypair.fromSecretKey(secret);
  const expected = houseConfig().wallet;
  if (!expected || signer.publicKey.toBase58() !== expected) {
    throw new Error("House signing key does not match the configured wallet");
  }
  return signer;
}

/**
 * Confirm that a player really sent SOL to the house wallet.
 *
 * Checked against the finalized chain, never the client's word: the verified
 * wallet must have signed, and the transaction must contain exactly one System
 * transfer of the stated amount to the house.
 */
export async function verifyIncomingSol(input: {
  signature: string;
  owner: string;
  destination: string;
  lamports: bigint;
}) {
  if (bs58.decode(input.signature).length !== 64) throw new Error("Invalid transaction signature");
  const connection = houseConnection();
  const transaction = await connection.getParsedTransaction(input.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  }) as unknown as ParsedTransaction | null;
  if (!transaction?.meta || transaction.meta.err) {
    throw new Error("Transaction is missing, unfinalized, or failed");
  }
  const signers = transaction.transaction.message.accountKeys
    .filter((key) => typeof key !== "string" && key.signer)
    .map((key) => (typeof key === "string" ? key : key.pubkey));
  if (!signers.includes(input.owner)) throw new Error("Verified wallet did not sign the transfer");

  const transfers = transaction.transaction.message.instructions.filter((instruction) => {
    const info = instruction.parsed?.info ?? {};
    return instruction.programId === SystemProgram.programId.toBase58()
      && instruction.parsed?.type === "transfer"
      && info.source === input.owner
      && info.destination === input.destination
      && String(info.lamports) === input.lamports.toString();
  });
  if (transfers.length !== 1) {
    throw new Error("Transaction does not contain the expected deposit transfer");
  }
  return { signature: input.signature, slot: transaction.slot, blockTime: transaction.blockTime };
}

/**
 * Send SOL from the house wallet.
 *
 * Solana offers no idempotency key, so a caller must never retry this blindly:
 * a transaction that timed out may still land. The withdrawal service claims a
 * row into SENDING before calling this and leaves a stuck row for manual
 * reconciliation rather than re-sending.
 */
export async function sendHouseSol(input: { destination: string; lamports: bigint }) {
  const signer = houseSigner();
  const connection = houseConnection();
  const destination = new PublicKey(input.destination);

  const balance = BigInt(await connection.getBalance(signer.publicKey, "confirmed"));
  if (balance < input.lamports + HOUSE_RESERVE_LAMPORTS) {
    throw new Error(
      `House wallet is short: holds ${Number(balance) / LAMPORTS_PER_SOL} SOL, needs ${
        Number(input.lamports + HOUSE_RESERVE_LAMPORTS) / LAMPORTS_PER_SOL
      } including the fee reserve`,
    );
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: destination,
      lamports: Number(input.lamports),
    }),
  );
  transaction.sign(signer);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "confirmed",
  );
  if (confirmation.value.err) throw new Error("Withdrawal transfer failed on Solana");
  return { signature, slot: confirmation.context.slot };
}

/** Spendable house balance, excluding the fee reserve. */
export async function houseTreasuryOnChain() {
  const signer = houseConfig().wallet;
  if (!signer) return { lamports: 0n, spendable: 0n };
  const connection = houseConnection();
  const lamports = BigInt(await connection.getBalance(new PublicKey(signer), "confirmed"));
  const spendable = lamports > HOUSE_RESERVE_LAMPORTS ? lamports - HOUSE_RESERVE_LAMPORTS : 0n;
  return { lamports, spendable };
}
