"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Leader = { rank: number; username: string; displayName: string; avatarUrl: string | null; points: number; events: number; referrals: number };

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/leaderboard", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setLeaders(data.leaders ?? []);
      setLoading(false);
    });
  }, []);
  return <main className="account-page">
    <AccountNav />
    <section className="account-hero">
      <div className="section-kicker">GLOBAL RANKINGS / SEASON ZERO</div>
      <h1>The <em>loyalty board.</em></h1>
      <p>Earn points by opening collateral tickets, playing floor rounds, and bringing verified players into the cage. Rankings include cryptographically verified Solana wallets only. Points track platform loyalty and referral activity.</p>
    </section>
    <section className="leaderboard-wrap">
      <div className="leaderboard-head"><span>RANK / PLAYER</span><span>REFS</span><span>ACTIVITY</span><span>POINTS</span></div>
      {loading && <div className="loading-row">CALCULATING THE FLOOR…</div>}
      {!loading && leaders.length === 0 && <div className="loading-row">BE THE FIRST PLAYER ON THE BOARD.</div>}
      {leaders.map((leader) => <article className="leader-row" key={leader.username}>
        <div><b className="rank">{String(leader.rank).padStart(2, "0")}</b><Avatar leader={leader} /><span><strong>{leader.displayName}</strong><small>@{leader.username}</small></span></div>
        <b>{leader.referrals}</b><b>{leader.events}</b><strong>{leader.points.toLocaleString()} PTS</strong>
      </article>)}
    </section>
    <Rules />
  </main>;
}

function Avatar({ leader }: { leader: Leader }) {
  return leader.avatarUrl ? <Image className="avatar" src={leader.avatarUrl} alt="" width={48} height={48} unoptimized /> : <span className="avatar fallback">{leader.displayName.slice(0, 1).toUpperCase()}</span>;
}

function AccountNav() {
  return <nav className="account-nav"><Link className="brand" href="/"><span className="brand-mark">SC</span><span>SOLCAGE</span></Link><div><Link href="/">Floor</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/profile">Profile</Link></div></nav>;
}

function Rules() {
  return <section className="points-rules"><div><span>POINT ENGINE</span><h2>More signal.<br /><em>More points.</em></h2></div><div className="rule-list"><p><b>01</b><span>Open a ticket</span><strong>50–500 PTS</strong></p><p><b>02</b><span>Play a round</span><strong>10–115 PTS</strong></p><p><b>03</b><span>Join via referral</span><strong>250 PTS</strong></p><p><b>04</b><span>Referred player activity</span><strong>10% BONUS</strong></p><p><b>05</b><span>Referred-player multiplier</span><strong>1.25×</strong></p></div></section>;
}
