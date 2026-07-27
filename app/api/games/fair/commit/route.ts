import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, ensureSchema } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

const supportedGames = new Set(["baccarat", "video-poker", "dice", "roulette", "slots", "plinko", "blackjack", "mines", "crash", "keno"]);

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const game = String(body.game ?? "").toLowerCase();
    if (!supportedGames.has(game)) return json({ error: "Unsupported game" }, 400, identity);

    await ensureSchema();
    const roundId = randomUUID();
    const serverSeed = randomBytes(32).toString("hex");
    const serverHash = createHash("sha256").update(serverSeed).digest("hex");

    await db().query(
      `INSERT INTO game_fair_rounds
       (id, user_id, game, server_seed, server_seed_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [roundId, identity.userId, game, serverSeed, serverHash],
    );

    return json({
      roundId,
      game,
      serverHash,
      status: "committed",
      expiresInSeconds: 600,
    }, 201, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to commit round" }, 400);
  }
}
