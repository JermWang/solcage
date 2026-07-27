"use client";

import Link from "next/link";
import { useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type Game = "dice" | "slots";
type FairProof = {
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
};
type GameResult = {
  won: boolean;
  payout: number;
  outcome: Record<string, number | string | string[]>;
  proof: FairProof;
};

const slotGlyphs: Record<string, string> = {
  CAGE: "◇",
  SOL: "S",
  LIME: "●",
  CHIP: "◉",
  SEVEN: "7",
  CROWN: "♛",
  JACKPOT: "✦",
};

export default function OriginalGamePage() {
  const [game, setGame] = useState<Game>(() => {
    if (typeof window === "undefined") return "dice";
    return new URLSearchParams(window.location.search).get("game") === "slots" ? "slots" : "dice";
  });
  const [bank, setBank] = useState(1000);
  const [bet, setBet] = useState(25);
  const [target, setTarget] = useState(50);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState("");

  async function play() {
    if (pending || bet > bank || bank <= 0) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit round");

      const revealed = await fetch("/api/games/fair/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          clientSeed: `solcage:${crypto.randomUUID()}`,
          bet,
          params: game === "dice" ? { target } : {},
        }),
      }).then((response) => response.json()) as GameResult & { error?: string };
      if (!revealed.proof) throw new Error(revealed.error ?? "Unable to reveal round");
      setResult(revealed);
      setBank((value) => Math.max(0, value - bet + revealed.payout));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Round failed");
    } finally {
      setPending(false);
    }
  }

  const reels = Array.isArray(result?.outcome.reels) ? result.outcome.reels as string[] : ["CAGE", "SOL", "JACKPOT"];
  const roll = typeof result?.outcome.roll === "number" ? result.outcome.roll : null;

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>SOLCAGE ORIGINALS / VERIFIED INSTANT</span><h1>{game === "dice" ? "Neon Dice" : "Cage Slots"}</h1></div>
          <div className="game-room-balance"><span>TABLE BALANCE</span><b>{bank.toFixed(2)} CHIPS</b></div>
        </header>

        <nav className="original-game-tabs" aria-label="Original games">
          <button className={game === "dice" ? "active" : ""} onClick={() => { setGame("dice"); setResult(null); }}>NEON DICE</button>
          <button className={game === "slots" ? "active" : ""} onClick={() => { setGame("slots"); setResult(null); }}>CAGE SLOTS</button>
        </nav>

        <section className="original-room">
          <div className={`original-stage ${game}`}>
            <span className="verified-badge"><i /> VERIFIED OUTCOME</span>
            {game === "dice" ? (
              <>
                <div className={`premium-die ${pending ? "rolling" : ""}`}><span>{roll ?? "SC"}</span><i /><i /><i /></div>
                <div className="dice-result-line">
                  <span>ROLL UNDER <b>{target}</b></span>
                  <span>WIN CHANCE <b>{target - 1}%</b></span>
                  <span>PAYOUT <b>{(98 / Math.max(1, target - 1)).toFixed(2)}×</b></span>
                </div>
              </>
            ) : (
              <>
                <div className={`slot-cabinet ${pending ? "spinning" : ""}`}>
                  <header><span>SOLCAGE</span><b>ORIGINAL</b></header>
                  <div className="slot-window">
                    {reels.map((symbol, index) => <div className="slot-reel" key={`${symbol}-${index}`}><span>{slotGlyphs[symbol] ?? symbol}</span><small>{symbol}</small></div>)}
                  </div>
                  <footer>◇ PROVABLY FAIR ◇</footer>
                </div>
                <div className="slot-paytable"><span>PAIR <b>2×</b></span><span>TRIPLE <b>12×</b></span><span>3 JACKPOTS <b>50×</b></span></div>
              </>
            )}
            {result && <div className={`original-win-state ${result.won ? "won" : ""}`}><span>{result.won ? "WIN" : "ROUND COMPLETE"}</span><b>{result.won ? `+${result.payout.toFixed(2)} CHIPS` : "NO PAYOUT"}</b></div>}
          </div>

          <aside className="roulette-console original-console">
            <div className="console-title"><span>BET SLIP</span><small>{game.toUpperCase()}</small></div>
            {game === "dice" && <>
              <label className="console-label">ROLL UNDER <b>{target}</b></label>
              <input className="original-range" type="range" min="2" max="95" value={target} onChange={(event) => setTarget(Number(event.target.value))} />
            </>}
            <label className="console-label">STAKE</label>
            <div className="roulette-stake">
              <button onClick={() => setBet(Math.max(1, bet / 2))}>½</button>
              <div><input aria-label="Stake amount" type="number" min="1" max={bank} value={bet} onChange={(event) => setBet(Math.max(1, Number(event.target.value)))} /><span>CHIPS</span></div>
              <button onClick={() => setBet(Math.min(bank, bet * 2))}>2×</button>
            </div>
            <div className="roulette-quick-stakes">{[5, 25, 50, 100].map((value) => <button key={value} onClick={() => setBet(Math.min(bank, value))}>{value}</button>)}</div>
            <div className="roulette-receipt">
              <p><span>Engine</span><b>HMAC-SHA256</b></p>
              <p><span>Commitment</span><b>BEFORE PLAY</b></p>
              <p><span>Proof</span><b>REVEALED AFTER</b></p>
            </div>
            <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={play}>{pending ? "VERIFYING ROUND…" : `${game === "dice" ? "ROLL" : "SPIN"} ${bet.toFixed(2)} CHIPS`}</button>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>ROUND PROOF</span><h2>{result ? "Seed revealed and stored." : "Commitment precedes every wager."}</h2></div><b>{result ? "VERIFIABLE" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{result?.proof.serverHash ?? "Generated before play"}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? "Generated by your browser"}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Revealed after settlement"}</code></p>
            <p><span>FOUNDATION</span><code>Provable.IO Core / MIT</code></p>
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
