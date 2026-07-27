import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import { createShuffledDeck, type PlayingCard } from "@/lib/games/blackjack";
import {
  VIDEO_POKER_DECK_SIZE,
  VIDEO_POKER_HAND_SIZE,
  drawVideoPokerHand,
  settleVideoPokerHand,
  validateHoldMask,
  type VideoPokerRank,
} from "@/lib/games/videoPoker";
import { authRequired, isAuthRequired, json, profileSnapshot, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type StoredVideoPoker = {
  bet: number;
  clientSeed: string;
  deck: PlayingCard[];
  cursor: number;
  initial: PlayingCard[];
  final?: PlayingCard[];
  holdMask?: number;
  replacements?: number;
  rank?: VideoPokerRank;
  handName?: string;
  multiplier?: number;
  paytableIndex?: number;
  outcome?: "win" | "loss";
  payout?: number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function publicState(
  roundId: string,
  serverHash: string,
  serverSeed: string,
  state: StoredVideoPoker,
  settled: boolean,
) {
  return {
    roundId,
    phase: settled ? "settled" : "holding",
    bet: state.bet,
    initial: state.initial,
    hand: settled ? state.final : state.initial,
    holdMask: state.holdMask ?? 0,
    replacements: state.replacements ?? null,
    rank: state.rank ?? null,
    handName: state.handName ?? null,
    multiplier: state.multiplier ?? null,
    paytableIndex: state.paytableIndex ?? null,
    outcome: state.outcome ?? null,
    payout: state.payout ?? null,
    serverHash,
    proof: settled ? {
      algorithm: "HMAC-SHA256",
      shuffle: "Fisher-Yates",
      serverHash,
      serverSeed,
      clientSeed: state.clientSeed,
      nonce: 0,
      deckSize: VIDEO_POKER_DECK_SIZE,
      entropyCount: VIDEO_POKER_DECK_SIZE - 1,
    } : null,
  };
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const roundId = String(body.roundId ?? "");
    const action = String(body.action ?? "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: "Invalid round" }, 400, identity);
    if (action !== "deal" && action !== "draw") return json({ error: "Invalid Video Poker action" }, 400, identity);

    const response = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        status: string;
        result: StoredVideoPoker | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "video-poker") throw new Error("Video Poker round not found");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1_000) {
        throw new Error("Round commitment expired");
      }
      if (round.status === "revealed" && round.result) {
        return publicState(roundId, round.server_seed_hash, round.server_seed, round.result, true);
      }

      let state = round.result;
      if (action === "deal") {
        if (round.status === "active" && state) {
          return publicState(roundId, round.server_seed_hash, round.server_seed, state, false);
        }
        if (round.status !== "committed" || state) throw new Error("Cards already dealt");
        const bet = Number(body.bet);
        const clientSeed = String(body.clientSeed ?? "");
        if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) throw new Error("Invalid stake");
        if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) throw new Error("Invalid client seed");
        const generator = Provable(() => undefined)({
          serverSeed: round.server_seed,
          clientSeed,
          nonce: 0,
          cursor: 0,
        });
        const deck = createShuffledDeck((max) => generator.ints(1, max - 1, 0)[0]);
        state = {
          bet,
          clientSeed,
          deck,
          cursor: VIDEO_POKER_HAND_SIZE,
          initial: deck.slice(0, VIDEO_POKER_HAND_SIZE),
        };
        await client.query(
          `UPDATE game_fair_rounds
           SET client_seed = $1, status = 'active', result = $2::jsonb
           WHERE id = $3`,
          [clientSeed, JSON.stringify(state), roundId],
        );
        return publicState(roundId, round.server_seed_hash, round.server_seed, state, false);
      }

      if (round.status !== "active" || !state) throw new Error("Deal cards before drawing");
      const holdMask = validateHoldMask(Number(body.holdMask));
      const drawn = drawVideoPokerHand(state.initial, state.deck, holdMask, state.cursor);
      const settlement = settleVideoPokerHand(drawn.final, state.bet);
      state = {
        ...state,
        ...drawn,
        holdMask,
        rank: settlement.rank,
        handName: settlement.name,
        multiplier: settlement.multiplier,
        paytableIndex: settlement.paytableIndex,
        outcome: settlement.outcome,
        payout: roundMoney(settlement.payout),
      };

      await client.query(
        `UPDATE game_fair_rounds
         SET status = 'revealed', result = $1::jsonb, revealed_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(state), roundId],
      );
      await client.query(
        `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
         VALUES ($1, $2, 'video-poker', $3, $4, $5, $6)
         ON CONFLICT (event_key) DO NOTHING`,
        [crypto.randomUUID(), identity.userId, state.bet, state.outcome, state.payout, `fair:${roundId}`],
      );
      await awardPoints(client, {
        userId: identity.userId,
        kind: "game_round",
        basePoints: Math.min(130, 12 + Math.round(state.bet / 10) + (state.multiplier >= 6 ? 6 : 0)),
        description: "Verified Neon Draw hand",
        eventKey: `game:${roundId}`,
        metadata: {
          game: "video-poker",
          holdMask,
          replacements: state.replacements,
          rank: state.rank,
          multiplier: state.multiplier,
          payout: state.payout,
        },
      });

      return publicState(roundId, round.server_seed_hash, round.server_seed, state, true);
    });

    const profile = await profileSnapshot(identity.userId);
    return json({ ...response, points: profile.points, rankPosition: profile.rank }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Video Poker action failed" }, 400);
  }
}
