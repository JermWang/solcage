import { db, ensureSchema } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    await ensureSchema();
    const [result, totals] = await Promise.all([
      db().query<{
        id: string;
        username: string;
        game: string;
        bet: string;
        outcome: string;
        payout: string;
        created_at: Date;
      }>(
        `SELECT g.id, u.username, g.game, g.bet::text, g.outcome,
                g.payout::text, g.created_at
         FROM game_history g
         JOIN users u ON u.id = g.user_id
         ORDER BY g.created_at DESC
         LIMIT 40`,
      ),
      db().query<{
        rounds: string;
        wagered: string;
        largest_payout: string;
        active_players: string;
      }>(
        `SELECT COUNT(*)::text AS rounds,
                COALESCE(SUM(bet), 0)::text AS wagered,
                COALESCE(MAX(payout), 0)::text AS largest_payout,
                COUNT(DISTINCT user_id)::text AS active_players
         FROM game_history`,
      ),
    ]);

    const rows = result.rows.map((row) => ({
      id: row.id,
      player: `${row.username.slice(0, 3)}•••`,
      game: row.game,
      bet: Number(row.bet),
      outcome: row.outcome,
      payout: Number(row.payout),
      multiplier: Number(row.bet) > 0
        ? Math.round((Number(row.payout) / Number(row.bet)) * 100) / 100
        : 0,
      createdAt: row.created_at,
    }));
    const floor = totals.rows[0];

    return json({
      activity: rows.filter((row) => row.outcome === "win").slice(0, 12),
      bets: rows,
      floor: {
        rounds: Number(floor.rounds),
        wagered: Number(floor.wagered),
        largestPayout: Number(floor.largest_payout),
        activePlayers: Number(floor.active_players),
      },
    }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to load activity" }, 500);
  }
}
