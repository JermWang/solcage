"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";
import {
  KENO_DRAW_COUNT,
  KENO_MAX_PICKS,
  KENO_MIN_PICKS,
  KENO_NUMBER_COUNT,
  KENO_PAYTABLE,
} from "@/lib/games/keno";

type KenoResult = {
  roundId: string;
  bet: number;
  selectedNumbers: number[];
  drawnNumbers: number[];
  hitNumbers: number[];
  hitCount: number;
  multiplier: number;
  payout: number;
  outcome: "win" | "loss";
  points: number;
  rank: number;
  proof: {
    algorithm: string;
    serverHash: string;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    entropyCount: number;
  };
};

function randomSelection(count: number) {
  const entropy = new Uint32Array(KENO_NUMBER_COUNT);
  crypto.getRandomValues(entropy);
  return Array.from({ length: KENO_NUMBER_COUNT }, (_, index) => ({
    number: index + 1,
    entropy: entropy[index],
  }))
    .sort((left, right) => left.entropy - right.entropy)
    .slice(0, count)
    .map((item) => item.number)
    .sort((left, right) => left - right);
}

export default function KenoPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [bet, setBet] = useState(0.01);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [result, setResult] = useState<KenoResult | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [commitment, setCommitment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ hits: number; picks: number; multiplier: number }>>([]);

  useEffect(() => {
    if (!result) return;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setRevealedCount(count);
      if (count >= result.drawnNumbers.length) window.clearInterval(timer);
    }, 95);
    return () => window.clearInterval(timer);
  }, [result]);

  const selectedSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const visibleDraws = useMemo(
    () => new Set(result?.drawnNumbers.slice(0, revealedCount) ?? []),
    [result, revealedCount],
  );
  const visibleHits = useMemo(
    () => new Set(result?.hitNumbers.filter((number) => visibleDraws.has(number)) ?? []),
    [result, visibleDraws],
  );
  const drawComplete = Boolean(result && revealedCount >= KENO_DRAW_COUNT);
  const paytable = KENO_PAYTABLE[selectedNumbers.length] ?? KENO_PAYTABLE[KENO_MIN_PICKS];

  function toggleNumber(number: number) {
    if (pending || result) return;
    setError("");
    setSelectedNumbers((current) => {
      if (current.includes(number)) return current.filter((value) => value !== number);
      if (current.length >= KENO_MAX_PICKS) return current;
      return [...current, number].sort((left, right) => left - right);
    });
  }

  function quickPick(count: number) {
    if (pending || result) return;
    setSelectedNumbers(randomSelection(count));
    setError("");
  }

  async function play() {
    if (
      pending
      || bet > bank
      || selectedNumbers.length < KENO_MIN_PICKS
      || selectedNumbers.length > KENO_MAX_PICKS
    ) return;
    setPending(true);
    setError("");
    setResult(null);
    setRevealedCount(0);
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "keno" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit Keno draw");
      setCommitment(committed.serverHash);
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      const clientSeed = `solcage:${crypto.randomUUID()}`;
      const next = await fetch("/api/games/keno/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          clientSeed,
          selectedNumbers,
          bet,
        }),
      }).then((response) => response.json()) as KenoResult & { error?: string };
      if (!next.roundId) throw new Error(next.error ?? "Unable to settle Keno draw");
      void wager.refresh();
      setHistory((items) => [
        { hits: next.hitCount, picks: next.selectedNumbers.length, multiplier: next.multiplier },
        ...items,
      ].slice(0, 8));
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Keno draw failed");
    } finally {
      setPending(false);
    }
  }

  function repeatDraw() {
    setResult(null);
    setRevealedCount(0);
    setCommitment("");
    setError("");
  }

  const statusLabel = pending
    ? "LOCKING DRAW"
    : result && !drawComplete
      ? `DRAWING ${Math.min(revealedCount + 1, KENO_DRAW_COUNT)} / ${KENO_DRAW_COUNT}`
      : drawComplete
        ? `${result?.hitCount ?? 0} HITS / ${result?.selectedNumbers.length ?? 0} PICKS`
        : `${selectedNumbers.length} / ${KENO_MAX_PICKS} PICKS LOCKED`;

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room keno-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>CHARLIE GUAN KENO FOUNDATION / VERIFIED DRAW</span><h1>Cage Keno</h1></div>
          <div className="game-room-balance"><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></div>
        </header>
        <GameHints game="keno" />

        <section className="keno-room">
          <div className={`keno-stage ${drawComplete ? result?.outcome : ""}`}>
            <div className="keno-stage-top">
              <span className="verified-badge"><i /> HMAC DRAW LOCKED</span>
              <div className="keno-status"><span>{statusLabel}</span><b>{drawComplete ? `${result?.multiplier.toFixed(2)}×` : "80 / 20"}</b></div>
            </div>

            <div className="keno-board" aria-label="Keno number board">
              {Array.from({ length: KENO_NUMBER_COUNT }, (_, index) => index + 1).map((number) => {
                const selected = selectedSet.has(number);
                const drawn = visibleDraws.has(number);
                const hit = visibleHits.has(number);
                return (
                  <button
                    aria-pressed={selected}
                    className={`${selected ? "selected" : ""} ${drawn ? "drawn" : ""} ${hit ? "hit" : ""}`}
                    disabled={pending || Boolean(result)}
                    key={number}
                    onClick={() => toggleNumber(number)}
                    title={selected ? `Remove ${number}` : `Pick ${number}`}
                  >
                    <span>{number}</span>
                    {hit && <i />}
                  </button>
                );
              })}
            </div>

            <footer className="keno-stage-footer">
              <div className="keno-draw-tray">
                <span>DRAW</span>
                <div>
                  {Array.from({ length: KENO_DRAW_COUNT }, (_, index) => (
                    <i className={index < revealedCount ? (visibleHits.has(result?.drawnNumbers[index] ?? 0) ? "hit" : "shown") : ""} key={index}>
                      {index < revealedCount ? result?.drawnNumbers[index] : "·"}
                    </i>
                  ))}
                </div>
              </div>
              <div className="keno-history">
                <span>RECENT</span>
                <div>{history.length ? history.map((item, index) => <i className={item.multiplier > 0 ? "win" : ""} key={`${item.hits}-${item.picks}-${index}`}>{item.hits}/{item.picks}</i>) : <small>NO DRAWS YET</small>}</div>
              </div>
            </footer>
          </div>

          <aside className="roulette-console keno-console">
            <div className="console-title"><span>NUMBER SLIP</span><small>KENO</small></div>
            {!result && <>
              <label className="console-label">QUICK PICKS</label>
              <div className="keno-quick-picks">
                {[5, 7, 10].map((count) => <button disabled={pending} key={count} onClick={() => quickPick(count)}>{count} PICKS</button>)}
                <button disabled={pending} onClick={() => setSelectedNumbers([])}>CLEAR</button>
              </div>
              <label className="console-label">STAKE</label>
              <div className="roulette-stake">
                <button disabled={pending} onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
                <div><input aria-label="Stake amount" disabled={pending} type="number" min={wager.minStake} max={Math.min(wager.maxStake, bank)} value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} /><span>SOL</span></div>
                <button disabled={pending} onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
              </div>
              <div className="roulette-quick-stakes">{[0.01, 0.05, 0.1, 0.25].map((value) => <button disabled={pending} key={value} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}</div>
            </>}

            <label className="console-label">PAYOUTS / {selectedNumbers.length || KENO_MIN_PICKS} PICKS</label>
            <div className="keno-paytable">
              {paytable.map((multiplier, hits) => (
                <span className={drawComplete && result?.hitCount === hits ? "active" : ""} key={hits}>
                  <small>{hits} HIT{hits === 1 ? "" : "S"}</small>
                  <b>{multiplier ? `${multiplier.toFixed(2)}×` : "—"}</b>
                </span>
              ))}
            </div>

            <div className="roulette-receipt">
              <p><span>Selected</span><b>{selectedNumbers.length} NUMBERS</b></p>
              <p><span>Draw size</span><b>20 / 80</b></p>
              <p><span>Designed RTP</span><b>≈ 96.00%</b></p>
              <p><span>Result</span><b>{drawComplete ? `${result?.payout.toFixed(2)} SOL` : "PENDING"}</b></p>
            </div>

            {!result && <button className="roulette-spin-button" disabled={pending || bet > bank || selectedNumbers.length < KENO_MIN_PICKS} onClick={play}>{pending ? "COMMITTING…" : `DRAW ${bet.toFixed(2)} SOL`}</button>}
            {result && <button className="roulette-spin-button" disabled={!drawComplete} onClick={repeatDraw}>{drawComplete ? "DRAW AGAIN / SAME PICKS" : "DRAWING…"}</button>}
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>DRAW RECEIPT</span><h2>{result ? "Twenty numbers, one reproducible draw." : "Your picks lock after the server commitment."}</h2></div><b>{result ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{(result?.proof.serverHash ?? commitment) || "Generated before every draw"}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? "Supplied after commitment"}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Hidden until the draw settles"}</code></p>
            <p><span>DRAW ORDER</span><code>{result ? result.drawnNumbers.join(", ") : "20 unique values from 128 HMAC samples"}</code></p>
          </div>
          <small>The original MIT Keno server’s pick, draw, hit, and reward structure is retained. Browser randomness and its low-return table are replaced by SolCage’s server commitment, 96% paytables, PostgreSQL row lock, proof reveal, and atomic reward persistence.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}
