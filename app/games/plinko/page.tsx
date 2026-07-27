"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type PlinkoResult = {
  won: boolean;
  payout: number;
  outcome: {
    slot: number;
    multiplier: number;
    path: string[];
  };
  proof: {
    serverHash: string;
    serverSeed: string;
    clientSeed: string;
  };
};

const multipliers = [30, 9, 3, 1.5, 0.7, 0.5, 0.5, 0.7, 1.5, 3, 9, 30];
const rows = Array.from({ length: 11 }, (_, row) => Array.from({ length: row + 3 }));

export default function PlinkoPage() {
  const ballRef = useRef<HTMLSpanElement | null>(null);
  const [bank, setBank] = useState(1000);
  const [bet, setBet] = useState(25);
  const [pending, setPending] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [result, setResult] = useState<PlinkoResult | null>(null);
  const [commitment, setCommitment] = useState("");
  const [error, setError] = useState("");

  async function drop() {
    if (pending || bank <= 0 || bet > bank) return;
    setPending(true);
    setResult(null);
    setActiveSlot(null);
    setError("");

    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "plinko" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit drop");
      setCommitment(committed.serverHash);

      const revealed = await fetch("/api/games/fair/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          clientSeed: `solcage:${crypto.randomUUID()}`,
          bet,
          params: {},
        }),
      }).then((response) => response.json()) as PlinkoResult & { error?: string };
      if (!revealed.proof) throw new Error(revealed.error ?? "Unable to reveal drop");

      const frames: Keyframe[] = [{ transform: "translate(300px, 12px) scale(1)" }];
      let rightCount = 0;
      revealed.outcome.path.forEach((direction, index) => {
        if (direction === "R") rightCount += 1;
        const leftCount = index + 1 - rightCount;
        const x = 300 + (rightCount - leftCount) * 23.6;
        const y = 58 + index * 43;
        frames.push({
          transform: `translate(${x}px, ${y}px) scale(${index % 2 ? 0.9 : 1.06})`,
          offset: (index + 1) / 12,
        });
      });
      frames.push({
        transform: `translate(${40 + revealed.outcome.slot * 47.25}px, 548px) scale(1.2)`,
        offset: 1,
      });

      setBank((value) => Math.max(0, value - bet + revealed.payout));
      setResult(revealed);
      const animation = ballRef.current?.animate(frames, {
        duration: 2200,
        easing: "cubic-bezier(.35,.05,.55,1)",
        fill: "forwards",
      });
      if (animation) await animation.finished;
      setActiveSlot(revealed.outcome.slot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Drop failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room plinko-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>SOLCAGE ORIGINALS / VERIFIED PLINKO</span><h1>Neon Plinko</h1></div>
          <div className="game-room-balance"><span>PRACTICE TABLE BALANCE</span><b>{bank.toFixed(2)} CHIPS</b></div>
        </header>

        <section className="plinko-room">
          <div className="plinko-stage">
            <span className="verified-badge"><i /> HMAC-SHA256 PATH</span>
            <div className="plinko-board" aria-label="Eleven-row Plinko board">
              <span ref={ballRef} className={pending ? "plinko-ball dropping" : "plinko-ball"} />
              {rows.map((pegs, row) => (
                <div className="plinko-peg-row" style={{ width: `${120 + row * 44}px` }} key={row}>
                  {pegs.map((_, peg) => <i className="plinko-peg" key={peg} />)}
                </div>
              ))}
              <div className="plinko-slots">
                {multipliers.map((multiplier, index) => (
                  <span className={activeSlot === index ? "active" : ""} key={`${multiplier}-${index}`}>{multiplier}×</span>
                ))}
              </div>
            </div>
            <div className="plinko-result">
              <span>LAST DROP</span>
              <b>{result ? `${result.outcome.multiplier}×` : "—"}</b>
              <small>{result ? `${result.payout.toFixed(2)} CHIP RETURN` : "COMMIT A PATH TO PLAY"}</small>
            </div>
          </div>

          <aside className="roulette-console plinko-console">
            <div className="console-title"><span>DROP SLIP</span><small>11 ROWS / 12 SLOTS</small></div>
            <label className="console-label">STAKE</label>
            <div className="roulette-stake">
              <button onClick={() => setBet(Math.max(1, bet / 2))}>½</button>
              <div><input aria-label="Stake amount" type="number" min="1" max={bank} value={bet} onChange={(event) => setBet(Math.max(1, Number(event.target.value)))} /><span>CHIPS</span></div>
              <button onClick={() => setBet(Math.min(bank, bet * 2))}>2×</button>
            </div>
            <div className="roulette-quick-stakes">{[5, 25, 50, 100].map((value) => <button key={value} onClick={() => setBet(Math.min(bank, value))}>{value}</button>)}</div>
            <div className="roulette-receipt">
              <p><span>Rows</span><b>11</b></p>
              <p><span>Maximum multiplier</span><b>30×</b></p>
              <p><span>Designed RTP</span><b>98.00%</b></p>
              <p><span>Path entropy</span><b>11 BITS</b></p>
            </div>
            <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={drop}>{pending ? "BALL IN PLAY…" : `DROP ${bet.toFixed(2)} CHIPS`}</button>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>DROP PROOF</span><h2>{result ? "The committed path is reproducible." : "The path is committed before release."}</h2></div><b>{result ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{(result?.proof.serverHash ?? commitment) || "Generated before every drop"}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? "Generated in your browser"}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Hidden until the path is locked"}</code></p>
            <p><span>PATH</span><code>{result?.outcome.path.join(" ") ?? "11 HMAC-derived left/right decisions"}</code></p>
          </div>
          <small>The animation follows the already-settled HMAC path. Browser physics cannot move the ball into a different payout slot.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}
