import { transaction } from "@/lib/db";
import { json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as { code?: string };
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!/^[A-Z2-9]{8,12}$/.test(code)) return json({ error: "Invalid referral code" }, 400, identity);
    const claimed = await transaction(async (client) => {
      const self = await client.query("SELECT referred_by, referral_code FROM users WHERE id = $1 FOR UPDATE", [identity.userId]);
      if (self.rows[0].referred_by) return false;
      if (self.rows[0].referral_code === code) throw new Error("You cannot refer yourself");
      const referrer = await client.query("SELECT id FROM users WHERE referral_code = $1", [code]);
      if (!referrer.rowCount) throw new Error("Referral code not found");
      await client.query("UPDATE users SET referred_by = $1, updated_at = NOW() WHERE id = $2", [referrer.rows[0].id, identity.userId]);
      await awardPoints(client, {
        userId: identity.userId,
        kind: "referral_join",
        basePoints: 200,
        description: "Joined through a referral",
        eventKey: `referral-join-${identity.userId}`,
        metadata: { code },
      });
      await client.query(
        `INSERT INTO reward_ledger
         (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
         VALUES ($1, $2, 'referral_signup', 250, 1, 250, 'New player referral', $3, $4::jsonb)
         ON CONFLICT (event_key) DO NOTHING`,
        [crypto.randomUUID(), referrer.rows[0].id, `referral-signup-${identity.userId}`, JSON.stringify({ referredUserId: identity.userId })],
      );
      return true;
    });
    return json({ claimed, profile: await profileSnapshot(identity.userId) }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to claim referral" }, 400);
  }
}
