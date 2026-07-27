"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export type LendingAction = "deposit" | "borrow" | "repay" | "withdraw";

export type ClientMarket = {
  symbol: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  priceFeedAccount: string;
  enabled: boolean;
};

type WalletProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
};

const INSTRUCTION_DISCRIMINATORS: Record<LendingAction, Uint8Array> = {
  deposit: new Uint8Array([156, 131, 142, 116, 146, 247, 162, 120]),
  borrow: new Uint8Array([228, 253, 131, 202, 207, 116, 89, 18]),
  repay: new Uint8Array([234, 103, 67, 82, 208, 234, 219, 166]),
  withdraw: new Uint8Array([115, 135, 168, 106, 139, 214, 138, 150]),
};
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function providerFromWindow() {
  return (window as unknown as { solana?: WalletProvider }).solana;
}

export function decimalToBaseUnits(value: string, decimals: number) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid collateral amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${decimals} decimal places are supported for this token.`);
  }
  const raw = BigInt(whole) * (10n ** BigInt(decimals))
    + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  if (raw > 18_446_744_073_709_551_615n) throw new Error("Amount exceeds the protocol limit.");
  return raw;
}

function instructionData(action: LendingAction, amount: bigint) {
  const data = new Uint8Array(16);
  data.set(INSTRUCTION_DISCRIMINATORS[action], 0);
  new DataView(data.buffer).setBigUint64(8, amount, true);
  return data;
}

export function deriveLendingAccounts(programIdValue: string, mintValue: string, ownerValue: string) {
  const programId = new PublicKey(programIdValue);
  const mint = new PublicKey(mintValue);
  const owner = new PublicKey(ownerValue);
  const [protocol] = PublicKey.findProgramAddressSync([new TextEncoder().encode("protocol")], programId);
  const [market] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("market"), mint.toBuffer()],
    programId,
  );
  const [position] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("position"), market.toBuffer(), owner.toBuffer()],
    programId,
  );
  return { programId, mint, owner, protocol, market, position };
}

function associatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function buildLendingInstruction(input: {
  action: LendingAction;
  amount: bigint;
  programId: string;
  owner: string;
  borrowMint: string;
  market: ClientMarket;
}) {
  const { programId, mint, owner, protocol, market, position } = deriveLendingAccounts(
    input.programId,
    input.market.mint,
    input.owner,
  );
  const borrowMint = new PublicKey(input.borrowMint);
  const tokenProgram = new PublicKey(input.market.tokenProgram);
  const ownerCollateralAccount = associatedTokenAddress(mint, owner, tokenProgram);
  const collateralVault = associatedTokenAddress(mint, market, tokenProgram);
  const ownerBorrowAccount = associatedTokenAddress(borrowMint, owner, tokenProgram);
  const liquidityVault = associatedTokenAddress(borrowMint, protocol, tokenProgram);

  const keys = input.action === "deposit" || input.action === "withdraw"
    ? [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: protocol, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: ownerCollateralAccount, isSigner: false, isWritable: true },
        { pubkey: collateralVault, isSigner: false, isWritable: true },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ...(input.action === "deposit"
          ? [{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }]
          : []),
      ]
    : input.action === "borrow"
      ? [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: protocol, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: borrowMint, isSigner: false, isWritable: false },
          { pubkey: market, isSigner: false, isWritable: true },
          { pubkey: position, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(input.market.priceFeedAccount), isSigner: false, isWritable: false },
          { pubkey: liquidityVault, isSigner: false, isWritable: true },
          { pubkey: ownerBorrowAccount, isSigner: false, isWritable: true },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ]
      : [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: protocol, isSigner: false, isWritable: false },
          { pubkey: borrowMint, isSigner: false, isWritable: false },
          { pubkey: market, isSigner: false, isWritable: true },
          { pubkey: position, isSigner: false, isWritable: true },
          { pubkey: ownerBorrowAccount, isSigner: false, isWritable: true },
          { pubkey: liquidityVault, isSigner: false, isWritable: true },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ];

  return new TransactionInstruction({
    programId,
    keys,
    data: instructionData(input.action, input.amount),
  });
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
    data: new Uint8Array([1]),
  });
}

export async function sendLendingTransaction(input: {
  action: LendingAction;
  amount: string;
  programId: string;
  borrowMint: string;
  borrowDecimals: number;
  rpcUrl: string;
  verifiedWallet: string;
  market: ClientMarket;
}) {
  const provider = providerFromWindow();
  if (!provider?.isPhantom) throw new Error("Open Phantom to submit this transaction.");
  const connected = await provider.connect();
  const owner = connected.publicKey.toString();
  if (owner !== input.verifiedWallet) {
    throw new Error("The connected wallet does not match your verified SolCage wallet.");
  }

  const rawAmount = decimalToBaseUnits(
    input.amount,
    input.action === "deposit" || input.action === "withdraw"
      ? input.market.decimals
      : input.borrowDecimals,
  );
  const connection = new Connection(input.rpcUrl, "confirmed");
  const instruction = buildLendingInstruction({
    action: input.action,
    amount: rawAmount,
    programId: input.programId,
    owner,
    borrowMint: input.borrowMint,
    market: input.market,
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: new PublicKey(owner),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  });
  if (input.action === "borrow") {
    const ownerKey = new PublicKey(owner);
    transaction.add(createAssociatedTokenAccountIdempotent({
      payer: ownerKey,
      owner: ownerKey,
      mint: new PublicKey(input.borrowMint),
      tokenProgram: new PublicKey(input.market.tokenProgram),
    }));
  }
  transaction.add(instruction);
  const signed = await provider.signAndSendTransaction(transaction);
  const confirmation = await connection.confirmTransaction(
    { signature: signed.signature, ...latest },
    "confirmed",
  );
  if (confirmation.value.err) throw new Error("The transaction failed on Solana.");
  return { signature: signed.signature, rawAmount: rawAmount.toString() };
}
