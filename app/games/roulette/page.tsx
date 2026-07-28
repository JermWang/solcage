"use client";

import Link from "next/link";
import { useState } from "react";
import { RouletteWheel } from "react-casino-roulette";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";

type Choice = "RED" | "BLACK" | "ZERO";
type Proof = {
  roundId: string;
  algorithm: string;
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
};

type RoundResult = {
  won: boolean;
  payout: number;
  outcome: { number: number; color: string; choice: string; multiplier: number };
  proof: Proof;
};

export default function RoulettePage() {
  const [choice, setChoice] = useState<Choice>("RED");
  const [bet, setBet] = useState(0.01);
  const wager = useWager();
  const bank = wager.balance;
  const [start, setStart] = useState(false);
  const [winningBet, setWinningBet] = useState("0");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [commitment, setCommitment] = useState("");
  const [error, setError] = useState("");

  async function spin() {
    if (pending || bet > bank) return;
    setPending(true);
    setError("");
    setResult(null);
    setStart(false);

    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "roulette" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit round");
      setCommitment(committed.serverHash);

      const clientSeed = `solcage:${crypto.randomUUID()}`;
      const revealed = await fetch("/api/games/fair/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: committed.roundId, clientSeed, bet, params: { choice } }),
      }).then((response) => response.json()) as RoundResult & { error?: string };
      if (!revealed.proof) throw new Error(revealed.error ?? "Unable to reveal round");

      setWinningBet(String(revealed.outcome.number));
      setResult(revealed);
      void wager.refresh();
      setStart(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Round failed");
      setPending(false);
    }
  }

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>SOLCAGE ORIGINALS / EUROPEAN ROULETTE</span><h1>Cage Roulette</h1></div>
          <div className="game-room-balance"><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></div>
        </header>
        <GameHints game="roulette" />

        <section className="roulette-room">
          <div className="roulette-visual">
            <span className="verified-badge"><i /> HMAC-SHA256 VERIFIED</span>
            <RouletteWheel
              start={start}
              winningBet={winningBet}
              withAnimation
              onSpinningEnd={() => setPending(false)}
            />
            <div className="roulette-result">
              <span>LAST RESULT</span>
              <b>{result ? `${result.outcome.number} / ${result.outcome.color}` : "—"}</b>
              <small>{result ? (result.won ? `WIN +${result.payout.toFixed(2)}` : "NO HIT") : "PLACE A BET"}</small>
            </div>
          </div>

          <aside className="roulette-console">
            <div className="console-title"><span>BET SLIP</span><small>SINGLE-ZERO WHEEL</small></div>
            <label className="console-label">SELECT OUTCOME</label>
            <div className="roulette-bet-choices">
              {(["RED", "BLACK", "ZERO"] as Choice[]).map((item) => (
                <button key={item} className={`${item.toLowerCase()} ${choice === item ? "active" : ""}`} onClick={() => setChoice(item)}>{item}<small>{item === "ZERO" ? "36.00×" : "2.00×"}</small></button>
              ))}
            </div>

            <label className="console-label">STAKE</label>
            <div className="roulette-stake">
              <button onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
              <div><input aria-label="Stake amount" type="number" min={wager.minStake} max={Math.min(wager.maxStake, bank)} value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} /><span>SOL</span></div>
              <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
            </div>
            <div className="roulette-quick-stakes">{[0.01, 0.05, 0.1, 0.25].map((value) => <button key={value} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}</div>

            <div className="roulette-receipt">
              <p><span>Selection</span><b>{choice}</b></p>
              <p><span>Potential return</span><b>{(bet * (choice === "ZERO" ? 36 : 2)).toFixed(2)}</b></p>
              <p><span>House edge</span><b>2.70%</b></p>
            </div>

            <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={spin}>{pending ? "ROUND COMMITTED…" : `SPIN ${bet.toFixed(2)} SOL`}</button>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>PROVABLY FAIR</span><h2>Verify the result yourself.</h2></div><b>{result ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{result?.proof.serverHash ?? (commitment || "Created before every spin")}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? "Generated in your browser"}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Hidden until the result is locked"}</code></p>
            <p><span>ALGORITHM</span><code>HMAC-SHA256 / NONCE 0</code></p>
          </div>
          <small>The server commits to a SHA-256 hash before your browser supplies its client seed. After settlement, the original server seed is revealed and the outcome can be reproduced independently.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}
