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
  // getParsedTransaction returns PublicKey objects for account keys and program
  // ids, not base58 strings, so every comparison must normalise to a string
  // first. Comparing a PublicKey to a string is always false — which silently
  // rejected every genuine deposit.
  const base58 = (value: unknown) => (value == null ? "" : String(value));
  const systemProgram = SystemProgram.programId.toBase58();
  const signers = transaction.transaction.message.accountKeys
    .filter((key) => typeof key !== "string" && key.signer)
    .map((key) => (typeof key === "string" ? key : base58(key.pubkey)));
  if (!signers.includes(input.owner)) throw new Error("Verified wallet did not sign the transfer");

  const transfers = transaction.transaction.message.instructions.filter((instruction) => {
    const info = instruction.parsed?.info ?? {};
    return base58(instruction.programId) === systemProgram
      && instruction.parsed?.type === "transfer"
      && base58(info.source) === input.owner
      && base58(info.destination) === input.destination
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
/**
 * Poll for confirmation rather than using Connection.confirmTransaction, which
 * opens a websocket subscription. When that subscription stalls it throws even
 * though the transfer landed — which is how a withdrawal ended up sent on-chain
 * while its row never advanced past `sending`.
 *
 * Returns "landed" or throws. A blockhash that expires with no status is the one
 * case where we can say for certain the transfer never happened.
 */
async function confirmBySignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error("Withdrawal transfer failed on Solana");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return { slot: status.slot };
    }
    if (!status && attempt % 5 === 4) {
      const height = await connection.getBlockHeight("confirmed");
      if (height > lastValidBlockHeight) {
        throw new BlockhashExpired("Withdrawal expired before it was accepted");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  // Landed or not, we cannot say — the caller must reconcile from the signature
  // rather than assume either way.
  throw new ConfirmationUnknown(signature);
}

/** The transfer provably never landed, so the funds can be safely returned. */
export class BlockhashExpired extends Error {}

/** The transfer may or may not have landed. Never refund on this without checking. */
export class ConfirmationUnknown extends Error {
  signature: string;
  constructor(signature: string) {
    super("Withdrawal confirmation timed out; verify the signature before retrying");
    this.signature = signature;
  }
}

export async function sendHouseSol(input: {
  destination: string;
  lamports: bigint;
  /** Called with the signature the instant it is broadcast, before confirmation. */
  onBroadcast?: (signature: string) => Promise<void>;
}) {
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
  // Persist the signature before confirming. If confirmation stalls or the
  // request dies here, the transfer is already on the wire and this is the only
  // record of it — without it the money is spent with nothing pointing to it.
  await input.onBroadcast?.(signature);

  const confirmed = await confirmBySignature(connection, signature, latest.lastValidBlockHeight);
  return { signature, slot: confirmed.slot };
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
