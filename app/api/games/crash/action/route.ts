import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import {
  crashMultiplierAtElapsed,
  crashPointFromInt,
  CRASH_RANDOM_MAX,
} from "@/lib/games/crash";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { awardPoints } from "@/lib/rewards";
import { InsufficientFunds, StakeRejected, payWinnings, takeStake, toBaseUnits } from "@/lib/bankroll";
import { MAX_MULTIPLIER, houseConfig, houseReadiness } from "@/lib/house";
import { effectiveRakeBps } from "@/lib/fee-waiver";
import { verifiedWallet } from "@/lib/custody/database";

export const dynamic = "force-dynamic";

type StoredCrash = {
  bet: number;
  clientSeed: string;
  crashPoint: number;
  startedAt: string;
  autoCashout: number | null;
  outcome?: "win" | "loss";
  payout?: number;
  cashoutMultiplier?: number;
  label?: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function currentMultiplier(state: StoredCrash) {
  return crashMultiplierAtElapsed(Date.now() - Date.parse(state.startedAt));
}

function settleIfDue(state: StoredCrash) {
  const current = currentMultiplier(state);
  if (
    state.autoCashout
    && state.crashPoint >= state.autoCashout
    && current >= state.autoCashout
  ) {
    return {
      ...state,
      outcome: "win" as const,
      cashoutMultiplier: state.autoCashout,
      payout: roundMoney(state.bet * state.autoCashout),
      label: `AUTO CASHOUT ${state.autoCashout.toFixed(2)}×`,
    };
  }
  if (current >= state.crashPoint) {
    return {
      ...state,
      outcome: "loss" as const,
      cashoutMultiplier: undefined,
      payout: 0,
      label: `CRASHED AT ${state.crashPoint.toFixed(2)}×`,
    };
  }
  return state;
}

function publicState(
  roundId: string,
  serverHash: string,
  serverSeed: string,
  state: StoredCrash,
  settled: boolean,
) {
  return {
    roundId,
    phase: settled ? "settled" : "flying",
    startedAt: state.startedAt,
    currentMultiplier: settled
      ? state.cashoutMultiplier ?? state.crashPoint
      : currentMultiplier(state),
    autoCashout: state.autoCashout,
    outcome: state.outcome ?? null,
    payout: state.payout ?? null,
    cashoutMultiplier: state.cashoutMultiplier ?? null,
    label: state.label ?? null,
    crashPoint: settled ? state.crashPoint : null,
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
    // Holders of the threshold $SOLCAGE balance pay no rake. Resolved here,
    // outside the transaction, so the chain lookup never holds a DB lock open.
    const rakeBpsForRound = await effectiveRakeBps(
      await verifiedWallet(identity.userId),
      houseConfig().rakeBps,
    );
    const body = await request.json() as Record<string, unknown>;
    const roundId = String(body.roundId ?? "");
    const action = String(body.action ?? "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: "Invalid round" }, 400, identity);
    if (!["start", "status", "cashout"].includes(action)) return json({ error: "Invalid action" }, 400, identity);

    const response = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        status: string;
        result: StoredCrash | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "crash") throw new Error("Crash round not found");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1_000) throw new Error("Round commitment expired");
      if (round.status === "revealed" && round.result) {
        return publicState(roundId, round.server_seed_hash, round.server_seed, round.result, true);
      }
      if (round.status === "revealed") throw new Error("Round already settled");

      let state = round.result;
      if (action === "start") {
        if (round.status !== "committed" || state) throw new Error("Crash round already started");
        const bet = Number(body.bet);
        const clientSeed = String(body.clientSeed ?? "");
        const requestedAutoCashout = body.autoCashout === null || body.autoCashout === undefined
          ? null
          : Number(body.autoCashout);
        if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) throw new Error("Invalid stake");
        if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) throw new Error("Invalid client seed");
        // Stake taken once at the opening action; the terminal path settles below.
        const houseAtStart = houseConfig();
        if (houseAtStart.enabled && houseReadiness(houseAtStart).ready) {
          await takeStake(client, {
            userId: identity.userId,
            stakeRaw: toBaseUnits(bet.toFixed(houseAtStart.decimals), houseAtStart.decimals),
            maxMultiplier: MAX_MULTIPLIER.crash,
            rakeBps: rakeBpsForRound,
            correlationId: `bet:${roundId}`,
            limits: houseAtStart.limits,
            metadata: { game: "crash" },
          });
        }
        if (
          requestedAutoCashout !== null
          && (!Number.isFinite(requestedAutoCashout) || requestedAutoCashout < 1.01 || requestedAutoCashout > 100)
        ) {
          throw new Error("Invalid auto cashout");
        }
        const generator = Provable(() => undefined)({
          serverSeed: round.server_seed,
          clientSeed,
          nonce: 0,
          cursor: 0,
        });
        state = {
          bet,
          clientSeed,
          crashPoint: crashPointFromInt(generator.ints(1, CRASH_RANDOM_MAX - 1, 0)[0]),
          startedAt: new Date().toISOString(),
          autoCashout: requestedAutoCashout === null
            ? null
            : Math.round(requestedAutoCashout * 100) / 100,
        };
      } else {
        if (round.status !== "active" || !state) throw new Error("Start a crash round before acting");
        state = settleIfDue(state);
        if (action === "cashout" && !state.outcome) {
          const multiplier = currentMultiplier(state);
          if (multiplier >= state.crashPoint) {
            state = {
              ...state,
              outcome: "loss",
              payout: 0,
              label: `CRASHED AT ${state.crashPoint.toFixed(2)}×`,
            };
          } else {
            state = {
              ...state,
              outcome: "win",
              cashoutMultiplier: multiplier,
              payout: roundMoney(state.bet * multiplier),
              label: `CASHED OUT ${multiplier.toFixed(2)}×`,
            };
          }
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
        // A player who never cashes out simply loses the stake taken at start:
        // the bust path settles with payout 0 and posts nothing here.
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
            metadata: { game: "crash", cashoutMultiplier: state.cashoutMultiplier },
          });
        }
        await client.query(
          `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
           VALUES ($1, $2, 'crash', $3, $4, $5, $6)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), identity.userId, state.bet, state.outcome, state.payout, `fair:${roundId}`],
        );
        await awardPoints(client, {
          userId: identity.userId,
          kind: "game_round",
          basePoints: Math.min(115, 10 + Math.round((state.cashoutMultiplier ?? 1) * 5)),
          description: "Verified Cage Crash round",
          eventKey: `game:${roundId}`,
          metadata: {
            game: "crash",
            outcome: state.outcome,
            crashPoint: state.crashPoint,
            cashoutMultiplier: state.cashoutMultiplier ?? null,
          },
        });
      }

      return publicState(roundId, round.server_seed_hash, round.server_seed, state, settled);
    });

    return json(response, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    if (error instanceof InsufficientFunds) return json({ error: "Not enough balance for that stake", balanceRaw: error.balanceRaw.toString() }, 402);
    if (error instanceof StakeRejected) return json({ error: error.message }, 400);
    return json({ error: error instanceof Error ? error.message : "Crash action failed" }, 400);
  }
}
