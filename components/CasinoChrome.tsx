"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ContractAddress } from "@/components/ContractAddress";

type CasinoChromeProps = {
  active: "casino" | "lending" | "rewards";
  children: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

export function CasinoChrome({ active, children, searchValue, onSearchChange }: CasinoChromeProps) {
  const [profileName, setProfileName] = useState("Profile");
  const [points, setPoints] = useState(0);

  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
      .then((profile) => {
        if (profile.error) return;
        setProfileName(profile.displayName ?? "Profile");
        setPoints(profile.points ?? 0);
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
          <Link href="/profile"><i>◎</i> Wallet</Link>

          <small>EARN</small>
          <Link className={active === "rewards" ? "active" : ""} href="/leaderboard"><i>✦</i> Rewards</Link>
          <Link href="/leaderboard"><i>↗</i> Leaderboard</Link>
        </nav>

        <div className="casino-sidebar-card">
          <span>LOYALTY SCORE</span>
          <b>{points.toLocaleString()} XP</b>
          <small>Every verified round and lending position counts.</small>
          <Link href="/leaderboard">View rewards ↗</Link>
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
            <ContractAddress />
            <Link href="/leaderboard"><small>WEEKLY RACE</small><b>{points.toLocaleString()} XP</b></Link>
            <Link className="casino-deposit" href="/lending">Deposit</Link>
            <Link className="casino-profile" href="/profile">{profileName.slice(0, 1).toUpperCase()}</Link>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
