import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import {
  DICE_ROLL_MAX,
  settleDice,
  type DiceDirection,
  type DiceSettlement,
} from "@/lib/games/dice";
import { authRequired, isAuthRequired, json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type StoredDice = DiceSettlement & {
  bet: number;
  clientSeed: string;
  payout: number;
  outcome: "win" | "loss";
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function publicResult(
  roundId: string,
  serverHash: string,
  serverSeed: string,
  result: StoredDice,
) {
  return {
    roundId,
    ...result,
    proof: {
      algorithm: "HMAC-SHA256",
      serverHash,
      serverSeed,
      clientSeed: result.clientSeed,
      nonce: 0,
      entropyCount: 1,
      rollRange: [0, DICE_ROLL_MAX],
    },
  };
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const roundId = String(body.roundId ?? "");
    const clientSeed = String(body.clientSeed ?? "");
    const bet = Number(body.bet);
    const chanceBps = Number(body.chanceBps);
    const direction = String(body.direction ?? "") as DiceDirection;

    if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: "Invalid round" }, 400, identity);
    if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) return json({ error: "Invalid client seed" }, 400, identity);
    if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) return json({ error: "Invalid stake" }, 400, identity);
    if (!Number.isInteger(chanceBps) || chanceBps < 100 || chanceBps > 9_500) {
      return json({ error: "Win chance must be between 1% and 95%" }, 400, identity);
    }
    if (direction !== "under" && direction !== "over") {
      return json({ error: "Invalid dice direction" }, 400, identity);
    }

    const settled = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        status: string;
        result: StoredDice | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "dice") throw new Error("Dice round not found");
      if (round.status === "revealed" && round.result) {
        return publicResult(roundId, round.server_seed_hash, round.server_seed, round.result);
      }
      if (round.status !== "committed") throw new Error("Dice round already played");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1_000) {
        throw new Error("Round commitment expired");
      }

      const generator = Provable(() => undefined)({
        serverSeed: round.server_seed,
        clientSeed,
        nonce: 0,
        cursor: 0,
      });
      const roll = generator.ints(1, DICE_ROLL_MAX, 0)[0];
      const outcome = settleDice(roll, chanceBps, direction);
      const payout = outcome.won ? roundMoney(bet * outcome.multiplier) : 0;
      const result: StoredDice = {
        bet,
        clientSeed,
        ...outcome,
        payout,
        outcome: outcome.won ? "win" : "loss",
      };

      await client.query(
        `UPDATE game_fair_rounds
         SET client_seed = $1, status = 'revealed', result = $2::jsonb, revealed_at = NOW()
         WHERE id = $3`,
        [clientSeed, JSON.stringify(result), roundId],
      );
      await client.query(
        `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
         VALUES ($1, $2, 'dice', $3, $4, $5, $6)
         ON CONFLICT (event_key) DO NOTHING`,
        [crypto.randomUUID(), identity.userId, bet, result.outcome, payout, `fair:${roundId}`],
      );
      await awardPoints(client, {
        userId: identity.userId,
        kind: "game_round",
        basePoints: Math.min(
          115,
          10 + Math.round(bet / 10) + Math.max(0, Math.floor((5_000 - chanceBps) / 1_000)),
        ),
        description: "Verified Neon Dice roll",
        eventKey: `game:${roundId}`,
        metadata: {
          game: "dice",
          roll,
          direction,
          chanceBps,
          target: outcome.target,
          multiplier: outcome.multiplier,
          payout,
        },
      });
      return publicResult(roundId, round.server_seed_hash, round.server_seed, result);
    });

    const profile = await profileSnapshot(identity.userId);
    return json({ ...settled, points: profile.points, rank: profile.rank }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Dice roll failed" }, 400);
  }
}

