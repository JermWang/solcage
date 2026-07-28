"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import type { BaccaratOutcome, BaccaratSelection, BaccaratWinner } from "@/lib/games/baccarat";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";

type Card = { rank: string; suit: "hearts" | "diamonds" | "clubs" | "spades" };
type BaccaratProof = {
  algorithm: string;
  shuffle: string;
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  deckCount: number;
  shoeSize: number;
  entropyCount: number;
};
type BaccaratResult = {
  roundId: string;
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  natural: boolean;
  playerDrewThird: boolean;
  bankerDrewThird: boolean;
  cardsDealt: number;
  bet: number;
  selection: BaccaratSelection;
  outcome: BaccaratOutcome;
  payout: number;
  label: string;
  returnMultiplier: number;
  proof: BaccaratProof;
  points: number;
};

const suitGlyph: Record<Card["suit"], string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const betOptions: Array<{
  id: BaccaratSelection;
  label: string;
  returnLabel: string;
  detail: string;
}> = [
  { id: "player", label: "PLAYER", returnLabel: "2.00x", detail: "Pays 1:1" },
  { id: "tie", label: "TIE", returnLabel: "9.00x", detail: "Pays 8:1" },
  { id: "banker", label: "BANKER", returnLabel: "1.95x", detail: "5% commission" },
];

function freshSeed() {
  return `baccarat:${crypto.randomUUID()}`;
}

export default function BaccaratPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [points, setPoints] = useState(0);
  const [bet, setBet] = useState(0.01);
  const [selection, setSelection] = useState<BaccaratSelection>("banker");
  const [clientSeed, setClientSeed] = useState("baccarat:solcage-player");
  const [pending, setPending] = useState(false);
  const [commitment, setCommitment] = useState("");
  const [result, setResult] = useState<BaccaratResult | null>(null);
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
      .then((profile) => setPoints(Number(profile.points) || 0))
      .catch(() => undefined);
  }, []);

  async function deal() {
    if (pending || bet > bank || bet <= 0) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "baccarat" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit the shoe");
      setCommitment(committed.serverHash);

      const settled = await fetch("/api/games/baccarat/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          clientSeed,
          bet,
          selection,
        }),
      }).then((response) => response.json()) as BaccaratResult & { error?: string };
      if (!settled.proof) throw new Error(settled.error ?? "Unable to settle the hand");

      void wager.refresh();
      setPoints(settled.points);
      setResult(settled);
      setHistory((current) => [settled, ...current].slice(0, 24));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Baccarat hand failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room baccarat-page">
        <header className="game-room-header">
          <div>
            <Link href="/games">&larr; Casino</Link>
            <span>EIGHT-DECK PUNTO BANCO / PROVABLY FAIR</span>
            <h1>Cage Baccarat</h1>
          </div>
          <div className="baccarat-header-stats">
            <p><span>YOUR BALANCE</span><b>{bank.toFixed(2)} SOL</b></p>
            <p><span>LOYALTY SCORE</span><b>{points.toLocaleString()} XP</b></p>
          </div>
        </header>
        <GameHints game="baccarat" />

        <section className="baccarat-room">
          <div className={`baccarat-table ${pending ? "dealing" : ""} ${result?.winner ?? ""}`}>
            <div className="baccarat-table-topline">
              <span className="verified-badge"><i /> COMMITTED SHOE</span>
              <b>MIN 0.01 &middot; MAX 100K</b>
            </div>

            <div className="baccarat-road" aria-label="Session result road">
              <span>BEAD ROAD</span>
              <div>
                {history.length
                  ? history.slice(0, 18).reverse().map((hand) => (
                    <i className={hand.winner} key={hand.roundId}>
                      {hand.winner === "player" ? "P" : hand.winner === "banker" ? "B" : "T"}
                    </i>
                  ))
                  : <small>THE TABLE IS OPEN</small>}
              </div>
            </div>

            <BaccaratHand
              side="player"
              cards={result?.player ?? []}
              total={result?.playerTotal}
              winner={result?.winner === "player"}
              pending={pending}
            />
            <div className="baccarat-center-mark">
              <span>SC</span>
              <b>PUNTO BANCO</b>
              <small>EIGHT DECK / HMAC SHOE</small>
            </div>
            <BaccaratHand
              side="banker"
              cards={result?.banker ?? []}
              total={result?.bankerTotal}
              winner={result?.winner === "banker"}
              pending={pending}
            />

            <div className="baccarat-bet-zones" aria-hidden="true">
              <span className="player">PLAYER <b>1 : 1</b></span>
              <span className="tie">TIE <b>8 : 1</b></span>
              <span className="banker">BANKER <b>0.95 : 1</b></span>
            </div>

            {result && (
              <div className={`baccarat-outcome ${result.outcome}`}>
                <small>{result.natural ? "NATURAL" : `${result.cardsDealt} CARDS`}</small>
                <span>{result.label}</span>
                <b>{result.outcome === "loss" ? "ROUND SETTLED" : `+${result.payout.toFixed(2)} SOL`}</b>
              </div>
            )}
          </div>

          <aside className="roulette-console baccarat-console">
            <div className="console-title"><span>BET SLIP</span><small>BACCARAT</small></div>

            <label className="console-label">BET ON</label>
            <div className="baccarat-picks">
              {betOptions.map((option) => (
                <button
                  className={`${option.id} ${selection === option.id ? "active" : ""}`}
                  key={option.id}
                  onClick={() => setSelection(option.id)}
                >
                  <span>{option.label}</span>
                  <b>{option.returnLabel}</b>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>

            <label className="console-label">STAKE</label>
            <div className="roulette-stake">
              <button onClick={() => setBet(clampStake(bet / 2, wager))}>1/2</button>
              <div>
                <input
                  aria-label="Stake amount"
                  type="number"
                  min="0.01"
                  max="100000"
                  step="0.01"
                  value={bet}
                  onChange={(event) => setBet(clampStake(Number(event.target.value), wager))}
                />
                <span>SOL</span>
              </div>
              <button onClick={() => setBet(clampStake(bet * 2, wager))}>2x</button>
            </div>
            <div className="roulette-quick-stakes">
              {[0.01, 0.05, 0.1, 0.25].map((value) => <button key={value} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}
            </div>

            <label className="console-label">CLIENT SEED</label>
            <div className="baccarat-seed">
              <input
                aria-label="Client seed"
                value={clientSeed}
                onChange={(event) => setClientSeed(event.target.value)}
              />
              <button aria-label="Generate client seed" onClick={() => setClientSeed(freshSeed())}>&#8635;</button>
            </div>

            <div className="roulette-receipt baccarat-receipt">
              <p><span>Selection</span><b>{selection.toUpperCase()}</b></p>
              <p><span>Total return</span><b>{betOptions.find((item) => item.id === selection)?.returnLabel}</b></p>
              <p><span>Player / Banker tie</span><b>STAKE RETURNS</b></p>
              <p><span>Shoe</span><b>8 DECKS / 416 CARDS</b></p>
            </div>

            <button
              className="roulette-spin-button baccarat-deal-button"
              disabled={pending || bet > bank || bank <= 0 || clientSeed.length < 8}
              onClick={deal}
            >
              {pending ? "DEALING..." : `DEAL ${bet.toFixed(2)} ON ${selection.toUpperCase()}`}
            </button>
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="baccarat-lower">
          <article className="baccarat-ledger">
            <header><div><span>SESSION TABLE</span><h2>Last hands</h2></div><b>{history.length} VERIFIED</b></header>
            <div className="baccarat-ledger-head"><span>HAND</span><span>BET</span><span>SCORE</span><span>RESULT</span><span>RETURN</span></div>
            <div>
              {history.length ? history.slice(0, 8).map((hand) => (
                <button key={hand.roundId} onClick={() => setResult(hand)}>
                  <span>{hand.roundId.slice(0, 8).toUpperCase()}</span>
                  <span>{hand.bet.toFixed(2)} {hand.selection.toUpperCase()}</span>
                  <b>{hand.playerTotal} - {hand.bankerTotal}</b>
                  <strong className={hand.winner}>{hand.winner.toUpperCase()}</strong>
                  <em className={hand.outcome}>{hand.payout.toFixed(2)}</em>
                </button>
              )) : <p>Place a wager to open the session road and verification ledger.</p>}
            </div>
          </article>

          <article className="baccarat-rules">
            <span>TABLE RULES</span>
            <h2>Punto Banco</h2>
            <p>The shoe deals automatically. Naturals stop at eight or nine; all third-card decisions follow the fixed table rules.</p>
            <dl>
              <div><dt>PLAYER</dt><dd>1:1</dd></div>
              <div><dt>BANKER</dt><dd>0.95:1</dd></div>
              <div><dt>TIE</dt><dd>8:1</dd></div>
              <div><dt>PLAYER / BANKER ON TIE</dt><dd>PUSH</dd></div>
            </dl>
          </article>
        </section>

        <section className="fairness-panel baccarat-fairness">
          <header>
            <div><span>SHOE PROOF</span><h2>{result ? "This hand can be replayed card for card." : "Server commitment lands before your seed."}</h2></div>
            <b>{result ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b>
          </header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{result?.proof.serverHash ?? (commitment || "Generated before the wager")}</code></p>
            <p><span>CLIENT SEED</span><code>{result?.proof.clientSeed ?? clientSeed}</code></p>
            <p><span>SERVER SEED</span><code>{result?.proof.serverSeed ?? "Hidden until settlement"}</code></p>
            <p><span>SHUFFLE</span><code>HMAC-SHA256 / FISHER-YATES / 416 CARDS</code></p>
          </div>
          <small>The server stores its SHA-256 commitment first. Your client seed then deterministically shuffles the eight-deck shoe; the server seed is revealed with the settled hand and stored receipt.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}

function BaccaratHand({
  side,
  cards,
  total,
  winner,
  pending,
}: {
  side: "player" | "banker";
  cards: Card[];
  total?: number;
  winner: boolean;
  pending: boolean;
}) {
  return (
    <div className={`baccarat-hand ${side} ${winner ? "winner" : ""}`}>
      <header>
        <span>{side.toUpperCase()}</span>
        <b>{cards.length ? total : "--"}</b>
      </header>
      <div>
        {pending
          ? [0, 1].map((index) => <i className="playing-card card-back baccarat-card-back" key={index}><small>SC</small></i>)
          : cards.length
            ? cards.map((card, index) => <PlayingCardView card={card} index={index} key={`${card.suit}-${card.rank}-${index}`} />)
            : <span className="baccarat-empty">AWAITING DEAL</span>}
      </div>
    </div>
  );
}

function PlayingCardView({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <i className={`playing-card baccarat-card ${red ? "red" : ""}`} style={{ "--card-index": index } as CSSProperties}>
      <b>{card.rank}</b>
      <small>{suitGlyph[card.suit]}</small>
      <strong>{suitGlyph[card.suit]}</strong>
    </i>
  );
}
