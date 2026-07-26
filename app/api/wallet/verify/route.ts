import bs58 from "bs58";
import nacl from "tweetnacl";
import { transaction } from "@/lib/db";
import { json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as { wallet?: string; nonce?: string; signature?: string };
    const wallet = String(body.wallet ?? "");
    const nonce = String(body.nonce ?? "");
    const signature = String(body.signature ?? "");
    await transaction(async (client) => {
      const challenge = await client.query(
        `SELECT message, wallet_address FROM wallet_challenges
         WHERE nonce = $1 AND user_id = $2 AND expires_at > NOW() FOR UPDATE`,
        [nonce, identity.userId],
      );
      if (!challenge.rowCount || challenge.rows[0].wallet_address !== wallet) throw new Error("Wallet challenge expired");
      const valid = nacl.sign.detached.verify(
        new TextEncoder().encode(challenge.rows[0].message),
        bs58.decode(signature),
        bs58.decode(wallet),
      );
      if (!valid) throw new Error("Signature verification failed");
      const conflict = await client.query(
        `SELECT 1 FROM users WHERE wallet_address = $1 AND wallet_verified_at IS NOT NULL AND id <> $2`,
        [wallet, identity.userId],
      );
      if (conflict.rowCount) throw new Error("This wallet is already connected to another profile");
      await client.query(
        "UPDATE users SET wallet_address = $1, wallet_verified_at = NOW(), updated_at = NOW() WHERE id = $2",
        [wallet, identity.userId],
      );
      await client.query("DELETE FROM wallet_challenges WHERE nonce = $1", [nonce]);
      await awardPoints(client, {
        userId: identity.userId,
        kind: "wallet_verified",
        basePoints: 150,
        description: "Verified a Solana wallet",
        eventKey: `wallet-verified-${wallet}`,
        metadata: { wallet },
      });
      const user = await client.query("SELECT referred_by FROM users WHERE id = $1", [identity.userId]);
      const referrer = user.rows[0].referred_by as string | null;
      if (referrer) {
        await awardPoints(client, {
          userId: identity.userId,
          kind: "referral_join",
          basePoints: 200,
          description: "Verified a referred account",
          eventKey: `referral-join-${identity.userId}`,
        });
        await client.query(
          `INSERT INTO reward_ledger
           (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
           VALUES ($1, $2, 'referral_signup', 250, 1, 250, 'Verified player referral', $3, $4::jsonb)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), referrer, `referral-signup-${identity.userId}`, JSON.stringify({ referredUserId: identity.userId })],
        );
      }
    });
    return json({ verified: true, profile: await profileSnapshot(identity.userId) }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to verify wallet" }, 400);
  }
}
