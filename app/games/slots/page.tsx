"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";
import {
  SLOT_LINE_COUNT,
  SLOT_PAYTABLE,
  type SlotLineWin,
  type SlotSymbol,
} from "@/lib/games/slots";

type SlotsProof = {
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  entropyCount: number;
  stopRange: [number, number];
};

type SlotsResult = {
  roundId: string;
  bet: number;
  stops: number[];
  matrix: SlotSymbol[][];
  lineWins: SlotLineWin[];
  scatterCount: number;
  scatterMultiplier: number;
  multiplier: number;
  payout: number;
  outcome: "win" | "loss";
  proof: SlotsProof;
};

const DEFAULT_MATRIX: SlotSymbol[][] = [
  ["CROWN", "SEVEN", "DIAMOND", "SOL", "LIME"],
  ["WILD", "CHIP", "SOL", "SEVEN", "VAULT"],
  ["LIME", "DIAMOND", "CROWN", "CHIP", "WILD"],
];

const symbolLabels: Record<SlotSymbol, { mark: string; name: string }> = {
  WILD: { mark: "SC", name: "WILD" },
  CROWN: { mark: "♛", name: "CROWN" },
  SEVEN: { mark: "7", name: "SEVEN" },
  SOL: { mark: "S", name: "SOL" },
  DIAMOND: { mark: "◆", name: "DIAMOND" },
  CHIP: { mark: "◎", name: "CHIP" },
  LIME: { mark: "●", name: "LIME" },
  VAULT: { mark: "▣", name: "VAULT" },
};

function SymbolFace({
  symbol,
  winning,
}: {
  symbol: SlotSymbol;
  winning: boolean;
}) {
  return (
    <span className={`vault-symbol symbol-${symbol.toLowerCase()} ${winning ? "winning" : ""}`}>
      {symbol === "WILD" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/solcage-logo.png" alt="" />
      ) : <b>{symbolLabels[symbol].mark}</b>}
      <small>{symbolLabels[symbol].name}</small>
    </span>
  );
}

export default function SlotsPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [bet, setBet] = useState(0.01);
  const [pending, setPending] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [result, setResult] = useState<SlotsResult | null>(null);
  const [history, setHistory] = useState<SlotsResult[]>([]);
  const [error, setError] = useState("");
  const [spinEpoch, setSpinEpoch] = useState(0);

  const matrix = result?.matrix ?? DEFAULT_MATRIX;
  const winningCells = useMemo(() => {
    const cells = new Set<string>();
    result?.lineWins.forEach((win) => win.cells.forEach((cell) => cells.add(`${cell.reel}:${cell.row}`)));
    if (result?.scatterMultiplier) {
      result.matrix.forEach((row, rowIndex) => row.forEach((symbol, reel) => {
        if (symbol === "VAULT") cells.add(`${reel}:${rowIndex}`);
      }));
    }
    return cells;
  }, [result]);

  const play = useCallback(async () => {
    if (pending || bank <= 0 || bet <= 0 || bet > bank) return;
    setPending(true);
    setError("");
    setResult(null);
    setSpinEpoch((value) => value + 1);
    try {
      const clientSeed = `neon-vault:${crypto.randomUUID()}`;
      const committedResponse = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "slots" }),
      });
      const committed = await committedResponse.json();
      if (!committedResponse.ok || !committed.roundId) {
        throw new Error(committed.error ?? "Unable to commit spin");
      }

      const spinRequest = fetch("/api/games/slots/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: committed.roundId, clientSeed, bet }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.proof) throw new Error(payload.error ?? "Unable to settle spin");
        return payload as SlotsResult;
      });
      const [settled] = await Promise.all([
        spinRequest,
        new Promise((resolve) => window.setTimeout(resolve, turbo ? 650 : 1_650)),
      ]);
      setResult(settled);
      setHistory((current) => [settled, ...current].slice(0, 8));
      void wager.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Spin failed");
    } finally {
      setPending(false);
    }
  }, [bank, bet, pending, turbo, wager]);

  useEffect(() => {
    const keyboardSpin = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      void play();
    };
    window.addEventListener("keydown", keyboardSpin);
    return () => window.removeEventListener("keydown", keyboardSpin);
  }, [play]);

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room vault-slots-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>SOLCAGE ORIGINAL / NINE-LINE VIDEO SLOT</span><h1>Neon Vault</h1></div>
          <div className="game-room-balance"><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></div>
        </header>
        <GameHints game="slots" />

        <section className="vault-slots-room">
          <div className="vault-cabinet-wrap">
            <div className="vault-cabinet">
              <header>
                <div><span>NEON</span><b>VAULT</b></div>
                <p><span>9 LINES</span><span>96.03% BASE RTP</span><span>1,500× TOP SYMBOL</span></p>
              </header>
              <div className="vault-screen">
                <span className="vault-screen-glare" />
                <div className="vault-line-rail left">{[1, 4, 6, 8, 2].map((line) => <i key={line}>{line}</i>)}</div>
                <div className={`vault-reels ${pending ? "spinning" : ""}`} aria-label="Five reel, three row slot result">
                  {Array.from({ length: 5 }, (_, reel) => (
                    <div
                      className="vault-reel"
                      key={`${spinEpoch}-${reel}`}
                      style={{ "--reel-index": reel } as CSSProperties}
                    >
                      {matrix.map((row, rowIndex) => (
                        <SymbolFace
                          symbol={row[reel]}
                          winning={winningCells.has(`${reel}:${rowIndex}`)}
                          key={`${row[reel]}-${rowIndex}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="vault-line-rail right">{[3, 5, 7, 9].map((line) => <i key={line}>{line}</i>)}</div>
              </div>
              <footer>
                <span><i /> COMMITTED HMAC REELS</span>
                <b>{pending
                  ? "REELS IN MOTION"
                  : result?.payout
                    ? `WIN ${result.payout.toFixed(2)} · ${result.multiplier.toFixed(2)}×`
                    : result
                      ? "NO WIN · SPIN AGAIN"
                      : "SPACE BAR TO SPIN"}</b>
                <span>WILD SUBSTITUTES · VAULT PAYS ANYWHERE</span>
              </footer>
            </div>

            <div className={`vault-win-readout ${result?.payout ? "active" : ""}`}>
              <span>{result?.lineWins.length ? `${result.lineWins.length} PAYLINE${result.lineWins.length === 1 ? "" : "S"}` : "NEON VAULT"}</span>
              <b>{result?.payout ? `+${result.payout.toFixed(2)}` : "READY"}</b>
              <small>{result?.scatterMultiplier ? `${result.scatterCount} VAULTS · ${result.scatterMultiplier}× SCATTER` : "EVERY STOP IS REPLAYABLE"}</small>
            </div>
          </div>

          <aside className="roulette-console vault-console">
            <div className="console-title"><span>SPIN CONTROL</span><small>NINE LINES FIXED</small></div>
            <div className="vault-mode-row">
              <button className={!turbo ? "active" : ""} onClick={() => setTurbo(false)}>CINEMATIC</button>
              <button className={turbo ? "active" : ""} onClick={() => setTurbo(true)}>TURBO</button>
            </div>
            <label className="console-label">TOTAL STAKE <b>{(bet / SLOT_LINE_COUNT).toFixed(2)} / LINE</b></label>
            <div className="roulette-stake">
              <button onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}>½</button>
              <div><input aria-label="Total stake" type="number" min={wager.minStake} max={Math.min(wager.maxStake, bank)} value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} /><span>SOL</span></div>
              <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
            </div>
            <div className="roulette-quick-stakes">{[9, 18, 45, 90].map((value) => <button key={value} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}</div>
            <div className="roulette-receipt">
              <p><span>Reels</span><b>5 × 40 STOPS</b></p>
              <p><span>Window</span><b>5 × 3 / 9 LINES</b></p>
              <p><span>Return</span><b>96.03% THEORETICAL</b></p>
              <p><span>Foundation</span><b>KRYSITS + JOHAKR / MIT</b></p>
            </div>
            <button className="roulette-spin-button vault-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={() => void play()}>
              {pending ? "SPINNING…" : `SPIN ${bet.toFixed(2)} SOL`}
            </button>
            <small className="vault-space-hint">PRESS SPACE TO SPIN · RESULTS SETTLE ON THE SERVER</small>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="vault-details-grid">
          <article className="vault-paytable-panel">
            <header><div><span>PAYTABLE</span><h2>Left to right. Wild substitutes.</h2></div><b>LINE BET MULTIPLIERS</b></header>
            <div className="vault-paytable-list">
              {(Object.entries(SLOT_PAYTABLE) as Array<[Exclude<SlotSymbol, "VAULT">, readonly number[]]>).map(([symbol, payouts]) => (
                <div key={symbol}>
                  <SymbolFace symbol={symbol} winning={false} />
                  <b>{symbol}</b>
                  <span><small>3</small>{payouts[3]}×</span>
                  <span><small>4</small>{payouts[4]}×</span>
                  <span><small>5</small>{payouts[5]}×</span>
                </div>
              ))}
              <div className="scatter-pay-row">
                <SymbolFace symbol="VAULT" winning={false} />
                <b>VAULT SCATTER</b>
                <span><small>3</small>5×</span><span><small>4</small>25×</span><span><small>5</small>100×</span>
              </div>
            </div>
          </article>

          <article className="vault-history-panel">
            <header><div><span>SESSION TAPE</span><h2>Recent verified spins</h2></div><b>{history.length} SHOWN</b></header>
            <div className="vault-spin-history">
              {history.length ? history.map((spin) => (
                <div key={spin.roundId}>
                  <span className={spin.payout ? "win" : ""}>{spin.payout ? "WIN" : "SPIN"}</span>
                  <b>{spin.multiplier.toFixed(2)}×</b>
                  <small>{spin.lineWins.length} lines · {spin.scatterCount} vaults</small>
                  <code>{spin.roundId.slice(0, 8)}</code>
                </div>
              )) : <p>Spin results will appear here with their persisted round identifier.</p>}
            </div>
          </article>
        </section>

        <section className="fairness-panel vault-fairness">
          <header><div><span>ROUND PROOF</span><h2>{result ? "Five stops revealed. Every symbol can be reconstructed." : "Server hash first. Reel stops after settlement."}</h2></div><b>{result ? "REPLAYABLE" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{result?.proof.serverHash ?? "Committed before the spin"}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? "Generated by your browser"}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Revealed after settlement"}</code></p>
            <p><span>REEL STOPS</span><code>{result?.stops.join(" · ") ?? "Five integers from 0 through 39"}</code></p>
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
