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

/**
 * Same-origin proxy rather than a public endpoint.
 *
 * NEXT_PUBLIC_ values are not inlined into client bundles here, so reading the
 * configured RPC from the browser silently fell back to the public one, which
 * rate-limits and often refuses browser traffic — that is why wallet balances
 * came back empty. The proxy uses the real endpoint server-side without
 * exposing its key.
 */
function rpcUrl() {
  return `${window.location.origin}/api/solana/rpc`;
}

/**
 * Poll for confirmation instead of Connection.confirmTransaction, which opens a
 * websocket subscription the proxy cannot serve.
 */
async function waitForConfirmation(connection: Connection, signature: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error("The transfer failed on Solana.");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  // Not fatal: the credit step below retries until the chain catches up.
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
const PENDING_KEY = "solcage:pending-deposits";

type PendingDeposit = { signature: string; rawAmount: string };

function readPending(): PendingDeposit[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(entries: PendingDeposit[]) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(entries.slice(-10)));
  } catch {
    /* storage unavailable — the deposit still credits, just without the retry */
  }
}

function rememberPending(entry: PendingDeposit) {
  const entries = readPending().filter((item) => item.signature !== entry.signature);
  writePending([...entries, entry]);
}

function forgetPending(signature: string) {
  writePending(readPending().filter((item) => item.signature !== signature));
}

/**
 * Credit any deposit that reached the chain but never got confirmed back to the
 * server — a closed tab or a slow finalization would otherwise strand it. The
 * endpoint keys on the signature, so replaying a credited one is a no-op.
 */
export async function flushPendingDeposits(): Promise<number> {
  let credited = 0;
  for (const entry of readPending()) {
    try {
      const response = await fetch("/api/wallet/deposits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature: entry.signature, rawAmount: entry.rawAmount }),
      });
      const payload = await response.json();
      if (response.ok) {
        forgetPending(entry.signature);
        if (payload.credited) credited += 1;
      } else if (!/missing|unfinalized|not.*found/i.test(payload.error ?? "")) {
        // A permanent rejection will never succeed on a retry; stop replaying it.
        forgetPending(entry.signature);
      }
    } catch {
      /* offline — try again next time */
    }
  }
  return credited;
}

export async function depositSol(amountLamports: bigint, onProgress?: DepositProgress) {
  if (amountLamports <= 0n) throw new Error("Enter an amount to deposit");
  const owner = await connectedWallet();

  // The server credits the wallet this session is verified as. If Phantom has
  // since been switched to a different account, the transfer would be signed by
  // one wallet and credited to another — the server rejects it, but only after
  // the SOL has already left. Check before anything is signed.
  const me = await fetch("/api/me").then((r) => r.json()).catch(() => null);
  if (me?.walletAddress && me.walletAddress !== owner) {
    throw new Error(
      `Phantom is on ${owner.slice(0, 4)}…${owner.slice(-4)} but you signed in as `
      + `${me.walletAddress.slice(0, 4)}…${me.walletAddress.slice(-4)}. `
      + "Switch Phantom back to that wallet, or sign in with this one.",
    );
  }

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

  // Recorded the moment it is broadcast, so the credit can be replayed if this
  // page closes or finalization outruns the loop below. Cleared once credited.
  rememberPending({ signature, rawAmount: amountLamports.toString() });

  onProgress?.("confirming");
  await waitForConfirmation(connection, signature);

  // The server verifies at finalized commitment, which lags confirmed by a few
  // seconds, so retry the credit until the transaction is visible there.
  onProgress?.("crediting");
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const response = await fetch("/api/wallet/deposits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature, rawAmount: amountLamports.toString() }),
    });
    const payload = await response.json();
    if (response.ok) {
      forgetPending(signature);
      return payload;
    }
    if (!/missing|unfinalized|not.*found/i.test(payload.error ?? "")) {
      forgetPending(signature);
      throw new Error(payload.error ?? "Deposit could not be credited");
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  // Left in the pending list on purpose: the next cashier open replays it.
  throw new Error("Your deposit is on-chain and will credit as soon as it finalizes. Reopen the cashier in a moment to check.");
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
