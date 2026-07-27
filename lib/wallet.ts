import bs58 from "bs58";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect(): Promise<{ publicKey: { toString(): string } }>;
      disconnect?(): Promise<void>;
      signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
    };
  }
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
