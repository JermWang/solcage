"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type LobbyGame = {
  name: string;
  studio: string;
  tag: string;
  image: string;
  href?: string;
  tone: string;
};

const games: LobbyGame[] = [
  { name: "Cage Roulette", studio: "SOLCAGE ORIGINALS", tag: "VERIFIABLE", image: "/game-art/roulette.webp", href: "/games/roulette", tone: "violet" },
  { name: "Neon Dice", studio: "SOLCAGE ORIGINALS", tag: "HMAC-SHA256", image: "/game-art/dice.webp", href: "/games/play?game=dice", tone: "lime" },
  { name: "Cage Slots", studio: "PROVABLE.IO ENGINE", tag: "MIT FOUNDATION", image: "/og.png", href: "/games/play?game=slots", tone: "gold" },
  { name: "Crystal Mines", studio: "SOLCAGE ORIGINALS", tag: "TABLE PAUSED", image: "/game-art/mines.webp", tone: "cyan" },
  { name: "Private Roulette", studio: "HIGH LIMIT", tag: "EUROPEAN", image: "/game-art/roulette.webp", href: "/games/roulette", tone: "red" },
  { name: "Turbo Dice", studio: "SOLCAGE ORIGINALS", tag: "98% RTP", image: "/game-art/dice.webp", href: "/games/play?game=dice", tone: "purple" },
];

const categories = ["Lobby", "Originals", "Table games", "Instant", "High limit", "All games"];

export default function GamesLobby() {
  const [category, setCategory] = useState("Lobby");
  const [activity, setActivity] = useState<Array<{ player: string; game: string; payout: number }>>([]);

  useEffect(() => {
    fetch("/api/games/activity")
      .then((response) => response.json())
      .then((data) => setActivity(Array.isArray(data.activity) ? data.activity : []))
      .catch(() => undefined);
  }, []);

  const visibleGames = useMemo(() => {
    if (category === "Originals") return games.filter((game) => game.studio.includes("ORIGINALS"));
    if (category === "Table games") return games.filter((game) => game.name.includes("Roulette"));
    if (category === "High limit") return games.filter((game) => game.name.includes("Private"));
    return games;
  }, [category]);

  return (
    <CasinoChrome active="casino">
      <div className="casino-content">
        <section className="casino-promo-grid">
          <article className="casino-primary-promo">
            <div>
              <span className="live-pill"><i /> SOLCAGE ORIGINALS</span>
              <h1>Provably fair.<br /><em>Visibly Solana.</em></h1>
              <p>Casino-grade game presentation with committed server seeds, player-controlled client seeds, and independently reproducible outcomes.</p>
              <div><Link href="/games/roulette">Play roulette</Link><Link href="/lending">Fund with collateral</Link></div>
            </div>
            <div className="promo-wheel" aria-hidden="true"><i /><i /><i /><b>SC</b></div>
          </article>
          <article className="casino-mini-promo race">
            <span>WEEKLY LOYALTY RACE</span>
            <h2>Play. Borrow.<br />Climb.</h2>
            <p>Verified activity powers the global points board.</p>
            <Link href="/leaderboard">Open standings ↗</Link>
          </article>
          <article className="casino-mini-promo credit">
            <span>MEMECOIN CREDIT</span>
            <h2>Keep the bag.<br />Open the floor.</h2>
            <p>Dedicated collateral positions and account history.</p>
            <Link href="/lending">Enter lending ↗</Link>
          </article>
        </section>

        <section className="casino-live-strip">
          <b><i /> LIVE ACTIVITY</b>
          <div>
            {(activity.length ? activity : [
              { player: "The floor", game: "is open", payout: 0 },
              { player: "Verified", game: "HMAC-SHA256 rounds", payout: 0 },
              { player: "Rewards", game: "loyalty active", payout: 0 },
            ]).map((item, index) => (
              <span key={`${item.player}-${index}`}><strong>{item.player}</strong>{item.game}{item.payout > 0 && <b>+{item.payout.toFixed(2)}</b>}</span>
            ))}
          </div>
        </section>

        <nav className="casino-categories" aria-label="Game categories">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
        </nav>

        <section className="casino-game-section">
          <header><div><span>CASINO</span><h2>{category === "Lobby" ? "Trending on the floor" : category}</h2></div><small>{visibleGames.filter((game) => game.href).length} OPEN TABLES</small></header>
          <div className="casino-game-grid">
            {visibleGames.map((game, index) => {
              const content = <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={game.image} alt="" />
                <span className="game-card-shade" />
                <span className="game-card-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="game-card-tag">{game.tag}</span>
                <span className="game-card-play">{game.href ? "▶" : "—"}</span>
                <footer><small>{game.studio}</small><b>{game.name}</b></footer>
              </>;
              return game.href
                ? <Link className={`casino-game-card ${game.tone}`} href={game.href} key={game.name}>{content}</Link>
                : <article className={`casino-game-card is-closed ${game.tone}`} key={game.name}>{content}</article>;
            })}
          </div>
        </section>

        <section className="casino-integrity">
          <div><span>OPEN-SOURCE FOUNDATION</span><h2>Built on code we can inspect.</h2></div>
          <p>The roulette presentation uses the MIT-licensed React Casino Roulette foundation. Outcomes are generated server-side with the MIT-licensed Provable.IO HMAC-SHA256 engine and stored alongside their verification proof.</p>
          <Link href="/games/roulette">Verify a round ↗</Link>
        </section>
      </div>
    </CasinoChrome>
  );
}
