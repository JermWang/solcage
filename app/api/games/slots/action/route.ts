import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import {
  SLOT_ENTROPY_COUNT,
  SLOT_STRIP_LENGTH,
  spinSlots,
  type SlotLineWin,
  type SlotSymbol,
} from "@/lib/games/slots";
import { authRequired, isAuthRequired, json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";
import { InsufficientFunds, StakeRejected, payWinnings, takeStake, toBaseUnits } from "@/lib/bankroll";
import { MAX_MULTIPLIER, houseConfig, houseReadiness } from "@/lib/house";

export const dynamic = "force-dynamic";

type StoredSlots = {
  bet: number;
  clientSeed: string;
  stops: number[];
  matrix: SlotSymbol[][];
  lineWins: SlotLineWin[];
  scatterCount: number;
  scatterMultiplier: number;
  multiplier: number;
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
  result: StoredSlots,
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
      entropyCount: SLOT_ENTROPY_COUNT,
      stopRange: [0, SLOT_STRIP_LENGTH - 1],
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
    if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: "Invalid round" }, 400, identity);
    if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) return json({ error: "Invalid client seed" }, 400, identity);
    if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) return json({ error: "Invalid stake" }, 400, identity);

    const settled = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        status: string;
        result: StoredSlots | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "slots") throw new Error("Slots round not found");
      if (round.status === "revealed" && round.result) {
        return publicResult(roundId, round.server_seed_hash, round.server_seed, round.result);
      }
      if (round.status !== "committed") throw new Error("Slots round already played");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1_000) {
        throw new Error("Round commitment expired");
      }

      const generator = Provable(() => undefined)({
        serverSeed: round.server_seed,
        clientSeed,
        nonce: 0,
        cursor: 0,
      });
      const house = houseConfig();
      const wagering = house.enabled && houseReadiness(house).ready;
      if (wagering) {
        await takeStake(client, {
          userId: identity.userId,
          stakeRaw: toBaseUnits(bet.toFixed(house.decimals), house.decimals),
          maxMultiplier: MAX_MULTIPLIER.slots,
          rakeBps: house.rakeBps,
          correlationId: `bet:${roundId}`,
          limits: house.limits,
          metadata: { game: "slots" },
        });
      }

      const stops = generator.ints(SLOT_ENTROPY_COUNT, SLOT_STRIP_LENGTH - 1, 0);
      const spin = spinSlots(stops);
      const payout = roundMoney(bet * spin.multiplier);

      if (wagering && payout > 0) {
        await payWinnings(client, {
          userId: identity.userId,
          payoutRaw: toBaseUnits(payout.toFixed(house.decimals), house.decimals),
          limits: house.limits,
          correlationId: `win:${roundId}`,
          metadata: { game: "slots", multiplier: spin.multiplier },
        });
      }
      const result: StoredSlots = {
        bet,
        clientSeed,
        ...spin,
        payout,
        outcome: spin.multiplier > 0 ? "win" : "loss",
      };

      await client.query(
        `UPDATE game_fair_rounds
         SET client_seed = $1, status = 'revealed', result = $2::jsonb, revealed_at = NOW()
         WHERE id = $3`,
        [clientSeed, JSON.stringify(result), roundId],
      );
      await client.query(
        `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
         VALUES ($1, $2, 'slots', $3, $4, $5, $6)
         ON CONFLICT (event_key) DO NOTHING`,
        [crypto.randomUUID(), identity.userId, bet, result.outcome, payout, `fair:${roundId}`],
      );
      await awardPoints(client, {
        userId: identity.userId,
        kind: "game_round",
        basePoints: Math.min(
          115,
          10 + Math.round(bet / 10) + result.lineWins.length * 2 + result.scatterCount * 3,
        ),
        description: "Verified Neon Vault spin",
        eventKey: `game:${roundId}`,
        metadata: {
          game: "slots",
          lines: result.lineWins.length,
          scatters: result.scatterCount,
          multiplier: result.multiplier,
          payout,
        },
      });
      return publicResult(roundId, round.server_seed_hash, round.server_seed, result);
    });

    const profile = await profileSnapshot(identity.userId);
    return json({ ...settled, points: profile.points, rank: profile.rank }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    if (error instanceof InsufficientFunds) return json({ error: "Not enough balance for that stake", balanceRaw: error.balanceRaw.toString() }, 402);
    if (error instanceof StakeRejected) return json({ error: error.message }, 400);
    return json({ error: error instanceof Error ? error.message : "Slots spin failed" }, 400);
  }
}
