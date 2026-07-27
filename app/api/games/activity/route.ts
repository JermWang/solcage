import { db, ensureSchema } from "@/lib/db";
import { json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    await ensureSchema();
    const result = await db().query<{
      username: string;
      game: string;
      payout: string;
    }>(
      `SELECT u.username, g.game, g.payout::text
       FROM game_history g
       JOIN users u ON u.id = g.user_id
       WHERE g.outcome = 'win'
       ORDER BY g.created_at DESC
       LIMIT 12`,
    );
    return json({
      activity: result.rows.map((row) => ({
        player: `${row.username.slice(0, 3)}•••`,
        game: row.game,
        payout: Number(row.payout),
      })),
    }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to load activity" }, 500);
  }
}
