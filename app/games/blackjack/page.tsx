"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type Card = { rank: string; suit: "hearts" | "diamonds" | "clubs" | "spades" };
type BlackjackState = {
  roundId: string;
  phase: "playing" | "settled";
  stake: number;
  doubledDown: boolean;
  canDouble: boolean;
  player: Card[];
  playerValue: number;
  dealer: Array<Card | null>;
  dealerValue: number;
  outcome: "win" | "loss" | "push" | null;
  payout: number | null;
  label: string | null;
  proof: null | {
    serverHash: string;
    serverSeed: string;
    clientSeed: string;
  };
};

const suitGlyph: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export default function BlackjackPage() {
  const [bank, setBank] = useState(1000);
  const [bet, setBet] = useState(25);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [commitment, setCommitment] = useState("");
  const [error, setError] = useState("");

  async function requestAction(action: "deal" | "hit" | "stand" | "double") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      let roundId = state?.roundId;
      let clientSeed: string | undefined;
      if (action === "deal") {
        if (bet > bank || bank <= 0) return;
        const committed = await fetch("/api/games/fair/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game: "blackjack" }),
        }).then((response) => response.json());
        if (!committed.roundId) throw new Error(committed.error ?? "Unable to commit deal");
        roundId = committed.roundId;
        clientSeed = `solcage:${crypto.randomUUID()}`;
        setCommitment(committed.serverHash);
      }
      if (!roundId) throw new Error("Start a new hand");
      const next = await fetch("/api/games/blackjack/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId, action, bet, clientSeed }),
      }).then((response) => response.json()) as BlackjackState & { error?: string };
      if (!next.roundId) throw new Error(next.error ?? "Blackjack action failed");
      if (action === "deal") setBank((value) => Math.max(0, value - bet));
      if (action === "double") setBank((value) => Math.max(0, value - (state?.stake ?? bet)));
      if (next.phase === "settled") setBank((value) => value + (next.payout ?? 0));
      setState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Blackjack action failed");
    } finally {
      setPending(false);
    }
  }

  function newHand() {
    setState(null);
    setCommitment("");
    setError("");
  }

  return (
    <CasinoChrome active="casino">
      <div className="casino-game-room blackjack-page">
        <header className="game-room-header">
          <div><Link href="/games">← Casino</Link><span>BLACKJACK PARTY FOUNDATION / VERIFIED SHOE</span><h1>Cage Blackjack</h1></div>
          <div className="game-room-balance"><span>PRACTICE TABLE BALANCE</span><b>{bank.toFixed(2)} CHIPS</b></div>
        </header>

        <section className="blackjack-room">
          <div className="blackjack-table">
            <span className="verified-badge"><i /> COMMITTED SHOE</span>
            <div className="table-rule">BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17</div>
            <div className="blackjack-table-lettering"><b>HOUSE TABLE</b><span>Dealer must draw to 16 and stand on all 17s</span></div>
            <Hand label="DEALER" cards={state?.dealer ?? []} value={state?.dealerValue ?? 0} />
            <div className="blackjack-mark"><span>SC</span><small>BLACKJACK</small></div>
            <Hand label="PLAYER" cards={state?.player ?? []} value={state?.playerValue ?? 0} />
            <div className="blackjack-seat"><i /><span>ACTIVE SEAT</span><b>YOU</b></div>
            {state?.phase === "settled" && <div className={`blackjack-outcome ${state.outcome}`}><span>{state.label}</span><b>{state.payout ? `+${state.payout.toFixed(2)} CHIPS` : "NO PAYOUT"}</b></div>}
          </div>

          <aside className="roulette-console blackjack-console">
            <div className="console-title"><span>TABLE CONTROL</span><small>SINGLE HAND</small></div>
            {!state && <>
              <label className="console-label">STAKE</label>
              <div className="roulette-stake">
                <button onClick={() => setBet(Math.max(1, bet / 2))}>½</button>
                <div><input aria-label="Stake amount" type="number" min="1" max={bank} value={bet} onChange={(event) => setBet(Math.max(1, Number(event.target.value)))} /><span>CHIPS</span></div>
                <button onClick={() => setBet(Math.min(bank, bet * 2))}>2×</button>
              </div>
              <div className="roulette-quick-stakes">{[5, 25, 50, 100].map((value) => <button key={value} onClick={() => setBet(Math.min(bank, value))}>{value}</button>)}</div>
            </>}
            <div className="roulette-receipt">
              <p><span>Player hand</span><b>{state?.playerValue ?? "—"}</b></p>
              <p><span>Dealer showing</span><b>{state?.dealerValue ?? "—"}</b></p>
              <p><span>Natural blackjack</span><b>2.50× RETURN</b></p>
              <p><span>Shoe</span><b>HMAC SHUFFLED</b></p>
            </div>
            {!state && <button className="roulette-spin-button" disabled={pending || bet > bank || bank <= 0} onClick={() => requestAction("deal")}>{pending ? "DEALING…" : `DEAL ${bet.toFixed(2)} CHIPS`}</button>}
            <div className="blackjack-status"><span>TABLE STATUS</span><b>{pending ? "DEALER IS ACTING" : !state ? "PLACE YOUR STAKE" : state.phase === "settled" ? state.label : state.canDouble ? "HIT, STAND, OR DOUBLE" : "HIT OR STAND"}</b><small>{state?.phase === "playing" ? (state.playerValue <= 11 ? "Drawing cannot bust this hand." : state.playerValue >= 17 ? "Standing is often the conservative play." : "Weigh the dealer up-card before acting.") : "Single-hand practice table; no insurance, split, or surrender."}</small></div>
            {state?.phase === "playing" && <div className={`blackjack-actions ${state.canDouble && bank >= state.stake ? "has-double" : ""}`}><button disabled={pending} onClick={() => requestAction("hit")}>HIT</button><button disabled={pending} onClick={() => requestAction("stand")}>STAND</button>{state.canDouble && bank >= state.stake && <button className="blackjack-double" disabled={pending} onClick={() => requestAction("double")}>DOUBLE <small>+{state.stake.toFixed(2)}</small></button>}</div>}
            {state?.phase === "settled" && <button className="roulette-spin-button" onClick={newHand}>NEW HAND</button>}
            {error && <p className="roulette-error">{error}</p>}
          </aside>
        </section>

        <section className="fairness-panel">
          <header><div><span>SHOE PROOF</span><h2>{state?.proof ? "Every card in the shoe is reproducible." : "The shoe is committed before the deal."}</h2></div><b>{state?.proof ? "REVEALED" : commitment ? "COMMITTED" : "READY"}</b></header>
          <div className="fairness-grid">
            <p><span>SERVER HASH</span><code>{(state?.proof?.serverHash ?? commitment) || "Generated before the deal"}</code></p>
            <p><span>CLIENT SEED</span><code>{state?.proof?.clientSeed ?? "Supplied after commitment"}</code></p>
            <p><span>SERVER SEED</span><code>{state?.proof?.serverSeed ?? "Hidden until the hand settles"}</code></p>
            <p><span>SHUFFLE</span><code>HMAC-SHA256 / FISHER-YATES</code></p>
          </div>
          <small>The server commits first, your browser supplies the client seed, and the full seed is revealed only after the hand ends—so hidden dealer cards cannot be predicted mid-hand.</small>
        </section>
      </div>
    </CasinoChrome>
  );
}

function Hand({ label, cards, value }: { label: string; cards: Array<Card | null>; value: number }) {
  return (
    <div className={`blackjack-hand ${label.toLowerCase()}`}>
      <header><span>{label}</span><b>{cards.length ? value : "—"}</b></header>
      <div>
        {cards.length ? cards.map((card, index) => card
          ? <PlayingCardView card={card} index={index} key={`${card.suit}-${card.rank}-${index}`} />
          : <span className="playing-card card-back" key={`hidden-${index}`}><i>SC</i></span>)
          : <span className="empty-hand">AWAITING DEAL</span>}
      </div>
    </div>
  );
}

function PlayingCardView({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={`playing-card ${red ? "red" : ""}`} style={{ "--card-index": index } as CSSProperties}>
      <b>{card.rank}</b><i>{suitGlyph[card.suit]}</i><strong>{suitGlyph[card.suit]}</strong>
    </span>
  );
}
