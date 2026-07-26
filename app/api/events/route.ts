import { transaction } from "@/lib/db";
import { json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const kind = String(body.kind ?? "");
    const eventKey = String(body.eventKey ?? "");
    if (!/^[a-z0-9-]{12,100}$/i.test(eventKey)) return json({ error: "Invalid event key" }, 400, identity);
    const result = await transaction(async (client) => {
      if (kind === "loan_draw") {
        const asset = String(body.asset ?? "").toUpperCase().slice(0, 16);
        const collateralAmount = Number(body.collateralAmount);
        const collateralValue = Number(body.collateralValue);
        const chipsDrawn = Number(body.chipsDrawn);
        if (!asset || !Number.isFinite(collateralAmount) || !Number.isFinite(collateralValue) || !Number.isFinite(chipsDrawn) || collateralValue <= 0 || chipsDrawn <= 0) throw new Error("Invalid loan event");
        await client.query(
          `INSERT INTO loan_history
           (id, user_id, asset_symbol, collateral_amount, collateral_value, chips_drawn, event_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), identity.userId, asset, collateralAmount, collateralValue, chipsDrawn, eventKey],
        );
        return awardPoints(client, {
          userId: identity.userId,
          kind,
          basePoints: 50 + Math.min(450, Math.floor(collateralValue / 25)),
          description: `Opened a ${asset} collateral ticket`,
          eventKey,
          metadata: { asset, collateralAmount, collateralValue, chipsDrawn },
        });
      }
      if (kind === "game_round") {
        const game = String(body.game ?? "").slice(0, 32);
        const bet = Number(body.bet);
        const won = Boolean(body.won);
        const payout = Number(body.payout);
        if (!game || !Number.isFinite(bet) || !Number.isFinite(payout) || bet <= 0) throw new Error("Invalid game event");
        await client.query(
          `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), identity.userId, game, bet, won ? "win" : "loss", payout, eventKey],
        );
        return awardPoints(client, {
          userId: identity.userId,
          kind,
          basePoints: 10 + Math.min(90, Math.floor(bet / 2)) + (won ? 15 : 0),
          description: `${won ? "Won" : "Played"} a ${game} round`,
          eventKey,
          metadata: { game, bet, won, payout },
        });
      }
      return { awarded: 0, duplicate: false };
    });
    if (!["loan_draw", "game_round"].includes(kind)) return json({ error: "Unsupported event" }, 400, identity);
    const profile = await profileSnapshot(identity.userId);
    return json({ ...result, points: profile.points, rank: profile.rank }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to record activity" }, 400);
  }
}
