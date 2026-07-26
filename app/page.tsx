"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type View = "home" | "vault" | "games";
type Asset = { symbol: string; name: string; price: number; marketCap: number; ltv: number; tone: string; origin: string; image: string };

const assets: Asset[] = [
  { symbol: "ANSEM", name: "The Black Bull", price: 0.1959, marketCap: 195_900_000, ltv: 30, tone: "purple", origin: "PUMP · 1 MO", image: "/coin-art/ansem.webp" },
  { symbol: "FARTCOIN", name: "Fartcoin", price: 0.1312, marketCap: 131_200_000, ltv: 30, tone: "green", origin: "PUMP · 1 YR", image: "/coin-art/fartcoin.webp" },
  { symbol: "TRIPLET", name: "Tung Tung Tung Sahur", price: 0.01748, marketCap: 17_480_000, ltv: 20, tone: "orange", origin: "PUMP · 5 MO", image: "/coin-art/triplet.webp" },
  { symbol: "KINS", name: "Kintara", price: 0.0151, marketCap: 15_100_000, ltv: 18, tone: "pink", origin: "PUMP · RECENT", image: "/coin-art/kins.webp" },
  { symbol: "TBB", name: "The Bitcoin Bull", price: 0.04535, marketCap: 45_350_000, ltv: 22, tone: "orange", origin: "PUMP · 26 D", image: "/coin-art/tbb.webp" },
  { symbol: "JIMOTHY", name: "Jimothy the Raccoon", price: 0.0171, marketCap: 17_100_000, ltv: 15, tone: "green", origin: "PUMP · NEW", image: "/coin-art/jimothy.webp" },
  { symbol: "PENGU", name: "Pudgy Penguins", price: 0.006315, marketCap: 397_100_000, ltv: 40, tone: "purple", origin: "SOLANA", image: "/coin-art/pengu.webp" },
  { symbol: "BONK", name: "Bonk", price: 0.000002935, marketCap: 258_300_000, ltv: 35, tone: "orange", origin: "SOLANA", image: "/coin-art/bonk.webp" },
  { symbol: "WIF", name: "dogwifhat", price: 0.1545, marketCap: 154_300_000, ltv: 30, tone: "green", origin: "SOLANA", image: "/coin-art/wif.jpg" },
  { symbol: "POPCAT", name: "Popcat", price: 0.0433, marketCap: 42_400_000, ltv: 25, tone: "pink", origin: "SOLANA", image: "/coin-art/popcat.webp" },
];

const games = [
  ["01", "◎", "Sol Spin", "Pick a color or number, place your stake, and send the wheel.", "2.70%", "35:1", "/game-art/roulette.webp"],
  ["02", "◆", "Crystal Mines", "Reveal crystals for a rising multiplier. Cash out before the mine.", "3.00%", "RISING", "/game-art/mines.webp"],
  ["03", "⚄", "Neon Dice", "Set your target from 2 to 95 and roll under the line.", "2.00%", "49×", "/game-art/dice.webp"],
];

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [connected, setConnected] = useState(false);
  const [asset, setAsset] = useState(assets[0]);
  const [amount, setAmount] = useState("10");
  const [chips, setChips] = useState(0);
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

  return (
    <main>
      <div className="ticker" aria-hidden="true"><span>S</span><span>O</span><span>L</span><span>C</span><span>A</span><span>G</span><span>E</span><b>SOLANA CREDIT + GAMES</b></div>
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

      {view === "home" && <HomeView go={go} onSelectAsset={(nextAsset) => { setAsset(nextAsset); go("vault"); }} />}
      {view === "vault" && (
        <section className="app-shell">
          <div className="section-kicker">THE CAGE / CREDIT PREVIEW</div>
          <h1>Turn Solana assets into <em>table chips.</em></h1>
          <p className="lead">Collateralize screened Solana memecoins with a verified market cap above $10M. Pump.fun candidates must also pass age, liquidity, authority and concentration checks.</p>
          <div className="vault-grid">
            <div className="panel">
              <div className="panel-title"><span>01</span> SELECT COLLATERAL</div>
              <div className="asset-list">
                {assets.map((a) => <button key={a.symbol} className={asset.symbol === a.symbol ? "asset selected" : "asset"} onClick={() => setAsset(a)}>
                  <i className={a.tone}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.image} alt="" />
                  </i><span><b>{a.symbol}</b><small>{a.name} · ${(a.marketCap / 1_000_000).toFixed(1)}M cap</small></span><strong><em>✓ SCREENED</em>{a.ltv}% LTV</strong>
                </button>)}
              </div>
            </div>
            <div className="panel ticket">
              <div className="panel-title"><span>02</span> OPEN A TICKET</div>
              <label>COLLATERAL AMOUNT <span>Position input</span></label>
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
              <button className="primary full" onClick={draw}>{connected ? "Preview available credit" : "Connect wallet to preview"}</button>
              <small className="fine">Screened does not mean safe or endorsed. Eligibility requires a verified $10M+ market cap, sufficient executable liquidity, revoked mint/freeze authority, holder-distribution limits and clean oracle coverage. Any failed check disables new loans.</small>
            </div>
          </div>
        </section>
      )}
      <a className="floating-play" href="/games"><span>PLAY THE FLOOR</span><b>↗</b></a>
      <footer><div><b>SOLCAGE</b><span>Collateral in. Game on.</span></div><p>Solana-native memecoin credit, game settlement and loyalty in one wallet-connected platform.</p><span>BUILT FOR SOLANA · 2026</span></footer>
    </main>
  );
}

function HomeView({ go, onSelectAsset }: { go: (v: View) => void; onSelectAsset: (asset: Asset) => void }) {
  const stats = useMemo(() => [["Collateral gate", "$10M+"], ["Live games", "03"], ["Round rewards", "ON"], ["Network", "SOLANA"]], []);
  return <>
    <header className="hero">
      <div className="eyebrow"><span /> MEMECOIN CREDIT ON SOLANA · $10M+ COLLATERAL · FLOOR REWARDS</div>
      <h1>Bag locked.<br /><em>Tables open.</em></h1>
      <p>Deposit an eligible Solana memecoin, open a collateralized credit position, and take that liquidity to the floor. Every position and round builds your account history and loyalty score.</p>
      <div className="hero-actions"><button className="primary" onClick={() => go("games")}>Play now <span>↗</span></button><button className="secondary" onClick={() => go("vault")}>Open the cage</button></div>
      <div className="stats">{stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <div className="orbit" aria-hidden="true"><div className="coin"><span>◎</span><b>SOL</b></div><i className="ring r1" /><i className="ring r2" /><i className="dot d1" /><i className="dot d2" /></div>
    </header>
    <div className="lobby-marquee" aria-label="Floor status"><b><span /> LIVE TABLES 03</b><b>SOLANA CREDIT MARKET</b><b>LOYALTY ACTIVE</b><b>PROFILE HISTORY ON</b></div>
    <section className="floor reveal">
      <div className="floor-head"><div><div className="section-kicker">THE FLOOR / THREE GAME EXPERIENCES</div><h2>Pick a table.<br /><em>Place your stake.</em></h2></div><button className="secondary light" onClick={() => go("games")}>Enter the floor ↗</button></div>
      <div className="cards">{games.map((game) => <button key={game[2]} onClick={() => go("games")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={game[6]} alt="" />
        <span>TABLE {game[0]}</span><i>{game[1]}</i><h3>{game[2]}</h3><p>{game[3]}</p><footer><b>EDGE {game[4]}</b><b>{game[5]}</b></footer>
      </button>)}</div>
    </section>
    <section className="lending-brief reveal" id="lending">
      <div className="lending-intro">
        <div className="section-kicker">THE CREDIT MARKET / SOLANA MEMECOINS</div>
        <h2>Keep the bag.<br /><em>Access the liquidity.</em></h2>
        <p>SolCage is designed as a Solana-native collateral market for established memecoins. At launch, eligible tokens enter program-controlled vaults, each asset receives its own loan-to-value limit, and repayment unlocks the original collateral.</p>
        <button className="primary" onClick={() => go("vault")}>Explore the cage <span>↗</span></button>
      </div>
      <div className="lending-details">
        <article><span>01 / ELIGIBILITY</span><h3>$10M market cap is the first gate—not the only one.</h3><p>Executable liquidity, holder concentration, token authorities, trading history and oracle coverage determine whether new positions can open.</p></article>
        <article><span>02 / CREDIT</span><h3>Every asset gets a risk-adjusted LTV.</h3><p>More liquid, widely distributed assets support higher credit limits. Volatile or concentrated collateral receives a lower ceiling or is disabled.</p></article>
        <article><span>03 / REPAYMENT</span><h3>Positions settle through the same Solana wallet.</h3><p>Repay the outstanding balance to release collateral. If health falls below the maintenance threshold, protocol liquidation protects the credit pool.</p></article>
      </div>
      <CollateralCarousel items={assets} onSelect={onSelectAsset} />
    </section>
    <section className="steps reveal">
      <div className="section-kicker">FUND THE FLOOR / THREE MOVES</div>
      <div className="step-grid">
        <article><span>01 / LOCK</span><b>◆</b><h3>Put the bag in the cage</h3><p>Choose a screened $10M+ Solana asset and open a collateral position.</p></article>
        <article><span>02 / BORROW</span><b>◎</b><h3>Access the credit line</h3><p>Your asset’s risk tier sets the available LTV while the collateral remains secured in the vault.</p></article>
        <article><span>03 / PLAY</span><b>↗</b><h3>Hit the floor</h3><p>Play three game experiences, build round history, and climb the loyalty leaderboard.</p></article>
      </div>
    </section>
  </>;
}

function CollateralCarousel({ items, onSelect }: { items: Asset[]; onSelect: (asset: Asset) => void }) {
  const [turn, setTurn] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelLocked = useRef(false);
  const wheelTimer = useRef<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const active = ((turn % items.length) + items.length) % items.length;
  const angleStep = 360 / items.length;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function captureWheel(event: globalThis.WheelEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".coin-card")) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 8 || wheelLocked.current) return;
      wheelLocked.current = true;
      setTurn((current) => current + (delta > 0 ? 1 : -1));
      wheelTimer.current = window.setTimeout(() => { wheelLocked.current = false; }, 420);
    }

    stage.addEventListener("wheel", captureWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", captureWheel);
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    };
  }, []);

  function rotateBy(amount: number) {
    setTurn((current) => current + amount);
  }

  function rotateTo(index: number) {
    let offset = index - active;
    if (offset > items.length / 2) offset -= items.length;
    if (offset < -items.length / 2) offset += items.length;
    setTurn((current) => current + offset);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    rotateBy(event.key === "ArrowRight" ? 1 : -1);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const movement = event.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(movement) > 36) rotateBy(movement < 0 ? 1 : -1);
  }

  const focused = items[active];
  const ringStyle = { "--ring-rotation": `${turn * -angleStep}deg` } as CSSProperties;

  return (
    <div className="collateral-showcase seamless-carousel-shell">
      <div className="coin-carousel-head">
        <div>
          <span><i /> ACCEPTED COLLATERAL</span>
          <h3>Choose your bag.</h3>
        </div>
        <p>Spin the 3D ring by scrolling, dragging, swiping, or using the controls.</p>
        <div className="coin-carousel-controls">
          <button onClick={() => rotateBy(-1)} aria-label="Previous collateral asset">←</button>
          <span>{String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
          <button onClick={() => rotateBy(1)} aria-label="Next collateral asset">→</button>
        </div>
      </div>
      <div
        className="coin-carousel-stage circular-carousel-stage"
        ref={stageRef}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        tabIndex={0}
        aria-label="Accepted collateral coins circular carousel"
      >
        <div className="carousel-orbit-lines" aria-hidden="true"><i /><i /><span /></div>
        <div
          className="coin-carousel circular-carousel"
          style={ringStyle}
        >
          {items.map((coin, index) => {
            let offset = index - active;
            if (offset > items.length / 2) offset -= items.length;
            if (offset < -items.length / 2) offset += items.length;
            const distance = Math.abs(offset);
            const direction = offset < 0 ? "is-left" : offset > 0 ? "is-right" : "is-active";
            const cardStyle = { "--coin-angle": `${index * angleStep}deg` } as CSSProperties;
            return (
              <button
                className={`coin-card ${coin.tone} ${direction}`}
                data-distance={distance}
                data-coin-index={index}
                key={coin.symbol}
                onClick={() => rotateTo(index)}
                aria-pressed={index === active}
                aria-label={`Focus ${coin.name}, ${coin.ltv}% maximum LTV`}
                tabIndex={distance <= 1 ? 0 : -1}
                style={cardStyle}
              >
                <span className="coin-card-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coin.image} alt={`${coin.name} profile`} loading="lazy" />
                  <small><i /> SCREENED</small>
                </span>
                <span className="coin-card-copy">
                  <span><small>{coin.origin}</small><b>${coin.symbol}</b><em>{coin.name}</em></span>
                  <span className="coin-card-metrics">
                    <span><small>CAP REFERENCE</small><b>${(coin.marketCap / 1_000_000).toFixed(coin.marketCap >= 100_000_000 ? 0 : 1)}M</b></span>
                    <span><small>MAX LTV</small><b>{coin.ltv}%</b></span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="coin-carousel-focus">
        <div><span>SELECTED ASSET</span><b>${focused.symbol}</b><small>{focused.name}</small></div>
        <p>Screened for the $10M+ gate and assigned a {focused.ltv}% maximum LTV.</p>
        <button onClick={() => onSelect(focused)}>Open ${focused.symbol} position <span>↗</span></button>
      </div>
    </div>
  );
}
