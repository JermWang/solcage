"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type History = { kind: string; points: number; multiplier: number; description: string; created_at: string };
type Profile = { username: string; displayName: string; avatarUrl: string | null; bio: string; walletAddress: string | null; referralCode: string; points: number; rank: number; referrals: number; multiplier: number; history: History[] };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ username: "", displayName: "", bio: "", walletAddress: "", avatarUrl: "" });
  const [status, setStatus] = useState("Loading your profile…");
  useEffect(() => { fetch("/api/me").then(r => r.json()).then((data) => { if (data.error) return setStatus(data.error); setProfile(data); setForm({ username: data.username, displayName: data.displayName, bio: data.bio, walletAddress: data.walletAddress ?? "", avatarUrl: data.avatarUrl ?? "" }); setStatus(""); }); }, []);
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
  return <main className="account-page">
    <nav className="account-nav"><Link className="brand" href="/"><span className="brand-mark">SC</span><span>SOLCAGE</span></Link><div><Link href="/">Floor</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/profile">Profile</Link></div></nav>
    {!profile ? <div className="profile-loading">{status}</div> : <>
      <section className="profile-top">
        <div className="profile-avatar">{form.avatarUrl ? <Image src={form.avatarUrl} alt="Your profile" width={145} height={145} unoptimized /> : <span>{form.displayName.slice(0, 1)}</span>}<label>CHANGE PFP<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={avatar} /></label></div>
        <div><div className="section-kicker">PLAYER PROFILE / SEASON ZERO</div><h1>{profile.displayName}</h1><p>@{profile.username} · GLOBAL RANK #{profile.rank}</p></div>
        <div className="profile-score"><span>LOYALTY BALANCE</span><b>{profile.points.toLocaleString()}</b><small>POINTS · {profile.multiplier.toFixed(2)}× MULTIPLIER</small></div>
      </section>
      <section className="profile-grid">
        <form className="profile-form" onSubmit={save}>
          <div className="panel-title"><span>01</span> PROFILE DETAILS</div>
          <label>DISPLAY NAME<input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} maxLength={40} /></label>
          <label>USERNAME<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} maxLength={24} /></label>
          <label>BIO<textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} maxLength={180} /></label>
          <label>SOLANA WALLET<input value={form.walletAddress} onChange={e => setForm({ ...form, walletAddress: e.target.value })} placeholder="Optional public address" /></label>
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
