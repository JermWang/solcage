"use client";

import Link from "next/link";
import { useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";

type MinesState = {
  roundId: string;
  phase: "playing" | "settled";
  mineCount: number;
  revealed: number[];
  multiplier: number;
  nextMultiplier: number;
  outcome: "win" | "loss" | null;
  payout: number | null;
  label: string | null;
  minePositions: number[] | null;
  proof: null | {
    serverHash: string;
    serverSeed: string;
    clientSeed: string;
  };
};

const cells = Array.from({ length: 25 }, (_, index) => index);

export default function MinesPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [bet, setBet] = useState(0.01);
  const [mineCount, setMineCount] = useState(3);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<MinesState | null>(null);
  const [commitment, setCommitment] = useState("");
  const [error, setError] = useState("");

  async function action(actionName: "start" | "reveal" | "cashout", cell?: number) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      let roundId = state?.roundId;
      let clientSeed: string | undefined;
      if (actionName === "start") {
        if (bet > bank || bank <= 0) throw new Error("Not enough balance");
        const committed = await fetch("/api/games/fair/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game: "mines" }),
        }).then((response) => response.json());
        if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit board");
        roundId = committed.roundId;
        clientSeed = `solcage:${crypto.randomUUID()}`;
        setCommitment(committed.serverHash);
      }
      if (!roundId) throw new Error("Start a new board");
      const next = await fetch("/api/games/mines/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId,
          action: actionName,
          bet,
          mineCount,
          clientSeed,
          cell,
        }),
      }).then((response) => response.json()) as MinesState & { error?: string };
      if (!next.roundId) throw new Error(next.error ?? "Mines action failed");
      if (actionName === "start") void wager.refresh();
      if (next.phase === "settled") void wager.refresh();
      setState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mines action failed");
    } finally {
      setPending(false);
    }
  }

  function newBoard() {
    setState(null);
    setCommitment("");
    setError("");
  }

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room mines-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>MIT MINES FOUNDATION / VERIFIED BOARD</span><h1>Crystal Mines</h1></div>
          <div className="game-room-balance"><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></div>
        </header>

        <section className="mines-room">
          <div className="mines-stage">
            <span className="verified-badge"><i /> COMMITTED BOARD</span>
            <div className="mines-status">
              <span>LIVE MULTIPLIER</span>
              <b>{state ? `${state.multiplier.toFixed(2)}×` : "1.00×"}</b>
              <small>{state?.phase === "playing" ? `NEXT SAFE ${state.nextMultiplier.toFixed(2)}×` : "25 CELLS / HMAC SHUFFLE"}</small>
            </div>
            <div className="mines-grid" aria-label="Five by five Crystal Mines board">
              {cells.map((cell) => {
                const crystal = state?.revealed.includes(cell);
                const mine = state?.minePositions?.includes(cell);
                const settledSafe = state?.phase === "settled" && !mine && !crystal;
                return (
                  <button
                    aria-label={`Cell ${cell + 1}${crystal ? " crystal" : mine ? " mine" : ""}`}
                    className={`${crystal ? "crystal" : ""} ${mine ? "mine" : ""} ${settledSafe ? "settled-safe" : ""}`}
                    disabled={pending || state?.phase !== "playing" || crystal}
                    key={cell}
                    onClick={() => action("reveal", cell)}
                  >
                    <span aria-hidden="true">{mine ? "mine" : crystal ? "crystal" : ""}</span>
                  </button>
                );
              })}
            </div>
            {state?.phase === "settled" && (
              <div className={`mines-outcome ${state.outcome}`}>
                <span>{state.label}</span>
                <b>{state.payout ? `+${state.payout.toFixed(2)} SOL` : "BOARD LOST"}</b>
              </div>
            )}
          </div>

          <aside className="roulette-console mines-console">
            <div className="console-title"><span>MINES SLIP</span><small>5 × 5 BOARD</small></div>
            {!state && <>
              <label className="console-label">STAKE</label>
              <div className="roulette-stake">
                <button onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
                <div><input aria-label="Stake amount" type="number" min={wager.minStake} max={Math.min(wager.maxStake, bank)} value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} /><span>SOL</span></div>
                <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
              </div>
              <label className="console-label">MINES</label>
              <div className="mine-count-picker">{[3, 5, 10].map((count) => <button className={mineCount === count ? "active" : ""} key={count} onClick={() => setMineCount(count)}>{count}</button>)}</div>
            </>}
            <div className="roulette-receipt">
              <p><span>Crystals found</span><b>{state?.revealed.length ?? 0}</b></p>
              <p><span>Mines hidden</span><b>{state?.mineCount ?? mineCount}</b></p>
              <p><span>Current return</span><b>{state ? `${(bet * state.multiplier).toFixed(2)} SOL` : "—"}</b></p>
              <p><span>Designed RTP</span><b>98.00%</b></p>
            </div>
            {!state && <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={() => action("start")}>{pending ? "LOCKING BOARD…" : `START ${bet.toFixed(2)} SOL`}</button>}
            {state?.phase === "playing" && <button className="roulette-spin-button" disabled={pending || !state.revealed.length} onClick={() => action("cashout")}>{pending ? "VERIFYING…" : `CASH OUT ${(bet * state.multiplier).toFixed(2)}`}</button>}
            {state?.phase === "settled" && <button className="roulette-spin-button" onClick={newBoard}>NEW BOARD</button>}
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>BOARD PROOF</span><h2>{state?.proof ? "Every mine position is reproducible." : "The board is committed before the first pick."}</h2></div><b>{state?.proof ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{(state?.proof?.serverHash ?? commitment) || "Generated before every board"}</code></p>
            <p><span>CLIENT SEED</span><code>{state?.proof?.clientSeed ?? "Supplied after commitment"}</code></p>
            <p><span>SERVER SEED</span><code>{state?.proof?.serverSeed ?? "Hidden until cashout or mine hit"}</code></p>
            <p><span>MINE POSITIONS</span><code>{state?.minePositions?.map((position) => position + 1).join(", ") ?? "Hidden while the board is active"}</code></p>
          </div>
          <small>The 25-cell board is shuffled from the committed HMAC stream. Picks, cashout, proof, history, loyalty points, and referral credit settle together in one database transaction.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}
