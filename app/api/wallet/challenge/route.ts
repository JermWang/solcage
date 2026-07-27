import bs58 from "bs58";
import { db, ensureSchema } from "@/lib/db";
import { json } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Sign-in is wallet-first, so the challenge is issued before any account
// exists. It is bound to the wallet address and nonce, never to a session.
export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as { wallet?: string };
    const wallet = String(body.wallet ?? "").trim();
    if (bs58.decode(wallet).length !== 32) return json({ error: "Invalid Solana wallet" }, 400);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const host = new URL(request.url).host;
    const message = `SolCage wallet verification\n\nWallet: ${wallet}\nNonce: ${nonce}\nHost: ${host}`;
    await db().query(
      "DELETE FROM wallet_challenges WHERE wallet_address = $1 OR expires_at < NOW()",
      [wallet],
    );
    await db().query(
      `INSERT INTO wallet_challenges (nonce, wallet_address, message, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
      [nonce, wallet, message],
    );
    return json({ nonce, message }, 200);
  } catch {
    return json({ error: "Unable to create wallet challenge" }, 400);
  }
}
