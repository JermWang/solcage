"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";

type CrashState = {
  roundId: string;
  phase: "flying" | "settled";
  startedAt: string;
  currentMultiplier: number;
  autoCashout: number | null;
  outcome: "win" | "loss" | null;
  payout: number | null;
  cashoutMultiplier: number | null;
  label: string | null;
  crashPoint: number | null;
  proof: null | {
    serverHash: string;
    serverSeed: string;
    clientSeed: string;
  };
};

function displayMultiplier(startedAt: string) {
  const elapsedSeconds = Math.max(0, Date.now() - Date.parse(startedAt)) / 1_000;
  return Math.max(1, Math.floor(Math.exp(elapsedSeconds * 0.115) * 100) / 100);
}

export default function CrashPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [bet, setBet] = useState(0.01);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoCashout, setAutoCashout] = useState(2);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<CrashState | null>(null);
  const [liveMultiplier, setLiveMultiplier] = useState(1);
  const [commitment, setCommitment] = useState("");
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState("");
  const creditedRound = useRef("");
  const polling = useRef(false);

  const acceptState = useCallback((next: CrashState) => {
    if (next.phase === "flying" && creditedRound.current === next.roundId) return;
    setState(next);
    setLiveMultiplier(next.currentMultiplier);
    if (next.phase === "settled" && creditedRound.current !== next.roundId) {
      creditedRound.current = next.roundId;
      void wager.refresh();
      if (next.crashPoint) setHistory((values) => [next.crashPoint!, ...values].slice(0, 8));
    }
  }, [wager]);

  const activeRoundId = state?.phase === "flying" ? state.roundId : null;
  const activeStartedAt = state?.phase === "flying" ? state.startedAt : null;

  useEffect(() => {
    if (!activeRoundId || !activeStartedAt) return;
    let stopped = false;
    let animationFrame = 0;
    const animate = () => {
      if (!stopped) {
        setLiveMultiplier(displayMultiplier(activeStartedAt));
        animationFrame = requestAnimationFrame(animate);
      }
    };
    animationFrame = requestAnimationFrame(animate);

    const timer = window.setInterval(async () => {
      if (polling.current || stopped) return;
      polling.current = true;
      try {
        const next = await fetch("/api/games/crash/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roundId: activeRoundId, action: "status" }),
        }).then((response) => response.json()) as CrashState & { error?: string };
        if (next.roundId) acceptState(next);
      } finally {
        polling.current = false;
      }
    }, 200);

    return () => {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      window.clearInterval(timer);
    };
  }, [acceptState, activeRoundId, activeStartedAt]);

  async function startRound() {
    if (pending || bet > bank || bank <= 0) return;
    setPending(true);
    setError("");
    setState(null);
    setLiveMultiplier(1);
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "crash" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit crash round");
      const clientSeed = `solcage:${crypto.randomUUID()}`;
      setCommitment(committed.serverHash);
      const started = await fetch("/api/games/crash/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          action: "start",
          bet,
          clientSeed,
          autoCashout: autoEnabled ? autoCashout : null,
        }),
      }).then((response) => response.json()) as CrashState & { error?: string };
      if (!started.roundId) throw new Error(started.error ?? "Unable to start crash round");
      creditedRound.current = "";
      void wager.refresh();
      acceptState(started);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Crash round failed");
    } finally {
      setPending(false);
    }
  }

  async function cashOut() {
    if (!state || state.phase !== "flying" || pending) return;
    setPending(true);
    polling.current = true;
    setError("");
    try {
      const next = await fetch("/api/games/crash/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: state.roundId, action: "cashout" }),
      }).then((response) => response.json()) as CrashState & { error?: string };
      if (!next.roundId) throw new Error(next.error ?? "Cashout failed");
      acceptState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cashout failed");
    } finally {
      polling.current = false;
      setPending(false);
    }
  }

  function newRound() {
    setState(null);
    setLiveMultiplier(1);
    setCommitment("");
    setError("");
  }

  const progress = Math.min(0.94, Math.log(Math.max(1, liveMultiplier)) / Math.log(20));
  const flightStyle = {
    "--crash-x": `${8 + progress * 82}%`,
    "--crash-y": `${14 + Math.pow(progress, 1.45) * 66}%`,
  } as CSSProperties;

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room crash-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>SOLANA CRASH FOUNDATION / VERIFIED FLIGHT</span><h1>Cage Crash</h1></div>
          <div className="game-room-balance"><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></div>
        </header>
        <GameHints game="crash" />

        <section className="crash-room">
          <div className={`crash-stage ${state?.phase === "settled" ? state.outcome : "flying"}`}>
            <span className="verified-badge"><i /> SERVER-TIMED ROUND</span>
            <div className="crash-history">
              {history.length ? history.map((point, index) => <span className={point >= 2 ? "high" : ""} key={`${point}-${index}`}>{point.toFixed(2)}×</span>) : <small>SESSION CRASH HISTORY</small>}
            </div>
            <svg className="crash-curve" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="crash-line" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#8d65ff" />
                  <stop offset=".62" stopColor="#c9ff38" />
                  <stop offset="1" stopColor="#ff4f62" />
                </linearGradient>
                <linearGradient id="crash-fill" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stopColor="#8d65ff" stopOpacity=".2" />
                  <stop offset="1" stopColor="#c9ff38" stopOpacity=".02" />
                </linearGradient>
              </defs>
              <path className="crash-area" d="M0,500 C330,492 650,420 1000,20 L1000,520 L0,520 Z" />
              <path className="crash-line" d="M0,500 C330,492 650,420 1000,20" />
            </svg>
            <div className="crash-flight" style={flightStyle}><span>SC</span><i /></div>
            <div className="crash-multiplier">
              <span>{state?.phase === "settled" ? state.label : state ? "ROUND LIVE" : "AWAITING LAUNCH"}</span>
              <b>{(state?.phase === "settled" ? state.crashPoint ?? liveMultiplier : liveMultiplier).toFixed(2)}×</b>
              <small>{state?.phase === "settled" ? (state.outcome === "win" ? `RETURN ${(state.payout ?? 0).toFixed(2)} SOL` : "ROUND CRASHED") : state?.autoCashout ? `AUTO CASHOUT ${state.autoCashout.toFixed(2)}×` : "MANUAL CASHOUT"}</small>
            </div>
          </div>

          <aside className="roulette-console crash-console">
            <div className="console-title"><span>FLIGHT SLIP</span><small>CRASH</small></div>
            {!state && <>
              <label className="console-label">STAKE</label>
              <div className="roulette-stake">
                <button onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
                <div><input aria-label="Stake amount" type="number" min={wager.minStake} max={Math.min(wager.maxStake, bank)} value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} /><span>SOL</span></div>
                <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
              </div>
              <div className="roulette-quick-stakes">{[0.01, 0.05, 0.1, 0.25].map((value) => <button key={value} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}</div>
              <label className="console-label">AUTO CASHOUT</label>
              <div className="crash-auto-row">
                <button className={autoEnabled ? "active" : ""} onClick={() => setAutoEnabled((value) => !value)}>{autoEnabled ? "ON" : "OFF"}</button>
                <div><input aria-label="Auto cashout multiplier" disabled={!autoEnabled} type="number" min="1.01" max="100" step=".01" value={autoCashout} onChange={(event) => setAutoCashout(Math.min(100, Math.max(1.01, Number(event.target.value))))} /><span>×</span></div>
              </div>
            </>}
            <div className="roulette-receipt">
              <p><span>Live multiplier</span><b>{liveMultiplier.toFixed(2)}×</b></p>
              <p><span>Server clock</span><b>AUTHORITATIVE</b></p>
              <p><span>Crash point</span><b>{state?.crashPoint ? `${state.crashPoint.toFixed(2)}×` : "HIDDEN"}</b></p>
              <p><span>Designed RTP</span><b>99.00%</b></p>
            </div>
            {!state && <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={startRound}>{pending ? "COMMITTING…" : `LAUNCH ${bet.toFixed(2)} SOL`}</button>}
            {state?.phase === "flying" && <button className="roulette-spin-button crash-cashout" disabled={pending} onClick={cashOut}>{pending ? "LOCKING…" : `CASH OUT ${(bet * liveMultiplier).toFixed(2)}`}</button>}
            {state?.phase === "settled" && <button className="roulette-spin-button" onClick={newRound}>NEW FLIGHT</button>}
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>FLIGHT PROOF</span><h2>{state?.proof ? "The crash point is independently reproducible." : "The crash point is committed before launch."}</h2></div><b>{state?.proof ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{(state?.proof?.serverHash ?? commitment) || "Generated before every flight"}</code></p>
            <p><span>CLIENT SEED</span><code>{state?.proof?.clientSeed ?? "Supplied after commitment"}</code></p>
            <p><span>SERVER SEED</span><code>{state?.proof?.serverSeed ?? "Hidden until cashout or crash"}</code></p>
            <p><span>CRASH POINT</span><code>{state?.crashPoint ? `${state.crashPoint.toFixed(2)}× / 99% INVERSE CURVE` : "Hidden while the round is active"}</code></p>
          </div>
          <small>The browser only animates the flight. The server clock decides whether a cashout arrived before the committed crash point, then persists settlement, proof, XP, and referral credit atomically.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}
