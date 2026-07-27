import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { custodyRuntimeConfig } from "./config.ts";

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export function associatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function createAssociatedTokenAccountIdempotent(input: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
}) {
  const account = associatedTokenAddress(input.mint, input.owner, input.tokenProgram);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export function transferCheckedInstruction(input: {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  amount: bigint;
  decimals: number;
  tokenProgram: PublicKey;
}) {
  const data = Buffer.alloc(10);
  data[0] = 12;
  data.writeBigUInt64LE(input.amount, 1);
  data[9] = input.decimals;
  return new TransactionInstruction({
    programId: input.tokenProgram,
    keys: [
      { pubkey: input.source, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.destination, isSigner: false, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function custodySigner() {
  const value = process.env.SOLCAGE_CUSTODY_SECRET_KEY?.trim();
  if (!value) throw new Error("Custody signing key is not configured");
  let secret: Uint8Array;
  try {
    secret = value.startsWith("[")
      ? new Uint8Array(JSON.parse(value) as number[])
      : bs58.decode(value);
  } catch {
    throw new Error("Custody signing key is malformed");
  }
  const signer = Keypair.fromSecretKey(secret);
  const expected = custodyRuntimeConfig().custodyAddress;
  if (!expected || signer.publicKey.toBase58() !== expected) {
    throw new Error("Custody signing key does not match the configured wallet");
  }
  return signer;
}

export function custodyConnection() {
  return new Connection(custodyRuntimeConfig().rpcUrl, "confirmed");
}

export async function sendCustodyTokenTransfer(input: {
  destinationOwner: string;
  mint: string;
  amount: bigint;
  decimals: number;
  tokenProgram: string;
}) {
  const signer = custodySigner();
  const destinationOwner = new PublicKey(input.destinationOwner);
  const mint = new PublicKey(input.mint);
  const tokenProgram = new PublicKey(input.tokenProgram);
  const source = associatedTokenAddress(mint, signer.publicKey, tokenProgram);
  const destination = associatedTokenAddress(mint, destinationOwner, tokenProgram);
  const connection = custodyConnection();
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    createAssociatedTokenAccountIdempotent({
      payer: signer.publicKey,
      owner: destinationOwner,
      mint,
      tokenProgram,
    }),
    transferCheckedInstruction({
      source,
      mint,
      destination,
      authority: signer.publicKey,
      amount: input.amount,
      decimals: input.decimals,
      tokenProgram,
    }),
  );
  const signature = await connection.sendTransaction(transaction, [signer], {
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "finalized");
  if (confirmation.value.err) throw new Error("Custody transfer failed on Solana");
  return signature;
}

type ParsedTransaction = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown } | null;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer?: boolean }>;
      instructions: Array<{
        programId?: string;
        parsed?: {
          type?: string;
          info?: {
            authority?: string;
            source?: string;
            destination?: string;
            mint?: string;
            tokenAmount?: { amount?: string; decimals?: number };
          };
        };
      }>;
    };
  };
};

export async function verifyIncomingTransfer(input: {
  signature: string;
  owner: string;
  destinationOwner: string;
  mint: string;
  amount: bigint;
  decimals: number;
  tokenProgram: string;
}) {
  if (bs58.decode(input.signature).length !== 64) throw new Error("Invalid transaction signature");
  const connection = custodyConnection();
  const transaction = await connection.getParsedTransaction(input.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  }) as unknown as ParsedTransaction | null;
  if (!transaction?.meta || transaction.meta.err) {
    throw new Error("Transaction is missing, unfinalized, or failed");
  }
  const signers = transaction.transaction.message.accountKeys
    .filter((key) => typeof key !== "string" && key.signer)
    .map((key) => typeof key === "string" ? key : key.pubkey);
  if (!signers.includes(input.owner)) throw new Error("Verified wallet did not sign the transfer");
  const mint = new PublicKey(input.mint);
  const owner = new PublicKey(input.owner);
  const destinationOwner = new PublicKey(input.destinationOwner);
  const tokenProgram = new PublicKey(input.tokenProgram);
  const expectedSource = associatedTokenAddress(mint, owner, tokenProgram).toBase58();
  const expectedDestination = associatedTokenAddress(mint, destinationOwner, tokenProgram).toBase58();
  const transfers = transaction.transaction.message.instructions.filter((instruction) => {
    const info = instruction.parsed?.info;
    return instruction.programId === input.tokenProgram
      && instruction.parsed?.type === "transferChecked"
      && info?.authority === input.owner
      && info?.source === expectedSource
      && info?.destination === expectedDestination
      && info?.mint === input.mint
      && info?.tokenAmount?.amount === input.amount.toString()
      && info?.tokenAmount?.decimals === input.decimals;
  });
  if (transfers.length !== 1) throw new Error("Transaction does not contain the expected custody transfer");
  return {
    signature: input.signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    source: expectedSource,
    destination: expectedDestination,
  };
}
