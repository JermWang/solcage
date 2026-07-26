import { db, ensureSchema } from "@/lib/db";
import { json } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const leaders = await db().query(
      `WITH reward_totals AS (
         SELECT user_id, SUM(points)::int AS points, COUNT(*)::int AS events
         FROM reward_ledger
         GROUP BY user_id
       ), referral_totals AS (
         SELECT referred_by AS user_id, COUNT(*)::int AS referrals
         FROM users
         WHERE referred_by IS NOT NULL AND wallet_verified_at IS NOT NULL
         GROUP BY referred_by
       )
       SELECT u.username, u.display_name, u.avatar_url, u.referral_code,
              COALESCE(rt.points, 0)::int AS points,
              COALESCE(rt.events, 0)::int AS events,
              COALESCE(rf.referrals, 0)::int AS referrals
       FROM users u
       LEFT JOIN reward_totals rt ON rt.user_id = u.id
       LEFT JOIN referral_totals rf ON rf.user_id = u.id
       WHERE u.wallet_verified_at IS NOT NULL
       ORDER BY COALESCE(rt.points, 0) DESC, u.created_at ASC
       LIMIT 100`,
    );
    return json({ updatedAt: new Date().toISOString(), leaders: leaders.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      points: row.points,
      events: row.events,
      referrals: row.referrals,
    })) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Leaderboard unavailable" }, 503);
  }
}
