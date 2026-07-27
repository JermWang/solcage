import { Provable } from "@provableio/provable-core";
import { transaction } from "@/lib/db";
import { json, requireIdentity } from "@/lib/identity";
import {
  ALLOWED_MINE_COUNTS,
  generateMinePositions,
  mineMultiplier,
  MINES_BOARD_SIZE,
} from "@/lib/games/mines";
import { awardPoints } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type StoredMines = {
  bet: number;
  clientSeed: string;
  mineCount: number;
  mines: number[];
  revealed: number[];
  multiplier: number;
  outcome?: "win" | "loss";
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
  state: StoredMines,
  settled: boolean,
) {
  return {
    roundId,
    phase: settled ? "settled" : "playing",
    mineCount: state.mineCount,
    revealed: state.revealed,
    multiplier: state.multiplier,
    nextMultiplier: state.revealed.length < MINES_BOARD_SIZE - state.mineCount
      ? mineMultiplier(state.revealed.length + 1, state.mineCount)
      : state.multiplier,
    outcome: state.outcome ?? null,
    payout: state.payout ?? null,
    label: state.label ?? null,
    minePositions: settled ? state.mines : null,
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
    if (!["start", "reveal", "cashout"].includes(action)) return json({ error: "Invalid action" }, 400, identity);

    const response = await transaction(async (client) => {
      const found = await client.query<{
        game: string;
        server_seed: string;
        server_seed_hash: string;
        status: string;
        result: StoredMines | null;
        created_at: Date;
      }>(
        `SELECT game, server_seed, server_seed_hash, status, result, created_at
         FROM game_fair_rounds
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [roundId, identity.userId],
      );
      const round = found.rows[0];
      if (!round || round.game !== "mines") throw new Error("Mines round not found");
      if (Date.now() - new Date(round.created_at).getTime() > 10 * 60 * 1000) throw new Error("Round commitment expired");
      if (round.status === "revealed") throw new Error("Round already settled");

      let state = round.result;
      if (action === "start") {
        if (round.status !== "committed" || state) throw new Error("Board already generated");
        const bet = Number(body.bet);
        const mineCount = Number(body.mineCount);
        const clientSeed = String(body.clientSeed ?? "");
        if (!Number.isFinite(bet) || bet < 0.01 || bet > 100_000) throw new Error("Invalid stake");
        if (!ALLOWED_MINE_COUNTS.has(mineCount)) throw new Error("Invalid mine count");
        if (!/^[a-z0-9:_-]{8,128}$/i.test(clientSeed)) throw new Error("Invalid client seed");
        const generator = Provable(() => undefined)({
          serverSeed: round.server_seed,
          clientSeed,
          nonce: 0,
          cursor: 0,
        });
        state = {
          bet,
          clientSeed,
          mineCount,
          mines: generateMinePositions(mineCount, (max) => generator.ints(1, max, 0)[0]),
          revealed: [],
          multiplier: 1,
        };
      } else {
        if (round.status !== "active" || !state) throw new Error("Start a board before playing");
        if (action === "reveal") {
          const cell = Number(body.cell);
          if (!Number.isInteger(cell) || cell < 0 || cell >= MINES_BOARD_SIZE) throw new Error("Invalid cell");
          if (state.revealed.includes(cell)) throw new Error("Cell already revealed");
          if (state.mines.includes(cell)) {
            state = { ...state, outcome: "loss", payout: 0, label: "MINE HIT" };
          } else {
            const revealed = [...state.revealed, cell].sort((a, b) => a - b);
            const multiplier = mineMultiplier(revealed.length, state.mineCount);
            state = { ...state, revealed, multiplier };
            if (revealed.length === MINES_BOARD_SIZE - state.mineCount) {
              state = {
                ...state,
                outcome: "win",
                payout: roundMoney(state.bet * multiplier),
                label: "BOARD CLEARED",
              };
            }
          }
        }
        if (action === "cashout") {
          if (!state.revealed.length) throw new Error("Reveal at least one crystal before cashing out");
          state = {
            ...state,
            outcome: "win",
            payout: roundMoney(state.bet * state.multiplier),
            label: `${state.revealed.length} CRYSTALS BANKED`,
          };
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
        await client.query(
          `INSERT INTO game_history (id, user_id, game, bet, outcome, payout, event_key)
           VALUES ($1, $2, 'mines', $3, $4, $5, $6)
           ON CONFLICT (event_key) DO NOTHING`,
          [crypto.randomUUID(), identity.userId, state.bet, state.outcome, state.payout, `fair:${roundId}`],
        );
        await awardPoints(client, {
          userId: identity.userId,
          kind: "game_round",
          basePoints: Math.min(115, 10 + state.revealed.length * 5),
          description: "Verified Crystal Mines round",
          eventKey: `game:${roundId}`,
          metadata: { game: "mines", outcome: state.outcome, multiplier: state.multiplier },
        });
      }
      return publicState(roundId, round.server_seed_hash, round.server_seed, state, settled);
    });

    return json(response, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Mines action failed" }, 400);
  }
}
