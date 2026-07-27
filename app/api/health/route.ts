import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await ensureSchema();
    const result = await db().query(
      `SELECT COUNT(*)::int AS ready_tables
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users', 'sessions', 'wallet_challenges', 'reward_ledger', 'loan_history', 'game_history', 'game_fair_rounds')`,
    );
    const readyTables = result.rows[0]?.ready_tables ?? 0;
    if (readyTables !== 7) throw new Error("Persistence schema is incomplete");
    return Response.json(
      {
        status: "ok",
        services: { api: "ready", database: "connected" },
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "degraded",
        services: { api: "ready", database: "unavailable" },
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
