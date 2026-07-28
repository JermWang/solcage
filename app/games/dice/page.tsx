"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";
import {
  diceMultiplier,
  diceTarget,
  displayDiceUnits,
  type DiceDirection,
} from "@/lib/games/dice";

type DiceProof = {
  algorithm: string;
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  entropyCount: number;
  rollRange: [number, number];
};

type DiceResult = {
  roundId: string;
  bet: number;
  clientSeed: string;
  roll: number;
  direction: DiceDirection;
  chanceBps: number;
  target: number;
  multiplier: number;
  won: boolean;
  payout: number;
  outcome: "win" | "loss";
  points: number;
  proof: DiceProof;
};

function freshSeed() {
  return `dice:${crypto.randomUUID()}`;
}

export default function DicePage() {
  const wager = useWager();
  const [bet, setBet] = useState(0.01);
  const [chanceBps, setChanceBps] = useState(4_950);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [clientSeed, setClientSeed] = useState("dice:solcage-player");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DiceResult | null>(null);
  const [history, setHistory] = useState<DiceResult[]>([]);
  const [proofRound, setProofRound] = useState<DiceResult | null>(null);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
      .then((profile) => setPoints(Number(profile.points) || 0))
      .catch(() => undefined);
  }, []);

  const target = useMemo(() => diceTarget(chanceBps, direction), [chanceBps, direction]);
  const multiplier = useMemo(() => diceMultiplier(chanceBps), [chanceBps]);
  const chance = chanceBps / 100;

  const play = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "dice" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit roll");

      const rolled = await fetch("/api/games/dice/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          clientSeed,
          bet,
          chanceBps,
          direction,
        }),
      }).then((response) => response.json()) as DiceResult & { error?: string };
      if (!rolled.proof) throw new Error(rolled.error ?? "Unable to settle roll");
      setResult(rolled);
      setProofRound(rolled);
      setHistory((current) => [rolled, ...current].slice(0, 12));
      setPoints(rolled.points);
      void wager.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Roll failed");
    } finally {
      setPending(false);
    }
  }, [bet, chanceBps, clientSeed, direction, pending, wager]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        void play();
      } else if (event.key.toLowerCase() === "d") {
        setBet((value) => clampStake(value * 2, wager));
      } else if (event.key.toLowerCase() === "h") {
        setBet((value) => clampStake(value / 2, wager));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [play, wager]);

  const trackStyle = {
    "--dice-target": `${(target / 9_999) * 100}%`,
    "--dice-roll": `${((result?.roll ?? target) / 9_999) * 100}%`,
  } as CSSProperties;

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room dice-page">
        <header className="game-room-header">
          <div>
            <Link href="/games">← Casino</Link>
            <span>PROVABLY FAIR / 98% BASE RTP</span>
            <h1>Neon Dice</h1>
          </div>
          <div className="game-room-balance">
            <span>YOUR BALANCE</span>
            <b>{wager.balance.toFixed(2)} {wager.symbol}</b>
          </div>
          <div className="game-room-balance">
            <span>LOYALTY SCORE</span>
            <b>{points.toLocaleString()} XP</b>
          </div>
        </header>
        <GameHints game="dice" />

        <section className="dice-room">
          <div className={`dice-stage ${pending ? "rolling" : ""} ${result?.won ? "won" : result ? "lost" : ""}`}>
            <span className="verified-badge"><i /> COMMITTED HMAC ROLL</span>
            <div className="dice-stage-brand"><span>NEON</span><b>DICE</b><small>0.00 — 99.99</small></div>

            <div className="dice-roll-display">
              <span>{pending ? "ROLLING" : result ? (result.won ? "WIN" : "NO HIT") : "ROLL READY"}</span>
              <b>{pending ? "••••" : result ? displayDiceUnits(result.roll) : displayDiceUnits(target)}</b>
              <small>{direction === "under" ? "ROLL UNDER" : "ROLL OVER"} {displayDiceUnits(target)}</small>
            </div>

            <div className={`dice-track ${direction}`} style={trackStyle}>
              <span className="dice-win-zone" />
              <i className="dice-threshold"><em>{displayDiceUnits(target)}</em></i>
              {result && !pending && <b className="dice-roll-marker"><span>{displayDiceUnits(result.roll)}</span></b>}
              <div className="dice-track-ticks">
                {[0, 25, 50, 75, 99.99].map((tick) => <small key={tick}>{tick.toFixed(tick === 99.99 ? 2 : 0)}</small>)}
              </div>
            </div>

            <div className="dice-metrics">
              <p><span>WIN CHANCE</span><b>{chance.toFixed(2)}%</b></p>
              <p><span>PAYOUT</span><b>{multiplier.toFixed(4)}×</b></p>
              <p><span>HOUSE EDGE</span><b>2.00%</b></p>
              <p><span>RETURN</span><b>98.00%</b></p>
            </div>

            <div className={`dice-result-ticket ${result?.won ? "win" : ""}`}>
              <span>{result ? `ROUND ${result.roundId.slice(0, 8).toUpperCase()}` : "AWAITING FIRST ROLL"}</span>
              <b>{result ? (result.won ? `+${result.payout.toFixed(2)} SOL` : "ROUND SETTLED") : "SERVER COMMIT FIRST"}</b>
              <small>{result ? `${result.multiplier.toFixed(4)}× verified payout` : "Outcome is derived only after your client seed arrives."}</small>
            </div>
          </div>

          <aside className="roulette-console dice-console">
            <div className="console-title"><span>BET SLIP</span><small>DICE</small></div>

            <label className="console-label">DIRECTION</label>
            <div className="dice-direction">
              <button className={direction === "under" ? "active" : ""} onClick={() => setDirection("under")}>ROLL UNDER</button>
              <button className={direction === "over" ? "active" : ""} onClick={() => setDirection("over")}>ROLL OVER</button>
            </div>

            <label className="console-label">WIN CHANCE <b>{chance.toFixed(2)}%</b></label>
            <input
              className="dice-range"
              aria-label="Win chance"
              type="range"
              min="100"
              max="9500"
              step="25"
              value={chanceBps}
              onChange={(event) => setChanceBps(Number(event.target.value))}
            />
            <div className="dice-presets">
              {[2_500, 4_950, 7_500].map((value) => (
                <button key={value} className={chanceBps === value ? "active" : ""} onClick={() => setChanceBps(value)}>
                  {(value / 100).toFixed(value === 4_950 ? 1 : 0)}%
                </button>
              ))}
            </div>

            <label className="console-label">STAKE</label>
            <div className="roulette-stake">
              <button onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
              <div>
                <input
                  aria-label="Stake amount"
                  type="number"
                  min={wager.minStake}
                  max={Math.min(wager.maxStake, wager.balance || wager.maxStake)}
                  step="0.01"
                  value={bet}
                  onChange={(event) => setBet(clampStake(Number(event.target.value), wager))}
                />
                <span>SOL</span>
              </div>
              <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
            </div>
            <div className="roulette-quick-stakes">
              {[0.01, 0.05, 0.1, 0.25].map((value) => <button key={value} onClick={() => setBet(value)}>{value}</button>)}
            </div>

            <label className="console-label">CLIENT SEED</label>
            <div className="dice-seed">
              <input
                aria-label="Client seed"
                value={clientSeed}
                minLength={8}
                maxLength={128}
                onChange={(event) => setClientSeed(event.target.value.replace(/[^a-z0-9:_-]/gi, ""))}
              />
              <button onClick={() => setClientSeed(freshSeed())}>↻</button>
            </div>

            <div className="roulette-receipt">
              <p><span>Target</span><b>{direction.toUpperCase()} {displayDiceUnits(target)}</b></p>
              <p><span>Profit on win</span><b>{Math.max(0, bet * multiplier - bet).toFixed(2)}</b></p>
              <p><span>Settlement</span><b>ROW LOCKED</b></p>
            </div>
            <button
              className="roulette-spin-button dice-roll-button"
              disabled={pending || bet < 0.01 || clientSeed.length < 8}
              onClick={() => void play()}
            >
              {pending ? "VERIFYING ROLL…" : `ROLL ${bet.toFixed(2)} SOL`}
            </button>
            <small className="dice-hotkeys">SPACE roll · D double · H halve</small>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="dice-lower-grid">
          <article className="dice-history-panel">
            <header>
              <div><span>SESSION LEDGER</span><h2>Recent rolls</h2></div>
              <b>{history.length} VERIFIED</b>
            </header>
            <div className="dice-history-head"><span>ROLL</span><span>TARGET</span><span>STAKE</span><span>PAYOUT</span><span>PROOF</span></div>
            <div className="dice-history-list">
              {history.length ? history.map((item) => (
                <button key={item.roundId} className={item.won ? "win" : ""} onClick={() => setProofRound(item)}>
                  <b>{displayDiceUnits(item.roll)}</b>
                  <span>{item.direction === "under" ? "<" : ">"} {displayDiceUnits(item.target)}</span>
                  <span>{item.bet.toFixed(2)}</span>
                  <strong>{item.payout.toFixed(2)}</strong>
                  <small>VERIFY ↗</small>
                </button>
              )) : <p>Every settled roll will appear here with its reproducible receipt.</p>}
            </div>
          </article>

          <article className="dice-foundation-panel">
            <span>SOURCED FOUNDATION</span>
            <h2>Casino ergonomics. SolCage settlement.</h2>
            <p>Chance and multiplier coupling, editable client seeds, hotkeys, history, and roll verification are adapted from John Leonardo&apos;s MIT-licensed Provably Fair Dice interface.</p>
            <dl>
              <div><dt>Entropy</dt><dd>HMAC-SHA256</dd></div>
              <div><dt>Range</dt><dd>10,000 outcomes</dd></div>
              <div><dt>Replay</dt><dd>Idempotent</dd></div>
              <div><dt>Storage</dt><dd>PostgreSQL</dd></div>
            </dl>
          </article>
        </section>

        <section className="fairness-panel dice-fairness">
          <header>
            <div><span>ROUND PROOF</span><h2>{proofRound ? "Seed revealed. Receipt reproducible." : "Commitment precedes every wager."}</h2></div>
            <b>{proofRound ? "VERIFIABLE" : "READY"}</b>
          </header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{proofRound?.proof.serverHash ?? "Generated before play"}</code></p>
            <p><span>CLIENT SEED</span><code>{proofRound?.proof.clientSeed ?? clientSeed}</code></p>
            <p><span>SERVER SEED</span><code>{proofRound?.proof.serverSeed ?? "Revealed only after settlement"}</code></p>
            <p><span>REPRODUCTION</span><code>{proofRound ? `HMAC → ${proofRound.roll} → ${displayDiceUnits(proofRound.roll)}` : "1 integer from 0 through 9,999"}</code></p>
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
