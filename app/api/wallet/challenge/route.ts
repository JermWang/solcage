import bs58 from "bs58";
import { db } from "@/lib/db";
import { json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as { wallet?: string };
    const wallet = String(body.wallet ?? "").trim();
    if (bs58.decode(wallet).length !== 32) return json({ error: "Invalid Solana wallet" }, 400, identity);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const host = new URL(request.url).host;
    const message = `SolCage wallet verification\n\nWallet: ${wallet}\nNonce: ${nonce}\nHost: ${host}`;
    await db().query("DELETE FROM wallet_challenges WHERE user_id = $1 OR expires_at < NOW()", [identity.userId]);
    await db().query(
      `INSERT INTO wallet_challenges (nonce, user_id, wallet_address, message, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [nonce, identity.userId, wallet, message],
    );
    return json({ nonce, message }, 200, identity);
  } catch {
    return json({ error: "Unable to create wallet challenge" }, 400);
  }
}
