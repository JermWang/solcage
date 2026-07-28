"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ContractAddress } from "@/components/ContractAddress";
import { XLink } from "@/components/XLink";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Cashier } from "@/components/Cashier";
import { DepositMenu } from "@/components/DepositMenu";
import { useWager } from "@/lib/useWager";
import { solToUsd, usePrices } from "@/lib/usePrices";

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

  const [cashierOpen, setCashierOpen] = useState(false);
  // Shared hook, so the nav figure tracks the same live balance the tables use.
  const wager = useWager();
  const prices = usePrices();

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        if (response.status === 401) return setSignedIn(false);
        const profile = await response.json();
        if (profile.error) return;
        adopt(profile);
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
            <ContractAddress />
            <XLink />
            {signedIn !== false && (
              <button type="button" className="casino-balance-chip" onClick={() => setCashierOpen(true)}>
                <small>BALANCE</small><b>{wager.balance.toFixed(2)} {wager.symbol}</b>{solToUsd(wager.balance, prices.sol?.usdPrice) && <i className="balance-usd">{solToUsd(wager.balance, prices.sol?.usdPrice)}</i>}
              </button>
            )}
            <DepositMenu signedIn={signedIn !== false} onSolana={() => setCashierOpen(true)} />
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
      {cashierOpen && (
        <Cashier
          open={cashierOpen}
          onClose={() => setCashierOpen(false)}
          onBalance={() => { void wager.refresh(); }}
        />
      )}
    </main>
  );
}
