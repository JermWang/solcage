import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import {
  createShuffledDeck,
  BLACKJACK_DECK_COUNT,
  handValue,
  isBlackjack,
  settleHands,
  shouldDealerHit,
  type PlayingCard,
} from "@/lib/games/blackjack";
import { awardPoints } from "@/lib/rewards";
import { InsufficientFunds, StakeRejected, payWinnings, takeStake, toBaseUnits } from "@/lib/bankroll";
import { MAX_MULTIPLIER, houseConfig, houseReadiness } from "@/lib/house";

export const dynamic = "force-dynamic";

type StoredBlackjack = {
  bet: number;
  clientSeed: string;
  deck: PlayingCard[];
  cursor: number;
  player: PlayingCard[];
  dealer: PlayingCard[];
  doubledDown?: boolean;
  outcome?: "win" | "loss" | "push";
  payout?: number;
  label?: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function publicState(
  roundId: string,
  serverHash: string,
  serverSeed: string,
  state: StoredBlackjack,
  settled: boolean,
) {
  return {
    roundId,
    phase: settled ? "settled" : "playing",
    stake: state.bet,
    doubledDown: Boolean(state.doubledDown),
    canDouble: !settled && !state.doubledDown && state.player.length === 2,
    player: state.player,
    playerValue: handValue(state.player),
    dealer: settled ? state.dealer : [state.dealer[0], null],
    dealerValue: settled ? handValue(state.dealer) : handValue([state.dealer[0]]),
    outcome: state.outcome ?? null,
    payout: state.payout ?? null,
    label: state.label ?? null,
    proof: settled ? {
      algorithm: "HMAC-SHA256",
      serverHash,
      serverSeed,
      clientSeed: state.clientSeed,
      nonce: 0,
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
    if (!["deal", "hit", "stand", "double"].includes(action)) return json({ error: "Invalid action" }, 400, identity);

    const response = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        client_seed: string | null;
        status: string;
        result: StoredBlackjack | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, client_seed, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "blackjack") throw new Error("Blackjack round not found");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1000) throw new Error("Round commitment expired");
      if (round.status === "revealed" && round.result) {
        return publicState(roundId, round.server_seed_hash, round.server_seed, round.result, true);
      }

      let state = round.result;
      if (action === "deal") {
        if (round.status !== "committed" || state) throw new Error("Cards already dealt");
        const bet = Number(body.bet);
        const clientSeed = String(body.clientSeed ?? "");
        if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) throw new Error("Invalid stake");
        if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) throw new Error("Invalid client seed");
        const houseAtDeal = houseConfig();
        if (houseAtDeal.enabled && houseReadiness(houseAtDeal).ready) {
          await takeStake(client, {
            userId: identity.userId,
            stakeRaw: toBaseUnits(bet.toFixed(houseAtDeal.decimals), houseAtDeal.decimals),
            maxMultiplier: MAX_MULTIPLIER.blackjack,
            rakeBps: houseAtDeal.rakeBps,
            correlationId: `bet:${roundId}`,
            limits: houseAtDeal.limits,
            metadata: { game: "blackjack" },
          });
        }
        const generator = Provable(() => undefined)({
          serverSeed: round.server_seed,
          clientSeed,
          nonce: 0,
          cursor: 0,
        });
        const deck = createShuffledDeck((max) => generator.ints(1, max - 1, 0)[0], BLACKJACK_DECK_COUNT);
        state = {
          bet,
          clientSeed,
          deck,
          cursor: 4,
          player: [deck[0], deck[2]],
          dealer: [deck[1], deck[3]],
        };
        const natural = isBlackjack(state.player) || isBlackjack(state.dealer);
        if (natural) {
          const settlement = settleHands(state.player, state.dealer, state.bet);
          state = { ...state, ...settlement, payout: roundMoney(settlement.payout) };
        }
      } else {
        if (round.status !== "active" || !state) throw new Error("Deal cards before acting");
        if (action === "double") {
          if (state.doubledDown || state.player.length !== 2) throw new Error("Double down is only available on the first two cards");
          // Doubling commits a second stake equal to the first. It gets its own
          // correlation id and its own funds check — a player who cannot cover
          // it is refused here rather than doubling on money they do not have.
          const houseAtDouble = houseConfig();
          if (houseAtDouble.enabled && houseReadiness(houseAtDouble).ready) {
            await takeStake(client, {
              userId: identity.userId,
              stakeRaw: toBaseUnits(state.bet.toFixed(houseAtDouble.decimals), houseAtDouble.decimals),
              maxMultiplier: MAX_MULTIPLIER.blackjack,
              rakeBps: houseAtDouble.rakeBps,
              correlationId: `bet-double:${roundId}`,
              limits: houseAtDouble.limits,
              metadata: { game: "blackjack", double: true },
            });
          }
          state.bet = roundMoney(state.bet * 2);
          state.doubledDown = true;
        }
        if (action === "hit" || action === "double") {
          state.player = [...state.player, state.deck[state.cursor]];
          state.cursor += 1;
        }
        if (action === "stand" || action === "double" || handValue(state.player) >= 21) {
          if (handValue(state.player) <= 21) {
            while (shouldDealerHit(state.dealer)) {
              state.dealer = [...state.dealer, state.deck[state.cursor]];
              state.cursor += 1;
            }
          }
          const settlement = settleHands(state.player, state.dealer, state.bet);
          state = { ...state, ...settlement, payout: roundMoney(settlement.payout) };
        }
      }

      const settled = Boolean(state.outcome);
      await client.query(
        `UPDATE game_fair_rounds
         SET client_seed = $1, status = $2::varchar, result = $3::jsonb,
             revealed_at = CASE WHEN $2::varchar = 'revealed' THEN NOW() ELSE revealed_at END
         WHERE id = $4`,
        [state.clientSeed, settled ? "revealed" : "active", JSON.stringify(state), roundId],
      );
      if (settled) {
        // state.payout already accounts for a doubled stake, and both stakes
        // were debited, so this settles the hand whole.
        const houseAtEnd = houseConfig();
        if (
          houseAtEnd.enabled
          && houseReadiness(houseAtEnd).ready
          && (state.payout ?? 0) > 0
        ) {
          await payWinnings(client, {
            userId: identity.userId,
            payoutRaw: toBaseUnits((state.payout ?? 0).toFixed(houseAtEnd.decimals), houseAtEnd.decimals),
            limits: houseAtEnd.limits,
            correlationId: `win:${roundId}`,
            metadata: { game: "blackjack", outcome: state.outcome, doubled: Boolean(state.doubledDown) },
          });
        }
        await client.query(
          `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
           VALUES ($1, $2, 'blackjack', $3, $4, $5, $6)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), identity.userId, state.bet, state.outcome, state.payout, `fair:${roundId}`],
        );
        await awardPoints(client, {
          userId: identity.userId,
          kind: "game_round",
          basePoints: Math.min(115, 10 + Math.round(state.bet / 10)),
          description: "Verified blackjack hand",
          eventKey: `game:${roundId}`,
          metadata: { game: "blackjack", outcome: state.outcome, payout: state.payout },
        });
      }
      return publicState(roundId, round.server_seed_hash, round.server_seed, state, settled);
    });

    return json(response, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    if (error instanceof InsufficientFunds) return json({ error: "Not enough balance for that stake", balanceRaw: error.balanceRaw.toString() }, 402);
    if (error instanceof StakeRejected) return json({ error: error.message }, 400);
    return json({ error: error instanceof Error ? error.message : "Blackjack action failed" }, 400);
  }
}
