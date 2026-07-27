"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type LobbyGame = {
  id: string;
  name: string;
  studio: string;
  tag: string;
  image: string;
  href: string;
  tone: string;
  categories: string[];
};

type FloorBet = {
  id: string;
  player: string;
  game: string;
  bet: number;
  outcome: string;
  payout: number;
  multiplier: number;
  createdAt: string;
};

type FloorTotals = {
  rounds: number;
  wagered: number;
  largestPayout: number;
  activePlayers: number;
};

const games: LobbyGame[] = [
  { id: "roulette", name: "Cage Roulette", studio: "SOLCAGE ORIGINALS", tag: "TRENDING", image: "/game-art/roulette.webp", href: "/games/roulette", tone: "violet", categories: ["Originals", "Table games", "High limit"] },
  { id: "baccarat", name: "Cage Baccarat", studio: "SOLCAGE ORIGINALS", tag: "NEW TABLE", image: "/game-art/baccarat.webp", href: "/games/baccarat", tone: "gold", categories: ["Originals", "Table games", "High limit"] },
  { id: "video-poker", name: "Neon Draw", studio: "SOLCAGE ORIGINALS", tag: "99.54% base RTP", image: "/game-art/video-poker.webp", href: "/games/video-poker", tone: "purple", categories: ["Originals", "Table games", "High limit", "Video poker"] },
  { id: "dice", name: "Neon Dice", studio: "SOLCAGE ORIGINALS", tag: "98% base RTP", image: "/game-art/dice.webp", href: "/games/dice", tone: "lime", categories: ["Originals", "Instant"] },
  { id: "slots", name: "Neon Vault", studio: "SOLCAGE ORIGINALS", tag: "96.03% base RTP", image: "/game-art/slots.webp", href: "/games/slots", tone: "gold", categories: ["Originals", "Slots", "Instant", "High limit"] },
  { id: "plinko", name: "Neon Plinko", studio: "SOLCAGE ORIGINALS", tag: "98% base RTP", image: "/game-art/plinko.webp", href: "/games/plinko", tone: "cyan", categories: ["Originals", "Instant"] },
  { id: "blackjack", name: "Cage Blackjack", studio: "SOLCAGE ORIGINALS", tag: "3:2 TABLE", image: "/game-art/blackjack.webp", href: "/games/blackjack", tone: "red", categories: ["Originals", "Table games", "High limit"] },
  { id: "mines", name: "Crystal Mines", studio: "SOLCAGE ORIGINALS", tag: "25 TILES", image: "/game-art/mines.webp", href: "/games/mines", tone: "cyan", categories: ["Originals", "Instant"] },
  { id: "crash", name: "Cage Crash", studio: "SOLCAGE ORIGINALS", tag: "LIVE", image: "/game-art/crash.webp", href: "/games/crash", tone: "red", categories: ["Originals", "Instant", "High limit"] },
  { id: "keno", name: "Cage Keno", studio: "SOLCAGE ORIGINALS", tag: "80 BALL", image: "/game-art/keno.webp", href: "/games/keno", tone: "lime", categories: ["Originals", "Instant", "High limit"] },
];

const gameById = Object.fromEntries(games.map((game) => [game.id, game]));
const categories = ["Lobby", "Originals", "Slots", "Table games", "Video poker", "Instant", "High limit", "All games"];
const heroSlides = [
  {
    game: gameById["video-poker"],
    eyebrow: "NEW MACHINE / FULL PAY",
    title: <>Neon Draw.<br /><em>Hold the line.</em></>,
    copy: "Five cards. One draw. A committed deck and a max-coin royal that returns 800×.",
  },
  {
    game: gameById.baccarat,
    eyebrow: "HIGH LIMIT / PUNTO BANCO",
    title: <>Cage Baccarat.<br /><em>Own the table.</em></>,
    copy: "Player, Banker, or Tie across a reproducible eight-deck committed shoe.",
  },
  {
    game: gameById.plinko,
    eyebrow: "SOLCAGE ORIGINAL / 98% BASE RTP",
    title: <>Neon Plinko.<br /><em>Let it fall.</em></>,
    copy: "Pick the risk, commit the path, and watch every peg settle against the proof.",
  },
];

function GameCards({ items }: { items: LobbyGame[] }) {
  return (
    <div className="casino-game-grid casino-game-rail">
      {items.map((game, index) => (
        <Link className={`casino-game-card ${game.tone}`} href={game.href} key={game.id}>
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
  const [heroIndex, setHeroIndex] = useState(0);
  const [activity, setActivity] = useState<FloorBet[]>([]);
  const [bets, setBets] = useState<FloorBet[]>([]);
  const [floor, setFloor] = useState<FloorTotals>({ rounds: 0, wagered: 0, largestPayout: 0, activePlayers: 0 });
  const [betView, setBetView] = useState<"all" | "wins" | "high">("all");

  useEffect(() => {
    fetch("/api/games/activity")
      .then((response) => response.json())
      .then((data) => {
        setActivity(Array.isArray(data.activity) ? data.activity : []);
        setBets(Array.isArray(data.bets) ? data.bets : []);
        if (data.floor) setFloor(data.floor);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % heroSlides.length), 7_000);
    return () => window.clearInterval(timer);
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
        { eyebrow: "LIVE FLOOR", title: "Trending now", items: [gameById["video-poker"], gameById.baccarat, gameById.slots, gameById.crash, gameById.roulette, gameById.blackjack] },
        { eyebrow: "SOLCAGE ORIGINALS", title: "Fast games", items: games.filter((game) => game.categories.includes("Instant")) },
        { eyebrow: "TABLES", title: "Tables & video poker", items: games.filter((game) => game.categories.includes("Table games")) },
        { eyebrow: "FULL FLOOR", title: "Every open game", items: games },
      ];
    }
    return [{
      eyebrow: query ? "SEARCH RESULTS" : "CASINO",
      title: query ? `Games matching “${query}”` : category,
      items: visibleGames,
    }];
  }, [category, query, visibleGames]);

  const displayedBets = useMemo(() => {
    if (betView === "wins") return bets.filter((bet) => bet.outcome === "win").slice(0, 12);
    if (betView === "high") return [...bets].sort((left, right) => right.bet - left.bet).slice(0, 12);
    return bets.slice(0, 12);
  }, [betView, bets]);

  const hero = heroSlides[heroIndex];

  return (
    <CasinoChrome active="casino" searchValue={query} onSearchChange={setQuery}>
      <div className="casino-content">
        <section className="casino-promo-grid">
          <article className="casino-primary-promo casino-promo-carousel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="casino-promo-image" src={hero.game.image} alt="" key={hero.game.id} />
            <span className="casino-promo-scrim" />
            <div>
              <span className="live-pill"><i /> {hero.eyebrow}</span>
              <h1>{hero.title}</h1>
              <p>{hero.copy}</p>
              <div><Link href={hero.game.href}>Play now</Link><Link href="#games">All games</Link></div>
            </div>
            <nav className="casino-promo-dots" aria-label="Featured games">
              {heroSlides.map((slide, index) => (
                <button aria-label={`Show ${slide.game.name}`} className={index === heroIndex ? "active" : ""} key={slide.game.id} onClick={() => setHeroIndex(index)} />
              ))}
            </nav>
          </article>
          <article className="casino-mini-promo race">
            <span>WEEKLY LOYALTY RACE</span>
            <h2>Play. Borrow.<br />Climb.</h2>
            <p>Every verified round moves the global board.</p>
            <Link href="/leaderboard">Open standings ↗</Link>
          </article>
          <article className="casino-mini-promo credit">
            <span>MEMECOIN CREDIT</span>
            <h2>Keep the bag.<br />Open the floor.</h2>
            <p>Use eligible Solana collateral without selling it.</p>
            <Link href="/lending">Enter lending ↗</Link>
          </article>
        </section>

        <section className="casino-live-wins">
          <header><b><i /> LIVE WINS</b><span>SETTLED ON THE SOLCAGE FLOOR</span></header>
          <div>
            {activity.length ? activity.map((item) => {
              const game = gameById[item.game] ?? gameById.dice;
              return (
                <Link href={game.href} key={item.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={game.image} alt="" />
                  <span><b>{game.name}</b><small>{item.player}</small></span>
                  <strong>+{item.payout.toFixed(2)}</strong>
                </Link>
              );
            }) : <p>Verified wins appear here as the floor settles.</p>}
          </div>
        </section>

        <section className="casino-floor-pulse" aria-label="Live floor totals">
          <div><span>VERIFIED ROUNDS</span><b>{floor.rounds.toLocaleString()}</b></div>
          <div><span>CHIPS WAGERED</span><b>{floor.wagered.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
          <div><span>LARGEST RETURN</span><b>{floor.largestPayout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
          <div><span>FLOOR PLAYERS</span><b>{floor.activePlayers.toLocaleString()}</b></div>
          <Link href="/leaderboard">OPEN RACE <i>↗</i></Link>
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
              {shelf.items.length ? <GameCards items={shelf.items} /> : <div className="casino-empty-search"><b>NO GAMES FOUND</b><span>Try Video Poker, Baccarat, Keno, crash, roulette, mines, dice, Plinko, blackjack, or slots.</span></div>}
            </section>
          ))}
        </div>

        <section className="casino-bets-board">
          <header>
            <div><span>LIVE FLOOR</span><h2>Recent bets</h2></div>
            <nav aria-label="Bet activity filters">
              <button className={betView === "all" ? "active" : ""} onClick={() => setBetView("all")}>ALL BETS</button>
              <button className={betView === "wins" ? "active" : ""} onClick={() => setBetView("wins")}>WINS</button>
              <button className={betView === "high" ? "active" : ""} onClick={() => setBetView("high")}>HIGH ROLLERS</button>
            </nav>
          </header>
          <div className="casino-bets-head"><span>GAME</span><span>PLAYER</span><span>WAGER</span><span>MULTIPLIER</span><span>PAYOUT</span></div>
          <div className="casino-bets-body">
            {displayedBets.length ? displayedBets.map((bet) => {
              const game = gameById[bet.game] ?? gameById.dice;
              return (
                <Link href={game.href} key={bet.id}>
                  <span className="casino-bet-game">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={game.image} alt="" />
                    <b>{game.name}</b>
                  </span>
                  <span>{bet.player}</span>
                  <span>{bet.bet.toFixed(2)} <small>CHIPS</small></span>
                  <strong className={bet.outcome}>{bet.multiplier.toFixed(2)}×</strong>
                  <em className={bet.outcome}>{bet.payout.toFixed(2)}</em>
                </Link>
              );
            }) : <p>Settled game receipts will populate this board.</p>}
          </div>
        </section>

        <section className="casino-integrity">
          <div><span>PROVABLY FAIR FLOOR</span><h2>Commit first. Reveal after.</h2></div>
          <p>Video Poker, Baccarat, Keno, Crash, Roulette, Dice, Slots, Plinko, Blackjack, and Mines persist their HMAC-SHA256 server commitment, player seed, settlement, and loyalty credit so every completed round has a reproducible receipt.</p>
          <Link href="/games/video-poker">Enter Neon Draw &rarr;</Link>
        </section>
      </div>
    </CasinoChrome>
  );
}
