import bs58 from "bs58";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      publicKey?: { toString(): string } | null;
      connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
      disconnect?(): Promise<void>;
      signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
      // The Phantom-recommended path: sign and submit in one call. The
      // deprecated signTransaction/signAllTransactions are deliberately unused.
      signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
    };
  }
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/** Parse a decimal SOL string into lamports with no floating-point drift. */
export function solToLamports(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error("Enter a valid amount");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 9) throw new Error("Too many decimals for SOL");
  return BigInt((whole || "0") + fraction.padEnd(9, "0"));
}

export function lamportsToSol(lamports: bigint, maxDecimals = 4): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Connected wallet pubkey, reconnecting silently if Phantom already trusts us. */
async function connectedWallet(): Promise<string> {
  const provider = window.solana;
  if (!provider?.isPhantom) throw new Error("Open your Phantom wallet to continue.");
  if (provider.publicKey) return provider.publicKey.toString();
  const connection = await provider.connect({ onlyIfTrusted: false });
  return connection.publicKey.toString();
}

/** Read the connected wallet's on-chain SOL balance, in lamports. */
export async function readWalletSol(): Promise<bigint> {
  const owner = await connectedWallet();
  const connection = new Connection(rpcUrl(), "confirmed");
  const lamports = await connection.getBalance(new PublicKey(owner), "confirmed");
  return BigInt(lamports);
}

type DepositProgress = (stage: "signing" | "confirming" | "crediting") => void;

/**
 * One-click deposit.
 *
 * Reads the house deposit address from the server, builds a plain SOL transfer
 * — the simplest, cleanest transaction there is, so Phantom raises no warning —
 * has the wallet sign and send it, then hands the signature to the server to
 * verify on-chain and credit. The player never has to see or copy an address.
 */
export async function depositSol(amountLamports: bigint, onProgress?: DepositProgress) {
  if (amountLamports <= 0n) throw new Error("Enter an amount to deposit");
  const owner = await connectedWallet();

  const info = await fetch("/api/wallet/balance").then((r) => r.json());
  if (info.error) throw new Error(info.error);
  if (info.wagering !== "open" || !info.depositAddress) throw new Error("The cashier is not open yet.");

  const connection = new Connection(rpcUrl(), "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: new PublicKey(owner),
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(owner),
      toPubkey: new PublicKey(info.depositAddress),
      lamports: Number(amountLamports),
    }),
  );

  onProgress?.("signing");
  const { signature } = await window.solana!.signAndSendTransaction(transaction);

  onProgress?.("confirming");
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  // The server verifies at finalized commitment, which lags confirmed by a few
  // seconds, so retry the credit until the transaction is visible there.
  onProgress?.("crediting");
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch("/api/wallet/deposits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature, rawAmount: amountLamports.toString() }),
    });
    const payload = await response.json();
    if (response.ok) return payload;
    if (!/missing|unfinalized|not.*found/i.test(payload.error ?? "")) {
      throw new Error(payload.error ?? "Deposit could not be credited");
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("Deposit sent but not yet finalized. It will credit shortly — check your balance.");
}

/** Withdraw to the connected wallet. Server sends the SOL out of the house. */
export async function withdrawSol(amountLamports: bigint) {
  if (amountLamports <= 0n) throw new Error("Enter an amount to withdraw");
  const destination = await connectedWallet();
  const response = await fetch("/api/wallet/withdrawals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawAmount: amountLamports.toString(), destination }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Withdrawal failed");
  return payload as { status: string; signature: string | null; amount: string; requiresReview?: boolean };
}

/**
 * Full sign-in: connect Phantom, sign the server's challenge, and exchange the
 * signature for a session. Shared so the nav menu and the profile page cannot
 * drift apart.
 */
export async function signInWithWallet() {
  const provider = window.solana;
  if (!provider?.isPhantom) throw new Error("Install or open Phantom to continue.");
  const connection = await provider.connect();
  const wallet = connection.publicKey.toString();

  const challengeResponse = await fetch("/api/wallet/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok) throw new Error(challenge.error ?? "Unable to start verification");

  const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
  const verifyResponse = await fetch("/api/wallet/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, nonce: challenge.nonce, signature: bs58.encode(signed.signature) }),
  });
  const verified = await verifyResponse.json();
  if (!verifyResponse.ok) throw new Error(verified.error ?? "Wallet verification failed");
  return verified.profile;
}

/** Release the active account so Phantom offers the picker again. */
export async function releaseWallet() {
  try {
    await window.solana?.disconnect?.();
  } catch {
    /* nothing connected */
  }
}

/** Sign in as a different wallet than the one currently attached. */
export async function switchWallet() {
  await releaseWallet();
  return signInWithWallet();
}

export async function signOut() {
  const response = await fetch("/api/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Unable to sign out");
  await releaseWallet();
}
