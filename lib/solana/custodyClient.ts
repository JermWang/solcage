"use client";

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

type WalletProvider = {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
};

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function providerFromWindow() {
  return (window as unknown as { solana?: WalletProvider }).solana;
}

export function decimalToCustodyBaseUnits(value: string, decimals: number) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`${decimals} decimal places are supported.`);
  const raw = BigInt(whole) * (10n ** BigInt(decimals))
    + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  if (raw > 18_446_744_073_709_551_615n) throw new Error("Amount is too large.");
  return raw;
}

function associatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function createAssociatedTokenAccountIdempotent(input: {
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

function transferChecked(input: {
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

export async function sendCustodyDeposit(input: {
  amount: string;
  decimals: number;
  mint: string;
  tokenProgram: string;
  custodyAddress: string;
  rpcUrl: string;
  verifiedWallet: string;
}) {
  const provider = providerFromWindow();
  if (!provider?.isPhantom) throw new Error("Open Phantom to submit this transfer.");
  const connected = await provider.connect();
  const owner = new PublicKey(connected.publicKey.toString());
  if (owner.toBase58() !== input.verifiedWallet) {
    throw new Error("Connected wallet does not match your verified SolCage wallet.");
  }
  const mint = new PublicKey(input.mint);
  const tokenProgram = new PublicKey(input.tokenProgram);
  const custody = new PublicKey(input.custodyAddress);
  const amount = decimalToCustodyBaseUnits(input.amount, input.decimals);
  const connection = new Connection(input.rpcUrl, "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: owner,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    createAssociatedTokenAccountIdempotent({
      payer: owner,
      owner: custody,
      mint,
      tokenProgram,
    }),
    transferChecked({
      source: associatedTokenAddress(mint, owner, tokenProgram),
      mint,
      destination: associatedTokenAddress(mint, custody, tokenProgram),
      authority: owner,
      amount,
      decimals: input.decimals,
      tokenProgram,
    }),
  );
  const signed = await provider.signAndSendTransaction(transaction);
  const confirmation = await connection.confirmTransaction(
    { signature: signed.signature, ...latest },
    "finalized",
  );
  if (confirmation.value.err) throw new Error("The custody transfer failed on Solana.");
  return { signature: signed.signature, rawAmount: amount.toString() };
}
