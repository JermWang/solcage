import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import { json, profileSnapshot, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

type FairResult = {
  game: string;
  won: boolean;
  payout: number;
  outcome: Record<string, string | number | string[]>;
};

const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const slotSymbols = ["CAGE", "SOL", "LIME", "CHIP", "SEVEN", "CROWN", "JACKPOT"];

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function settle(
  game: string,
  randomInts: (count: number, max: number, min?: number) => number[],
  bet: number,
  params: Record<string, unknown>,
): FairResult {
  if (game === "dice") {
    const target = Number(params.target);
    if (!Number.isInteger(target) || target < 2 || target > 95) throw new Error("Invalid dice target");
    const roll = randomInts(1, 100, 1)[0];
    const won = roll < target;
    const multiplier = 98 / (target - 1);
    return {
      game,
      won,
      payout: won ? roundMoney(bet * multiplier) : 0,
      outcome: { roll, target, multiplier: roundMoney(multiplier) },
    };
  }

  if (game === "roulette") {
    const choice = String(params.choice ?? "").toUpperCase();
    if (!["RED", "BLACK", "ZERO"].includes(choice)) throw new Error("Invalid roulette choice");
    const number = randomInts(1, 37, 0)[0];
    const color = number === 0 ? "ZERO" : redNumbers.has(number) ? "RED" : "BLACK";
    const won = color === choice;
    const multiplier = choice === "ZERO" ? 36 : 2;
    return {
      game,
      won,
      payout: won ? roundMoney(bet * multiplier) : 0,
      outcome: { number, color, choice, multiplier },
    };
  }

  if (game === "slots") {
    const reels = randomInts(3, slotSymbols.length, 0).map((index) => slotSymbols[index]);
    const allMatch = reels.every((symbol) => symbol === reels[0]);
    const pair = !allMatch && new Set(reels).size === 2;
    const multiplier = allMatch ? (reels[0] === "JACKPOT" ? 50 : 12) : pair ? 2 : 0;
    return {
      game,
      won: multiplier > 0,
      payout: multiplier > 0 ? roundMoney(bet * multiplier) : 0,
      outcome: { reels, multiplier },
    };
  }

  throw new Error("Unsupported game");
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const roundId = String(body.roundId ?? "");
    const clientSeed = String(body.clientSeed ?? "");
    const bet = Number(body.bet);
    const params = typeof body.params === "object" && body.params ? body.params as Record<string, unknown> : {};

    if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: "Invalid round" }, 400, identity);
    if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) return json({ error: "Invalid client seed" }, 400, identity);
    if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) return json({ error: "Invalid stake" }, 400, identity);

    const settled = await transaction(async (client) => {
      const roundResult = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        created_at: Date;
        status: string;
      }>(
        `SELECT game, server_seed, server_seed_hash, created_at, status
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = roundResult.rows[0];
      if (!round) throw new Error("Round not found");
      if (round.status !== "committed") throw new Error("Round already revealed");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1000) throw new Error("Round commitment expired");

      const generator = Provable(() => undefined)({
        serverSeed: round.server_seed,
        clientSeed,
        nonce: 0,
        cursor: 0,
      });
      const result = settle(round.game, generator.ints.bind(generator), bet, params);

      await client.query(
        `UPDATE game_fair_rounds
         SET client_seed = $1, status = 'revealed', result = $2::jsonb, revealed_at = NOW()
         WHERE id = $3`,
        [clientSeed, JSON.stringify(result), roundId],
      );
      await client.query(
        `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), identity.userId, result.game, bet, result.won ? "win" : "loss", result.payout, `fair:${roundId}`],
      );
      return {
        ...result,
        proof: {
          roundId,
          algorithm: "HMAC-SHA256",
          serverHash: round.server_seed_hash,
          serverSeed: round.server_seed,
          clientSeed,
          nonce: 0,
        },
      };
    });

    const profile = await profileSnapshot(identity.userId);
    return json({ ...settled, points: profile.points, rank: profile.rank }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to reveal round" }, 400);
  }
}
