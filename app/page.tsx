"use client";

import { useEffect, useMemo, useState } from "react";
import SolCageChipScene from "@/components/SolCageChipScene";

type View = "home" | "vault" | "games";
type Asset = { symbol: string; name: string; price: number; marketCap: number; ltv: number; tone: string; origin: string };

const assets: Asset[] = [
  { symbol: "ANSEM", name: "The Black Bull", price: 0.1959, marketCap: 195_900_000, ltv: 30, tone: "purple", origin: "PUMP · 1 MO" },
  { symbol: "FARTCOIN", name: "Fartcoin", price: 0.1312, marketCap: 131_200_000, ltv: 30, tone: "green", origin: "PUMP · 1 YR" },
  { symbol: "TRIPLET", name: "Tung Tung Tung Sahur", price: 0.01748, marketCap: 17_480_000, ltv: 20, tone: "orange", origin: "PUMP · 5 MO" },
  { symbol: "KINS", name: "Kintara", price: 0.0151, marketCap: 15_100_000, ltv: 18, tone: "pink", origin: "PUMP · RECENT" },
  { symbol: "TBB", name: "The Bitcoin Bull", price: 0.04535, marketCap: 45_350_000, ltv: 22, tone: "orange", origin: "PUMP · 26 D" },
  { symbol: "JIMOTHY", name: "Jimothy the Raccoon", price: 0.0171, marketCap: 17_100_000, ltv: 15, tone: "green", origin: "PUMP · NEW" },
  { symbol: "PENGU", name: "Pudgy Penguins", price: 0.006315, marketCap: 397_100_000, ltv: 40, tone: "purple", origin: "SOLANA" },
  { symbol: "BONK", name: "Bonk", price: 0.000002935, marketCap: 258_300_000, ltv: 35, tone: "orange", origin: "SOLANA" },
  { symbol: "WIF", name: "dogwifhat", price: 0.1545, marketCap: 154_300_000, ltv: 30, tone: "green", origin: "SOLANA" },
  { symbol: "POPCAT", name: "Popcat", price: 0.0433, marketCap: 42_400_000, ltv: 25, tone: "pink", origin: "SOLANA" },
];

const games = [
  ["01", "◎", "Sol Spin", "Single-zero wheel with straight, dozen and even-money bets.", "2.70%", "35:1"],
  ["02", "◐", "Coin Flip", "Call the side. One click, one flip, instant settlement.", "2.00%", "1.96×"],
  ["03", "♠", "Blackjack", "Six decks, dealer stands on 17, blackjack pays three to two.", "≈1.0%", "3:2"],
  ["04", "◆", "Mines", "Reveal tiles for a rising multiplier. Cash out before the mine.", "3.00%", "RISING"],
  ["05", "⚄", "Dice", "Set your target from 2 to 95 and roll under the line.", "2.00%", "49×"],
  ["06", "↑", "Hi-Lo", "Call the next card higher or lower. Chain wins or take profit.", "3.00%", "CHAINED"],
];

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [connected, setConnected] = useState(false);
  const [asset, setAsset] = useState(assets[0]);
  const [amount, setAmount] = useState("10");
  const [chips, setChips] = useState(0);
  const [activeGame, setActiveGame] = useState("Sol Spin");
  const [bet, setBet] = useState(25);
  const [result, setResult] = useState("Place a demo bet to spin");
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [profileName, setProfileName] = useState("Profile");

  const collateral = Number(amount || 0) * asset.price;
  const available = collateral * asset.ltv / 100;

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref");
    fetch("/api/me").then((response) => response.json()).then((profile) => {
      if (!profile.error) {
        setLoyaltyPoints(profile.points ?? 0);
        setProfileName(profile.displayName ?? "Profile");
      }
      if (referralCode) {
        fetch("/api/referrals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: referralCode }),
        }).then((response) => response.json()).then((result) => {
          if (result.profile) setLoyaltyPoints(result.profile.points ?? 0);
        });
      }
    }).catch(() => undefined);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.14 });
    document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  function go(next: View) {
    if (next === "games") {
      window.location.assign("/games");
      return;
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function recordEvent(payload: Record<string, unknown>) {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, eventKey: crypto.randomUUID() }),
    });
    const data = await response.json();
    if (response.ok) setLoyaltyPoints(data.points ?? loyaltyPoints);
  }

  function draw() {
    if (!connected) return setConnected(true);
    setChips(Math.round(available * 100) / 100);
    void recordEvent({
      kind: "loan_draw",
      asset: asset.symbol,
      collateralAmount: Number(amount || 0),
      collateralValue: collateral,
      chipsDrawn: available,
    });
  }

  function play() {
    if (chips < bet) return setResult("Draw more chips at the cage first");
    const won = Math.random() > 0.52;
    const payout = won ? bet * 1.96 : 0;
    setChips((v) => Math.max(0, Math.round((v + (won ? bet * 0.96 : -bet)) * 100) / 100));
    setResult(won ? "WIN — payout added to your stack" : "HOUSE — better luck next round");
    void recordEvent({ kind: "game_round", game: activeGame, bet, won, payout });
  }

  return (
    <main>
      <div className="ticker" aria-hidden="true"><span>S</span><span>O</span><span>L</span><span>C</span><span>A</span><span>G</span><span>E</span><b>DEVNET FLOOR — OPEN</b></div>
      <nav>
        <button className="brand" onClick={() => go("home")} aria-label="SolCage home">
          <span className="brand-mark">SC</span><span>SOLCAGE</span>
        </button>
        <div className="nav-links">
          <button className={view === "home" ? "active" : ""} onClick={() => go("home")}>Home</button>
          <button className={view === "vault" ? "active" : ""} onClick={() => go("vault")}>Cage</button>
          <a href="/games">Games</a>
          <a href="/leaderboard">Leaderboard</a>
        </div>
        <div className="balances"><span>CHIPS <b>{chips.toFixed(2)}</b></span><span>LOYALTY <b>{loyaltyPoints.toLocaleString()} PTS</b></span></div>
        <a className="wallet" href="/profile">{profileName}</a>
      </nav>

      {view === "home" && <HomeView go={go} />}
      {view === "vault" && (
        <section className="app-shell">
          <div className="section-kicker">THE CAGE / DEVNET DEMO</div>
          <h1>Turn Solana assets into <em>table chips.</em></h1>
          <p className="lead">Collateralize screened Solana memecoins with a verified market cap above $10M. Pump.fun candidates must also pass age, liquidity, authority and concentration checks.</p>
          <div className="vault-grid">
            <div className="panel">
              <div className="panel-title"><span>01</span> SELECT COLLATERAL</div>
              <div className="asset-list">
                {assets.map((a) => <button key={a.symbol} className={asset.symbol === a.symbol ? "asset selected" : "asset"} onClick={() => setAsset(a)}>
                  <i className={a.tone}>{a.symbol.slice(0, 1)}</i><span><b>{a.symbol}</b><small>{a.name} · ${(a.marketCap / 1_000_000).toFixed(1)}M cap</small></span><strong><em>✓ SCREENED</em>{a.ltv}% LTV</strong>
                </button>)}
              </div>
            </div>
            <div className="panel ticket">
              <div className="panel-title"><span>02</span> OPEN A TICKET</div>
              <label>COLLATERAL AMOUNT <span>Balance: demo</span></label>
              <div className="amount"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Collateral amount" /><b>{asset.symbol}</b></div>
              <div className="receipt">
                <p><span>Mark price</span><b>${asset.price < .01 ? asset.price.toFixed(6) : asset.price.toFixed(2)}</b></p>
                <p><span>Collateral value</span><b>${collateral.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></p>
                <p><span>Market-cap gate</span><b className="eligible">✓ ABOVE $10M</b></p>
                <p><span>Origin / age</span><b>{asset.origin}</b></p>
                <p><span>Risk tier</span><b>{asset.ltv <= 20 ? "HIGH" : asset.ltv <= 30 ? "ELEVATED" : "VOLATILE"}</b></p>
                <p><span>Maximum draw</span><b>{asset.ltv}%</b></p>
                <p className="total"><span>Chips available</span><b>{available.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></p>
              </div>
              <button className="primary full" onClick={draw}>{connected ? "Draw demo chips" : "Connect wallet to continue"}</button>
              <small className="fine">Screened does not mean safe or endorsed. Eligibility requires a verified $10M+ market cap, sufficient executable liquidity, revoked mint/freeze authority, holder-distribution limits and clean oracle coverage. Any failed check disables new loans.</small>
            </div>
          </div>
        </section>
      )}
      {view === "games" && (
        <section className="app-shell">
          <div className="section-kicker">THE FLOOR / SIX TABLES</div>
          <h1>Pick your <em>table.</em></h1>
          <div className="game-layout">
            <div className="game-menu">{games.map((g) => <button key={g[2]} className={activeGame === g[2] ? "selected" : ""} onClick={() => { setActiveGame(g[2]); setResult("Place a demo bet to play"); }}><span>{g[1]}</span><b>{g[2]}</b><small>EDGE {g[4]}</small></button>)}</div>
            <div className="table-panel">
              <span className="live">● DEVNET SIMULATION</span>
              <div className="table-symbol">{games.find(g => g[2] === activeGame)?.[1]}</div>
              <h2>{activeGame}</h2><p>{result}</p>
              <div className="bet-row"><button onClick={() => setBet(Math.max(5, bet / 2))}>½</button><strong>{bet.toFixed(2)} CHIPS</strong><button onClick={() => setBet(bet * 2)}>2×</button></div>
              <button className="primary play" onClick={play}>PLAY DEMO ROUND</button>
              <small>Stack: {chips.toFixed(2)} chips · no real wagering</small>
            </div>
          </div>
        </section>
      )}
      <a className="floating-play" href="/games"><span>PLAY THE FLOOR</span><b>↗</b></a>
      <footer><div><b>SOLCAGE</b><span>Collateral in. Game on.</span></div><p>Interactive front-end demonstration. Prices, wallets, chips, games and settlements are simulated. No custody, real loans or wagering.</p><span>BUILT FOR SOLANA · 2026</span></footer>
    </main>
  );
}

function HomeView({ go }: { go: (v: View) => void }) {
  const stats = useMemo(() => [["Cost to enter", "$0.00"], ["Borrowing power", "UP TO 70%"], ["Tables open", "06"], ["Settlement", "SOL"]], []);
  return <>
    <header className="hero">
      <div className="eyebrow"><span /> SCREENED SOLANA MEMECOINS · $10M+ MARKET CAP · SETTLED IN SOL</div>
      <h1>Keep the meme.<br /><em>Borrow the thrill.</em></h1>
      <p>Lock a screened Solana memecoin above $10M market cap—including established and selected Pump.fun tokens. Draw chips, play, then settle in SOL to unlock your bag.</p>
      <div className="hero-actions"><button className="primary" onClick={() => go("vault")}>Enter the cage <span>↗</span></button><button className="secondary" onClick={() => go("games")}>Explore games</button></div>
      <div className="stats">{stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <div className="orbit" aria-hidden="true"><SolCageChipScene scrollReactive /></div>
    </header>
    <section className="manifesto reveal"><div><span>THE WHOLE IDEA</span><h2>Your memecoin stays yours.<br />The chips are <em>borrowed.</em></h2></div><p>Only established Solana memes above a $10M market-cap gate can enter the cage. Collateral is security, not payment. Settle the ticket and your bag walks back out with you.</p></section>
    <section className="steps reveal">
      <div className="section-kicker">HOW IT WORKS / THREE MOVES</div>
      <div className="step-grid">
        <article><span>01 / VERIFY</span><b>◆</b><h3>Pass every risk gate</h3><p>$10M+ market cap is only the start. Liquidity, holder concentration, token authorities, age and oracle health must pass too.</p></article>
        <article><span>02 / DRAW</span><b>◎</b><h3>Draw chips against it</h3><p>Borrow up to the asset’s published LTV. One chip tracks one US dollar of play balance.</p></article>
        <article><span>03 / SETTLE</span><b>↗</b><h3>Close the ticket in SOL</h3><p>Repay what you drew to unlock the asset. Any net chip winnings settle to the same wallet.</p></article>
      </div>
    </section>
    <section className="floor reveal">
      <div className="floor-head"><div><div className="section-kicker">THE FLOOR / SIX TABLES</div><h2>One stack.<br /><em>Every game.</em></h2></div><button className="secondary light" onClick={() => go("games")}>View the floor ↗</button></div>
      <div className="cards">{games.map((game, index) => <button key={game[2]} onClick={() => go("games")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={["/game-art/roulette.webp", "/game-art/dice.webp", "/game-art/roulette.webp", "/game-art/mines.webp", "/game-art/dice.webp", "/game-art/roulette.webp"][index]} alt="" />
        <span>TABLE {game[0]}</span><i>{game[1]}</i><h3>{game[2]}</h3><p>{game[3]}</p><footer><b>EDGE {game[4]}</b><b>{game[5]}</b></footer>
      </button>)}</div>
    </section>
    <section className="warning reveal"><span>READ THE FELT</span><h2>Borrowing to play is still <em>borrowing.</em></h2><p>The debt survives a losing night. If collateral value falls, liquidation can cost the asset—not only the chips. This prototype uses simulated balances and does not enable real-money gambling.</p></section>
  </>;
}
