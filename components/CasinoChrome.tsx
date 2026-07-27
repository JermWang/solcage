"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ContractAddress } from "@/components/ContractAddress";
import { XLink } from "@/components/XLink";
import { ProfileMenu } from "@/components/ProfileMenu";

type CasinoChromeProps = {
  active: "casino" | "lending" | "rewards" | "docs";
  children: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

export function CasinoChrome({ active, children, searchValue, onSearchChange }: CasinoChromeProps) {
  const [profileName, setProfileName] = useState("Profile");
  const [points, setPoints] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  // null while unknown, so the chrome does not flash a signed-out state.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  function adopt(profile: { displayName?: string; points?: number; walletAddress?: string | null }) {
    setSignedIn(true);
    setProfileName(profile.displayName ?? "Profile");
    setPoints(profile.points ?? 0);
    setWalletAddress(profile.walletAddress ?? null);
  }

  // Live table limits, read from the same source that enforces them so the
  // displayed ceiling can never drift from the one actually applied.
  const [maxWin, setMaxWin] = useState<string | null>(null);
  const [houseSymbol, setHouseSymbol] = useState("SOL");

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        if (response.status === 401) return setSignedIn(false);
        const profile = await response.json();
        if (profile.error) return;
        adopt(profile);
      })
      .catch(() => undefined);

    fetch("/api/wallet/balance")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.wagering !== "open") return;
        const decimals = Number(data.decimals ?? 9);
        const cap = BigInt(data.limits?.maxPayoutRaw ?? "0");
        if (cap <= 0n) return;
        const scale = 10n ** BigInt(decimals);
        const whole = cap / scale;
        const fraction = (cap % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
        setMaxWin(fraction ? `${whole}.${fraction}` : `${whole}`);
        setHouseSymbol(String(data.symbol ?? "SOL"));
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="casino-app">
      <aside className="casino-sidebar">
        <Link className="casino-wordmark" href="/">
          <BrandMark size={46} />
          <span><b>SOLCAGE</b><small>CASINO + CREDIT</small></span>
        </Link>

        <nav aria-label="Casino navigation">
          <small>PLAY</small>
          <Link className={active === "casino" ? "active" : ""} href="/games"><i>⌁</i> Casino</Link>
          <Link href="/games/roulette"><i>◉</i> Originals</Link>
          <span className="casino-nav-muted"><i>♠</i> Live tables</span>
          <Link href="/games/slots"><i>⚡</i> Slots</Link>

          <small>FINANCE</small>
          <Link className={active === "lending" ? "active" : ""} href="/lending"><i>◇</i> Lending</Link>
          <Link className={active === "docs" ? "active" : ""} href="/docs"><i>❋</i> How it works</Link>
          <Link href="/profile"><i>◎</i> Wallet</Link>

          <small>EARN</small>
          <Link className={active === "rewards" ? "active" : ""} href="/leaderboard"><i>✦</i> Rewards</Link>
          <Link href="/leaderboard"><i>↗</i> Leaderboard</Link>
        </nav>

        <div className="casino-sidebar-card">
          <span>LOYALTY SCORE</span>
          <b>{signedIn === false ? "—" : `${points.toLocaleString()} XP`}</b>
          <small>{signedIn === false ? "Connect a Solana wallet to start earning." : "Every verified round and lending position counts."}</small>
          <Link href={signedIn === false ? "/profile" : "/leaderboard"}>{signedIn === false ? "Connect wallet ↗" : "View rewards ↗"}</Link>
        </div>
      </aside>

      <section className="casino-workspace">
        <header className="casino-topbar">
          <div className="casino-search">
            <span>⌕</span>
            <input
              aria-label="Search games"
              placeholder={onSearchChange ? "Search the floor" : "Casino search"}
              value={searchValue ?? ""}
              readOnly={!onSearchChange}
              onChange={(event) => onSearchChange?.(event.target.value)}
            />
          </div>
          <div className="casino-top-actions">
            {maxWin && (
              <Link className="casino-maxwin" href="/docs#limits" title="Temporary while the bankroll grows — see the docs">
                <small>MAX WIN / ROUND</small>
                <b>{maxWin} {houseSymbol}</b>
              </Link>
            )}
            <ContractAddress />
            <XLink />
            <Link className="casino-race" href="/leaderboard"><small>WEEKLY RACE</small><b>{signedIn === false ? "—" : `${points.toLocaleString()} XP`}</b></Link>
            <Link className="casino-deposit" href="/lending">Deposit</Link>
            <ProfileMenu
              signedIn={signedIn !== false}
              displayName={profileName}
              walletAddress={walletAddress}
              onSignedIn={adopt}
            />
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
