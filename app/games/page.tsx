"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

type GameId = "dice" | "mines" | "roulette";

const gameCatalog: Array<{ id: GameId; name: string; eyebrow: string; image: string; detail: string }> = [
  { id: "dice", name: "Neon Dice", eyebrow: "ROLL UNDER / VARIABLE", image: "/game-art/dice.webp", detail: "Move the target, watch the odds change, then roll from 1 to 100." },
  { id: "mines", name: "Crystal Mines", eyebrow: "5 × 5 / CASH OUT", image: "/game-art/mines.webp", detail: "Reveal clean cells for a rising multiplier. Leave before the energy mine wakes." },
  { id: "roulette", name: "Sol Spin", eyebrow: "SINGLE ZERO / 2×", image: "/game-art/roulette.webp", detail: "Pick a color and send the luminous ball around the single-zero wheel." },
];

const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function money(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GamesPage() {
  const [active, setActive] = useState<GameId>("dice");
  const [bank, setBank] = useState(1000);
  const [bet, setBet] = useState(25);
  const [message, setMessage] = useState("Move the target, watch the odds change, then roll from 1 to 100.");
  const [diceTarget, setDiceTarget] = useState(50);
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [rouletteChoice, setRouletteChoice] = useState<"RED" | "BLACK" | "ZERO">("RED");
  const [rouletteNumber, setRouletteNumber] = useState<number | null>(null);
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [mineActive, setMineActive] = useState(false);
  const [mineMultiplier, setMineMultiplier] = useState(1);

  const game = useMemo(() => gameCatalog.find((item) => item.id === active) ?? gameCatalog[0], [active]);

  async function record(gameName: string, won: boolean, payout: number) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "game_round", game: gameName, bet, won, payout, eventKey: crypto.randomUUID() }),
    }).catch(() => undefined);
  }

  function canPlay() {
    if (bet > bank) {
      setMessage("Your table balance is too small for that stake.");
      return false;
    }
    return true;
  }

  function settle(won: boolean, payout: number, nextMessage: string, gameName: string) {
    setBank((value) => Math.max(0, value - bet + payout));
    setMessage(nextMessage);
    void record(gameName, won, payout);
  }

  function playDice() {
    if (!canPlay()) return;
    const roll = Math.floor(Math.random() * 100) + 1;
    const won = roll < diceTarget;
    const multiplier = 98 / Math.max(1, diceTarget - 1);
    setDiceRoll(roll);
    settle(won, won ? bet * multiplier : 0, won ? `${roll} rolls under ${diceTarget}. Clean hit.` : `${roll} misses the line.`, "Neon Dice");
  }

  function playRoulette() {
    if (!canPlay()) return;
    const number = Math.floor(Math.random() * 37);
    const color = number === 0 ? "ZERO" : redNumbers.has(number) ? "RED" : "BLACK";
    const won = color === rouletteChoice;
    const multiplier = rouletteChoice === "ZERO" ? 14 : 2;
    setRouletteNumber(number);
    settle(won, won ? bet * multiplier : 0, `${number} / ${color}${won ? " — color pays." : " — no match."}`, "Sol Spin");
  }

  function startMines() {
    if (!canPlay()) return;
    const next = new Set<number>();
    while (next.size < 4) next.add(Math.floor(Math.random() * 25));
    setBank((value) => value - bet);
    setMines(next);
    setRevealed(new Set());
    setMineMultiplier(1);
    setMineActive(true);
    setMessage("Four mines are live. Pick a cell.");
  }

  function revealCell(index: number) {
    if (!mineActive || revealed.has(index)) return;
    if (mines.has(index)) {
      setRevealed(new Set([...revealed, index]));
      setMineActive(false);
      setMessage("Energy mine. Round over.");
      void record("Crystal Mines", false, 0);
      return;
    }
    const next = new Set([...revealed, index]);
    const multiplier = 1 + next.size * 0.24;
    setRevealed(next);
    setMineMultiplier(multiplier);
    setMessage(`${next.size} safe. Cash out ${money(bet * multiplier)} or keep digging.`);
  }

  function cashMines() {
    if (!mineActive || revealed.size === 0) return;
    const payout = bet * mineMultiplier;
    setBank((value) => value + payout);
    setMineActive(false);
    setMessage(`${mineMultiplier.toFixed(2)}× secured. Chips returned to your stack.`);
    void record("Crystal Mines", true, payout);
  }

  function selectGame(next: GameId) {
    setActive(next);
    setMessage(gameCatalog.find((item) => item.id === next)?.detail ?? "");
  }

  return (
    <main className="games-page">
      <div className="ticker" aria-hidden="true"><span>S</span><span>O</span><span>L</span><span>C</span><span>A</span><span>G</span><span>E</span><b>SOLANA FLOOR — OPEN</b></div>
      <nav className="games-nav">
        <Link className="brand" href="/"><BrandMark /><span>SOLCAGE</span></Link>
        <div className="nav-links"><Link href="/">Home</Link><Link href="/?view=vault">Cage</Link><Link className="active" href="/games">Games</Link><Link href="/leaderboard">Leaderboard</Link></div>
        <div className="game-bank"><small>TABLE BALANCE</small><b>{money(bank)} CHIPS</b></div>
        <Link className="wallet" href="/profile">Profile</Link>
      </nav>

      <header className="games-hero">
        <div className="games-hero-copy">
          <div className="eyebrow"><span /> THREE GAME EXPERIENCES / ORIGINAL SOLCAGE ART</div>
          <h1>The floor is<br /><em>alive.</em></h1>
          <p>Choose a table, set your stake, and play instantly. Every completed round writes to your activity history and earns loyalty points.</p>
          <a className="primary" href="#tables">Choose a table <span>↓</span></a>
        </div>
        <div className="games-hero-art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/game-art/roulette.webp" alt="" />
          <div><span>LIVE FLOOR</span><b>03 TABLES</b><small>WALLET-LINKED ACCOUNT</small></div>
        </div>
      </header>

      <section className="preview-rail" id="tables">
        {gameCatalog.map((item, index) => (
          <button key={item.id} className={active === item.id ? "game-preview active" : "game-preview"} onClick={() => selectGame(item.id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt={`${item.name} game preview`} />
            <span>0{index + 1} / {item.eyebrow}</span>
            <div><h2>{item.name}</h2><b>ENTER ↗</b></div>
            <p>{item.detail}</p>
          </button>
        ))}
      </section>

      <section className="play-space">
        <div className="play-meta">
          <span>NOW PLAYING / {game.eyebrow}</span>
          <h2>{game.name}</h2>
          <p>{message}</p>
          <div className="stake-control">
            <span>STAKE</span>
            <button onClick={() => setBet(Math.max(5, bet / 2))}>½</button>
            <b>{money(bet)} CHIPS</b>
            <button onClick={() => setBet(Math.min(bank || 5, bet * 2))}>2×</button>
          </div>
          <small>Round outcomes in this interface are generated locally. Wallet-linked activity and loyalty are recorded to your SolCage profile.</small>
        </div>

        <div className={`game-stage game-${active}`}>
          {active === "dice" && (
            <>
              <div className="dice-readout"><span>{diceRoll ?? "—"}</span><small>ROLL / 100</small></div>
              <label className="target-slider">ROLL UNDER <b>{diceTarget}</b><input type="range" min="2" max="95" value={diceTarget} onChange={(event) => setDiceTarget(Number(event.target.value))} /></label>
              <div className="odds-row"><span>WIN CHANCE <b>{diceTarget - 1}%</b></span><span>PAYOUT <b>{(98 / Math.max(1, diceTarget - 1)).toFixed(2)}×</b></span></div>
              <button className="primary game-action" onClick={playDice}>ROLL DICE</button>
            </>
          )}

          {active === "roulette" && (
            <>
              <div className={`roulette-wheel ${rouletteNumber !== null ? "spun" : ""}`}><span>{rouletteNumber ?? "SC"}</span></div>
              <div className="choice-row roulette-choices">
                {(["RED", "BLACK", "ZERO"] as const).map((choice) => <button key={choice} className={rouletteChoice === choice ? `selected ${choice.toLowerCase()}` : choice.toLowerCase()} onClick={() => setRouletteChoice(choice)}>{choice}</button>)}
              </div>
              <button className="primary game-action" onClick={playRoulette}>SPIN THE WHEEL</button>
            </>
          )}

          {active === "mines" && (
            <>
              <div className="mines-grid">
                {Array.from({ length: 25 }, (_, index) => {
                  const open = revealed.has(index);
                  const isMine = open && mines.has(index);
                  return <button key={index} disabled={!mineActive || open} className={open ? (isMine ? "mine" : "safe") : ""} onClick={() => revealCell(index)} aria-label={`Cell ${index + 1}`}>{open ? (isMine ? "✦" : "◆") : ""}</button>;
                })}
              </div>
              <div className="mine-actions">
                <button className="secondary light" onClick={startMines}>{mineActive ? "RESET ROUND" : "START MINES"}</button>
                <button className="primary" disabled={!mineActive || revealed.size === 0} onClick={cashMines}>CASH {mineMultiplier.toFixed(2)}×</button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="responsible-strip"><b>BUILT FOR SOLANA.</b><p>SolCage unifies collateral, credit, gameplay and loyalty around a single wallet-linked profile.</p><Link href="/">BACK TO THE CAGE ↗</Link></section>
    </main>
  );
}
