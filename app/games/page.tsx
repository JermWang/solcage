"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type LobbyGame = {
  name: string;
  studio: string;
  tag: string;
  image: string;
  href: string;
  tone: string;
  categories: string[];
};

const games: LobbyGame[] = [
  { name: "Cage Roulette", studio: "SOLCAGE ORIGINALS", tag: "TRENDING", image: "/game-art/roulette.webp", href: "/games/roulette", tone: "violet", categories: ["Originals", "Table games", "High limit"] },
  { name: "Cage Baccarat", studio: "N. ADLAKHA + BLACKJACK PARTY", tag: "NEW TABLE", image: "/game-art/baccarat.webp", href: "/games/baccarat", tone: "gold", categories: ["Originals", "Table games", "High limit"] },
  { name: "Neon Dice", studio: "JDLEO DICE FOUNDATION", tag: "98% RTP", image: "/game-art/dice.webp", href: "/games/dice", tone: "lime", categories: ["Originals", "Instant"] },
  { name: "Neon Vault", studio: "KRYSITS + JOHAKR FOUNDATION", tag: "96.03% RTP", image: "/game-art/slots.webp", href: "/games/slots", tone: "gold", categories: ["Originals", "Slots", "Instant", "High limit"] },
  { name: "Neon Plinko", studio: "PLINKO.RNG FOUNDATION", tag: "98% RTP", image: "/game-art/plinko.webp", href: "/games/plinko", tone: "cyan", categories: ["Originals", "Instant"] },
  { name: "Cage Blackjack", studio: "BLACKJACK PARTY FOUNDATION", tag: "3:2 TABLE", image: "/game-art/blackjack.webp", href: "/games/blackjack", tone: "red", categories: ["Originals", "Table games", "High limit"] },
  { name: "Crystal Mines", studio: "MINES CASINO FOUNDATION", tag: "NEW", image: "/game-art/mines.webp", href: "/games/mines", tone: "cyan", categories: ["Originals", "Instant"] },
  { name: "Cage Crash", studio: "SOLANA CRASH FOUNDATION", tag: "LIVE", image: "/game-art/crash.webp", href: "/games/crash", tone: "red", categories: ["Originals", "Instant", "High limit"] },
  { name: "Cage Keno", studio: "CHARLIE GUAN FOUNDATION", tag: "NEW", image: "/game-art/keno.webp", href: "/games/keno", tone: "lime", categories: ["Originals", "Instant", "High limit"] },
  { name: "Private Roulette", studio: "HIGH LIMIT", tag: "EUROPEAN", image: "/game-art/roulette.webp", href: "/games/roulette", tone: "red", categories: ["Table games", "High limit"] },
  { name: "Turbo Dice", studio: "JDLEO DICE FOUNDATION", tag: "FAST", image: "/game-art/dice.webp", href: "/games/dice", tone: "purple", categories: ["Originals", "Instant"] },
];

const categories = ["Lobby", "Originals", "Slots", "Table games", "Instant", "High limit", "All games"];

function GameCards({ items }: { items: LobbyGame[] }) {
  return (
    <div className="casino-game-grid">
      {items.map((game, index) => (
        <Link className={`casino-game-card ${game.tone}`} href={game.href} key={`${game.name}-${index}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={game.image} alt="" />
          <span className="game-card-shade" />
          <span className="game-card-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="game-card-tag">{game.tag}</span>
          <span className="game-card-play">▶</span>
          <footer><small>{game.studio}</small><b>{game.name}</b></footer>
        </Link>
      ))}
    </div>
  );
}

export default function GamesLobby() {
  const [category, setCategory] = useState("Lobby");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<Array<{ player: string; game: string; payout: number }>>([]);

  useEffect(() => {
    fetch("/api/games/activity")
      .then((response) => response.json())
      .then((data) => setActivity(Array.isArray(data.activity) ? data.activity : []))
      .catch(() => undefined);
  }, []);

  const visibleGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return games.filter((game) => {
      const categoryMatch = ["Lobby", "All games"].includes(category) || game.categories.includes(category);
      const searchMatch = !normalizedQuery || `${game.name} ${game.studio} ${game.tag}`.toLowerCase().includes(normalizedQuery);
      return categoryMatch && searchMatch;
    });
  }, [category, query]);

  const shelves = useMemo(() => {
    if (category === "Lobby" && !query.trim()) {
      return [
        { eyebrow: "LIVE FLOOR", title: "Trending now", items: games.slice(0, 8) },
        { eyebrow: "SOLCAGE ORIGINALS", title: "Instant games", items: games.filter((game) => game.categories.includes("Instant")) },
        { eyebrow: "TABLES", title: "Table games & high limit", items: games.filter((game) => game.categories.includes("Table games") || game.categories.includes("High limit")) },
      ];
    }
    return [{
      eyebrow: query ? "SEARCH RESULTS" : "CASINO",
      title: query ? `Games matching “${query}”` : category,
      items: visibleGames,
    }];
  }, [category, query, visibleGames]);

  return (
    <CasinoChrome active="casino" searchValue={query} onSearchChange={setQuery}>
      <div className="casino-content">
        <section className="casino-promo-grid">
          <article className="casino-primary-promo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="casino-promo-image" src="/game-art/plinko.webp" alt="" />
            <span className="casino-promo-scrim" />
            <div>
              <span className="live-pill"><i /> HOT DROP / SOLCAGE ORIGINAL</span>
              <h1>Neon Plinko.<br /><em>Let it fall.</em></h1>
              <p>Pick your stake. Commit the path. Watch the board settle up to 30×.</p>
              <div><Link href="/games/plinko">Play now</Link><Link href="#games">All games</Link></div>
            </div>
          </article>
          <article className="casino-mini-promo race">
            <span>WEEKLY LOYALTY RACE</span>
            <h2>Play. Borrow.<br />Climb.</h2>
            <p>Every settled round moves the global board.</p>
            <Link href="/leaderboard">Open standings ↗</Link>
          </article>
          <article className="casino-mini-promo credit">
            <span>MEMECOIN CREDIT</span>
            <h2>Keep the bag.<br />Open the floor.</h2>
            <p>Use eligible Solana collateral without selling it.</p>
            <Link href="/lending">Enter lending ↗</Link>
          </article>
        </section>

        <section className="casino-live-strip">
          <b><i /> LIVE WINS</b>
          <div>
            {(activity.length ? activity : [
              { player: "The floor", game: "is open", payout: 0 },
              { player: "Verified", game: "HMAC rounds", payout: 0 },
              { player: "Rewards", game: "loyalty live", payout: 0 },
            ]).map((item, index) => (
              <span key={`${item.player}-${index}`}><strong>{item.player}</strong>{item.game}{item.payout > 0 && <b>+{item.payout.toFixed(2)}</b>}</span>
            ))}
          </div>
        </section>

        <nav className="casino-categories" aria-label="Game categories">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
        </nav>

        <div id="games">
          {shelves.map((shelf) => (
            <section className="casino-game-section" key={shelf.title}>
              <header>
                <div><span>{shelf.eyebrow}</span><h2>{shelf.title}</h2></div>
                <small>{shelf.items.length} OPEN GAMES</small>
              </header>
              {shelf.items.length ? <GameCards items={shelf.items} /> : <div className="casino-empty-search"><b>NO GAMES FOUND</b><span>Try Baccarat, Keno, crash, roulette, mines, dice, Plinko, blackjack, or slots.</span></div>}
            </section>
          ))}
        </div>

        <section className="casino-integrity">
          <div><span>PROVABLY FAIR FLOOR</span><h2>Commit first. Reveal after.</h2></div>
          <p>Baccarat, Keno, Crash, Roulette, Dice, Slots, Plinko, Blackjack, and Mines persist their HMAC-SHA256 server commitment, player seed, settlement, and loyalty credit so every completed round has a reproducible receipt.</p>
          <Link href="/games/baccarat">Enter the new table &rarr;</Link>
        </section>
      </div>
    </CasinoChrome>
  );
}
