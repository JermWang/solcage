"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import bs58 from "bs58";
import { BrandMark } from "@/components/BrandMark";
import { ContractAddress } from "@/components/ContractAddress";

type History = { kind: string; points: number; multiplier: number; description: string; created_at: string };
type Profile = { username: string; displayName: string; avatarUrl: string | null; bio: string; walletAddress: string | null; walletVerified: boolean; referralCode: string; points: number; rank: number | null; referrals: number; multiplier: number; history: History[] };

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect(): Promise<{ publicKey: { toString(): string } }>;
      signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
    };
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ username: "", displayName: "", bio: "", avatarUrl: "" });
  const [status, setStatus] = useState("Loading your profile…");
  useEffect(() => { fetch("/api/me").then(r => r.json()).then((data) => { if (data.error) return setStatus(data.error); setProfile(data); setForm({ username: data.username, displayName: data.displayName, bio: data.bio, avatarUrl: data.avatarUrl ?? "" }); setStatus(""); }); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setStatus("Saving…");
    const response = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error ?? "Unable to save");
    setProfile(data); setStatus("Profile saved.");
  }
  function avatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 375_000) return setStatus("Avatar must be under 375KB.");
    const reader = new FileReader();
    reader.onload = () => setForm((value) => ({ ...value, avatarUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }
  async function copyReferral() {
    if (!profile) return;
    const link = `${location.origin}/?ref=${profile.referralCode}`;
    await navigator.clipboard.writeText(link);
    setStatus("Referral link copied.");
  }
  async function verifyWallet() {
    try {
      const provider = window.solana;
      if (!provider?.isPhantom) return setStatus("Install or open Phantom to verify a Solana wallet.");
      setStatus("Connecting to Phantom…");
      const connection = await provider.connect();
      const wallet = connection.publicKey.toString();
      const challengeResponse = await fetch("/api/wallet/challenge", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error);
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const verifyResponse = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, nonce: challenge.nonce, signature: bs58.encode(signed.signature) }),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verified.error);
      setProfile(verified.profile);
      setStatus("Wallet ownership verified.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet verification cancelled.");
    }
  }
  return <main className="account-page">
    <nav className="account-nav"><Link className="brand" href="/"><BrandMark /><span>SOLCAGE</span></Link><div><Link href="/">Floor</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/profile">Profile</Link></div><ContractAddress /></nav>
    {!profile ? <div className="profile-loading">{status}</div> : <>
      <section className="profile-top">
        <div className="profile-avatar">{form.avatarUrl ? <Image src={form.avatarUrl} alt="Your profile" width={145} height={145} unoptimized /> : <span>{form.displayName.slice(0, 1)}</span>}<label>CHANGE PFP<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={avatar} /></label></div>
        <div><div className="section-kicker">PLAYER PROFILE / SEASON ZERO</div><h1>{profile.displayName}</h1><p>@{profile.username} · {profile.rank ? `GLOBAL RANK #${profile.rank}` : "VERIFY WALLET TO RANK"}</p></div>
        <div className="profile-score"><span>LOYALTY BALANCE</span><b>{profile.points.toLocaleString()}</b><small>POINTS · {profile.multiplier.toFixed(2)}× MULTIPLIER</small></div>
      </section>
      <section className="profile-grid">
        <form className="profile-form" onSubmit={save}>
          <div className="panel-title"><span>01</span> PROFILE DETAILS</div>
          <label>DISPLAY NAME<input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} maxLength={40} /></label>
          <label>USERNAME<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} maxLength={24} /></label>
          <label>BIO<textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} maxLength={180} /></label>
          <div className={profile.walletVerified ? "wallet-proof verified" : "wallet-proof"}>
            <span>{profile.walletVerified ? "✓ VERIFIED SOLANA WALLET" : "WALLET VERIFICATION REQUIRED"}</span>
            <b>{profile.walletAddress ? `${profile.walletAddress.slice(0, 6)}…${profile.walletAddress.slice(-5)}` : "No wallet connected"}</b>
            <button className="secondary" type="button" onClick={verifyWallet}>{profile.walletVerified ? "RE-VERIFY WALLET" : "VERIFY WITH PHANTOM"}</button>
          </div>
          <button className="primary full" type="submit">SAVE PROFILE</button><small className="form-status">{status}</small>
        </form>
        <div className="ref-card">
          <div className="panel-title"><span>02</span> REFERRAL ENGINE</div>
          <h2>Bring players.<br /><em>Build your multiplier.</em></h2>
          <p>Your referred players earn at 1.25×. You earn 250 points when they join and a 10% bonus from their future eligible activity.</p>
          <div className="ref-code"><span>YOUR CODE</span><b>{profile.referralCode}</b></div>
          <button className="secondary" onClick={copyReferral}>COPY REFERRAL LINK</button>
          <strong>{profile.referrals} VERIFIED REFERRALS</strong>
        </div>
      </section>
      <section className="history-panel">
        <div><div className="section-kicker">POINTS LEDGER / LAST 30 EVENTS</div><h2>Activity history</h2></div>
        <div>{profile.history.map((item, index) => <article key={`${item.created_at}-${index}`}><span>{new Date(item.created_at).toLocaleDateString()}</span><b>{item.description}</b><small>{item.multiplier.toFixed(2)}×</small><strong>+{item.points} PTS</strong></article>)}</div>
      </section>
    </>}
  </main>;
}
