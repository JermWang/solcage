import bs58 from "bs58";
import nacl from "tweetnacl";
import { ensureSchema, transaction } from "@/lib/db";
import { accountForWallet, json, profileSnapshot, readIdentity, startSession } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/**
 * The only way to obtain a session. A valid signature over the issued
 * challenge signs the caller into the account owning that wallet, creating it
 * on first use. No signature, no account, no points.
 */
export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as { wallet?: string; nonce?: string; signature?: string };
    const wallet = String(body.wallet ?? "");
    const nonce = String(body.nonce ?? "");
    const signature = String(body.signature ?? "");
    // A pre-existing session only matters for referral attribution; it never
    // grants access on its own.
    const previous = await readIdentity(request);

    const result = await transaction(async (client) => {
      const challenge = await client.query(
        `SELECT message, wallet_address FROM wallet_challenges
         WHERE nonce = $1 AND expires_at > NOW() FOR UPDATE`,
        [nonce],
      );
      if (!challenge.rowCount || challenge.rows[0].wallet_address !== wallet) {
        throw new Error("Wallet challenge expired");
      }
      const valid = nacl.sign.detached.verify(
        new TextEncoder().encode(challenge.rows[0].message),
        bs58.decode(signature),
        bs58.decode(wallet),
      );
      if (!valid) throw new Error("Signature verification failed");
      await client.query("DELETE FROM wallet_challenges WHERE nonce = $1", [nonce]);

      const { userId, created } = await accountForWallet(client, wallet);
      await client.query(
        `UPDATE users SET wallet_address = $1, wallet_verified_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [wallet, userId],
      );
      await awardPoints(client, {
        userId,
        kind: "wallet_verified",
        basePoints: 150,
        description: "Verified a Solana wallet",
        eventKey: `wallet-verified-${wallet}`,
        metadata: { wallet },
      });

      // Carry a pending referral across from the pre-sign-in visit.
      if (created && previous?.userId && previous.userId !== userId) {
        const source = await client.query("SELECT referred_by FROM users WHERE id = $1", [previous.userId]);
        const pending = source.rowCount ? source.rows[0].referred_by as string | null : null;
        if (pending && pending !== userId) {
          await client.query("UPDATE users SET referred_by = $1 WHERE id = $2", [pending, userId]);
        }
      }

      const user = await client.query("SELECT referred_by FROM users WHERE id = $1", [userId]);
      const referrer = user.rows[0].referred_by as string | null;
      if (referrer) {
        await awardPoints(client, {
          userId,
          kind: "referral_join",
          basePoints: 200,
          description: "Verified a referred account",
          eventKey: `referral-join-${userId}`,
        });
        await client.query(
          `INSERT INTO reward_ledger
           (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
           VALUES ($1, $2, 'referral_signup', 250, 1, 250, 'Verified player referral', $3, $4::jsonb)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), referrer, `referral-signup-${userId}`, JSON.stringify({ referredUserId: userId })],
        );
      }

      const setCookie = await startSession(client, userId);
      return { userId, setCookie };
    });

    return json(
      { verified: true, profile: await profileSnapshot(result.userId) },
      200,
      { userId: result.userId, setCookie: result.setCookie },
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to verify wallet" }, 400);
  }
}
