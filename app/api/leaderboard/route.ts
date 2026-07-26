import { db, ensureSchema } from "@/lib/db";
import { json } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const leaders = await db().query(
      `SELECT u.username, u.display_name, u.avatar_url, u.referral_code,
              COALESCE(SUM(l.points), 0)::int AS points,
              COUNT(l.id)::int AS events,
              COUNT(DISTINCT r.id)::int AS referrals
       FROM users u
       LEFT JOIN reward_ledger l ON l.user_id = u.id
       LEFT JOIN users r ON r.referred_by = u.id
       WHERE u.wallet_verified_at IS NOT NULL
       GROUP BY u.id
       ORDER BY points DESC, u.created_at ASC
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
