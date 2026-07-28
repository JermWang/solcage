"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import { VIDEO_POKER_PAYTABLE } from "@/lib/games/videoPoker";
import type { PlayingCard } from "@/lib/games/blackjack";
import { clampStake, useWager } from "@/lib/useWager";
import { GameHints } from "@/components/GameHints";

type PokerProof = {
  algorithm: string;
  shuffle: string;
  serverHash: string;
  serverSeed: string;
  clientSeed: string;
  deckSize: number;
  entropyCount: number;
};

type PokerRound = {
  roundId: string;
  phase: "holding" | "settled";
  bet: number;
  initial: PlayingCard[];
  hand: PlayingCard[];
  holdMask: number;
  replacements: number | null;
  rank: string | null;
  handName: string | null;
  multiplier: number | null;
  paytableIndex: number | null;
  outcome: "win" | "loss" | null;
  payout: number | null;
  serverHash: string;
  proof: PokerProof | null;
  points: number;
};

const suitGlyph: Record<PlayingCard["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function freshSeed() {
  return `draw:${crypto.randomUUID()}`;
}

export default function VideoPokerPage() {
  const wager = useWager();
  const bank = wager.balance;
  const [points, setPoints] = useState(0);
  const [bet, setBet] = useState(0.01);
  const [clientSeed, setClientSeed] = useState("draw:solcage-player");
  const [round, setRound] = useState<PokerRound | null>(null);
  const [holdMask, setHoldMask] = useState(0);
  const [pending, setPending] = useState(false);
  const [commitment, setCommitment] = useState("");
  const [history, setHistory] = useState<PokerRound[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
      .then((profile) => setPoints(Number(profile.points) || 0))
      .catch(() => undefined);
  }, []);

  const deal = useCallback(async () => {
    if (pending || round?.phase === "holding" || bet > bank || bet <= 0) return;
    setPending(true);
    setError("");
    setRound(null);
    setHoldMask(0);
    try {
      const committed = await fetch("/api/games/fair/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "video-poker" }),
      }).then((response) => response.json());
      if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit the deck");
      setCommitment(committed.serverHash);

      const dealt = await fetch("/api/games/video-poker/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: committed.roundId,
          action: "deal",
          bet,
          clientSeed,
        }),
      }).then((response) => response.json()) as PokerRound & { error?: string };
      if (dealt.phase !== "holding" || dealt.hand?.length !== 5) {
        throw new Error(dealt.error ?? "Unable to deal the hand");
      }
      void wager.refresh();
      setRound(dealt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video Poker deal failed");
    } finally {
      setPending(false);
    }
  }, [bank, bet, clientSeed, pending, round?.phase, wager]);

  const draw = useCallback(async () => {
    if (pending || round?.phase !== "holding") return;
    setPending(true);
    setError("");
    try {
      const settled = await fetch("/api/games/video-poker/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: round.roundId,
          action: "draw",
          holdMask,
        }),
      }).then((response) => response.json()) as PokerRound & { error?: string };
      if (settled.phase !== "settled" || !settled.proof) {
        throw new Error(settled.error ?? "Unable to settle the draw");
      }
      void wager.refresh();
      setPoints(settled.points);
      setRound(settled);
      setHistory((current) => [settled, ...current].slice(0, 20));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video Poker draw failed");
    } finally {
      setPending(false);
    }
  }, [holdMask, pending, round, wager]);

  const toggleHold = useCallback((index: number) => {
    if (round?.phase !== "holding" || pending) return;
    setHoldMask((mask) => mask ^ (1 << index));
  }, [pending, round?.phase]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (/^[1-5]$/.test(event.key) && round?.phase === "holding") {
        event.preventDefault();
        toggleHold(Number(event.key) - 1);
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (round?.phase === "holding") void draw();
        else void deal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deal, draw, round?.phase, toggleHold]);

  const cards = round?.hand ?? [];
  const activePayline = round?.paytableIndex ?? -1;

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room video-poker-page">
        <header className="game-room-header">
          <div>
            <Link href="/games">&larr; Casino</Link>
            <span>9/6 JACKS OR BETTER / HMAC SHUFFLE</span>
            <h1>Neon Draw</h1>
          </div>
          <div className="baccarat-header-stats">
            <p><span>MACHINE BALANCE</span><b>{bank.toFixed(2)} SOL</b></p>
            <p><span>LOYALTY SCORE</span><b>{points.toLocaleString()} XP</b></p>
          </div>
        </header>
        <GameHints game="video-poker" />

        <section className="video-poker-machine">
          <div className="video-poker-marquee">
            <span>SC</span>
            <div><small>FULL PAY / MAX COIN</small><h2>NEON DRAW</h2></div>
            <b>99.54%<small>OPTIMAL RTP</small></b>
          </div>

          <div className="video-poker-paytable" aria-label="Jacks or Better paytable">
            {VIDEO_POKER_PAYTABLE.map((entry, index) => (
              <div className={activePayline === index ? "active" : ""} key={entry.rank}>
                <span>{entry.name.toUpperCase()}</span>
                <b>{entry.multiplier}×</b>
              </div>
            ))}
          </div>

          <div className={`video-poker-screen ${pending ? "dealing" : ""}`}>
            <div className="video-poker-status">
              <span className="verified-badge"><i /> COMMITTED DECK</span>
              <b>
                {pending ? "MACHINE WORKING" : round?.phase === "holding"
                  ? "SELECT CARDS TO HOLD"
                  : round?.phase === "settled"
                    ? round.handName?.toUpperCase()
                    : "INSERT STAKE TO PLAY"}
              </b>
              <small>{round?.phase === "holding" ? "KEYS 1—5 TO HOLD / SPACE TO DRAW" : "SPACE TO DEAL"}</small>
            </div>

            <div className="video-poker-cards">
              {(cards.length ? cards : Array.from({ length: 5 }, () => null)).map((card, index) => {
                const held = Boolean(holdMask & (1 << index));
                const red = card?.suit === "hearts" || card?.suit === "diamonds";
                return (
                  <button
                    aria-label={card ? `${held ? "Release" : "Hold"} ${card.rank} of ${card.suit}` : `Card position ${index + 1}`}
                    className={`video-poker-card ${held ? "held" : ""} ${red ? "red" : ""} ${card ? "" : "empty"}`}
                    disabled={!card || round?.phase !== "holding" || pending}
                    key={`${round?.roundId ?? "empty"}-${index}`}
                    onClick={() => toggleHold(index)}
                  >
                    {card ? (
                      <>
                        <span className="hold-lamp">{held ? "HELD" : `HOLD ${index + 1}`}</span>
                        <i><b>{card.rank}</b><small>{suitGlyph[card.suit]}</small><strong>{suitGlyph[card.suit]}</strong></i>
                      </>
                    ) : <i className="card-back"><b>SC</b></i>}
                  </button>
                );
              })}
            </div>

            {round?.phase === "settled" && (
              <div className={`video-poker-win ${round.outcome}`}>
                <span>{round.handName}</span>
                <b>{round.outcome === "win" ? `+${round.payout?.toFixed(2)} SOL` : "NO WIN"}</b>
              </div>
            )}
          </div>

          <div className="video-poker-controls">
            <div className="video-poker-bet">
              <span>BET PER HAND</span>
              <div>
                <button onClick={() => setBet(clampStake(bet / 2, wager))}>½</button>
                <label><input aria-label="Stake amount" type="number" min="0.01" max="100000" step="0.01" value={bet} onChange={(event) => setBet(clampStake(Number(event.target.value), wager))} disabled={round?.phase === "holding"} /><small>SOL</small></label>
                <button onClick={() => setBet(clampStake(bet * 2, wager))}>2×</button>
              </div>
            </div>

            <div className="video-poker-quick">
              {[0.01, 0.05, 0.1, 0.25].map((value) => <button key={value} disabled={round?.phase === "holding"} onClick={() => setBet(clampStake(value, wager))}>{value}</button>)}
            </div>

            <button
              className="video-poker-action"
              disabled={pending || (round?.phase === "holding" ? false : bet > bank || bank <= 0 || clientSeed.length < 8)}
              onClick={round?.phase === "holding" ? draw : deal}
            >
              <span>{pending ? "PLEASE WAIT" : round?.phase === "holding" ? "DRAW" : "DEAL"}</span>
              <small>{round?.phase === "holding" ? `${holdMask.toString(2).split("1").length - 1} HELD` : `${bet.toFixed(2)} SOL`}</small>
            </button>

            <div className="video-poker-meter">
              <span>WIN</span>
              <b>{round?.phase === "settled" ? (round.payout ?? 0).toFixed(2) : "0.00"}</b>
            </div>
          </div>
          {error && <p className="roulette-error video-poker-error">{error}</p>}
        </section>

        <section className="video-poker-lower">
          <article className="video-poker-ledger">
            <header><div><span>SESSION LEDGER</span><h2>Verified hands</h2></div><b>{history.length} SETTLED</b></header>
            <div>
              {history.length ? history.slice(0, 7).map((hand) => (
                <button key={hand.roundId} onClick={() => { setRound(hand); setHoldMask(hand.holdMask); }}>
                  <span>{hand.roundId.slice(0, 8).toUpperCase()}</span>
                  <b>{hand.handName?.toUpperCase()}</b>
                  <span>{hand.bet.toFixed(2)} BET</span>
                  <strong className={hand.outcome ?? ""}>{(hand.payout ?? 0).toFixed(2)}</strong>
                </button>
              )) : <p>Complete a draw to open the machine ledger.</p>}
            </div>
          </article>

          <article className="video-poker-proof">
            <span>DECK PROOF</span>
            <h2>{round?.proof ? "The complete draw is replayable." : commitment ? "Hash committed. Seed hidden." : "Commit comes before the deal."}</h2>
            <dl>
              <div><dt>SERVER HASH</dt><dd>{round?.serverHash || commitment || "Generated before every hand"}</dd></div>
              <div><dt>CLIENT SEED</dt><dd>{round?.proof?.clientSeed ?? clientSeed}</dd></div>
              <div><dt>SERVER SEED</dt><dd>{round?.proof?.serverSeed ?? "Hidden until draw settlement"}</dd></div>
              <div><dt>SHUFFLE</dt><dd>HMAC-SHA256 / FISHER-YATES / 52 CARDS</dd></div>
            </dl>
            <div className="baccarat-seed">
              <input aria-label="Client seed" value={clientSeed} disabled={round?.phase === "holding"} onChange={(event) => setClientSeed(event.target.value)} />
              <button aria-label="Generate client seed" disabled={round?.phase === "holding"} onClick={() => setClientSeed(freshSeed())}>&#8635;</button>
            </div>
          </article>
        </section>
      </div>
    </CasinoChrome>
  );
}
