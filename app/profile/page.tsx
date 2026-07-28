"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ContractAddress } from "@/components/ContractAddress";
import { XLink } from "@/components/XLink";
import { TransactionHistory } from "@/components/TransactionHistory";
import { signInWithWallet, signOut as walletSignOut, switchWallet as walletSwitch } from "@/lib/wallet";

type History = { kind: string; points: number; multiplier: number; description: string; created_at: string };
type Profile = { username: string; displayName: string; avatarUrl: string | null; bio: string; walletAddress: string | null; walletVerified: boolean; referralCode: string; points: number; rank: number | null; referrals: number; multiplier: number; history: History[] };

/** Largest file accepted from the picker. Anything under this is downscaled. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Longest data URL the /api/me avatar validator accepts, with headroom. */
const AVATAR_URL_BUDGET = 480_000;

async function loadBitmap(file: File) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  // Safari fallback: decode through an object URL instead.
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function shrinkImage(file: File, maxEdge: number) {
  const source = await loadBitmap(file);
  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) throw new Error("empty image");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  // Step the quality down until it fits; every candidate type is one the
  // server validator accepts, and toDataURL falls back to PNG if unsupported.
  for (const [type, quality] of [["image/webp", 0.86], ["image/webp", 0.7], ["image/jpeg", 0.8], ["image/jpeg", 0.6]] as const) {
    const url = canvas.toDataURL(type, quality);
    if (url.length <= AVATAR_URL_BUDGET) return url;
  }
  throw new Error("image too large after resizing");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ username: "", displayName: "", bio: "", avatarUrl: "" });
  const [status, setStatus] = useState("Loading your profile…");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  function adopt(data: Profile) {
    setSignedIn(true);
    setProfile(data);
    setForm({ username: data.username, displayName: data.displayName, bio: data.bio, avatarUrl: data.avatarUrl ?? "" });
  }
  useEffect(() => {
    fetch("/api/me").then(async (response) => {
      if (response.status === 401) { setSignedIn(false); return setStatus(""); }
      const data = await response.json();
      if (data.error) return setStatus(data.error);
      adopt(data);
      setStatus("");
    }).catch(() => setStatus("Unable to reach SolCage."));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setStatus("Saving…");
    const response = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error ?? "Unable to save");
    setProfile(data); setStatus("Profile saved.");
  }
  async function avatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Choose an image file.");
    if (file.size > MAX_AVATAR_BYTES) {
      return setStatus(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Pick one under 5MB.`);
    }
    setStatus("Preparing image…");
    try {
      // Real photos are megabytes; rejecting them made the picker look broken.
      // Downscale and re-encode so any image fits the stored-avatar budget.
      const resized = await shrinkImage(file, 512);
      setForm((value) => ({ ...value, avatarUrl: resized }));
      setStatus("Image ready — press SAVE PROFILE to apply it.");
    } catch {
      setStatus("That image could not be read. Try a PNG, JPEG, or WebP.");
    } finally {
      event.target.value = "";
    }
  }
  async function copyReferral() {
    if (!profile) return;
    const link = `${location.origin}/?ref=${profile.referralCode}`;
    await navigator.clipboard.writeText(link);
    setStatus("Referral link copied.");
  }
  /**
   * A referral link visited before sign-in has no session to attribute, so the
   * code is held client-side and redeemed once the wallet signature lands.
   */
  async function redeemHeldReferral() {
    let code: string | null = null;
    try { code = localStorage.getItem("solcage_ref"); } catch { return; }
    if (!code) return;
    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (result.profile) adopt(result.profile);
    } catch {
      return;
    } finally {
      try { localStorage.removeItem("solcage_ref"); } catch { /* storage blocked */ }
    }
  }

  async function endSession() {
    setStatus("Signing out…");
    try {
      await walletSignOut();
      location.assign("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign out");
    }
  }

  function editProfile() {
    const field = document.getElementById("profile-display-name");
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    (field as HTMLInputElement | null)?.focus({ preventScroll: true });
  }

  async function runWallet(action: () => Promise<Profile>, pending: string) {
    setStatus(pending);
    try {
      adopt(await action());
      setStatus("Wallet ownership verified.");
      await redeemHeldReferral();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet verification cancelled.");
    }
  }

  const verifyWallet = () => runWallet(signInWithWallet, "Connecting to Phantom…");
  const changeWallet = () => runWallet(walletSwitch, "Select a different wallet in Phantom…");
  return <main className="account-page">
    <nav className="account-nav"><Link className="brand" href="/"><BrandMark /><span>SOLCAGE</span></Link><div><Link href="/">Floor</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/profile">Profile</Link></div><div className="nav-social"><ContractAddress /><XLink /></div></nav>
    {signedIn === false ? (
      <section className="signin-gate">
        <div className="section-kicker">SIGN IN WITH SOLANA</div>
        <h1>Connect your wallet.</h1>
        <p>SolCage accounts are wallet-owned. Nothing is created until you sign the verification message — no guest profile, no placeholder identity. Your signature proves ownership and never authorises a transaction.</p>
        <button className="primary" type="button" onClick={verifyWallet}>CONNECT WALLET</button>
        {status && <small className="form-status">{status}</small>}
      </section>
    ) : !profile ? <div className="profile-loading">{status}</div> : <>
      <section className="profile-top">
        <div className="profile-avatar">{form.avatarUrl ? <Image src={form.avatarUrl} alt="Your profile" width={145} height={145} unoptimized /> : <span>{form.displayName.slice(0, 1)}</span>}<label>CHANGE PFP<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={avatar} /></label></div>
        <div><div className="section-kicker">PLAYER PROFILE / SEASON ZERO</div><h1>{profile.displayName}</h1><p>@{profile.username} · {profile.rank ? `GLOBAL RANK #${profile.rank}` : "VERIFY WALLET TO RANK"}</p></div>
        <div className="profile-score"><span>LOYALTY BALANCE</span><b>{profile.points.toLocaleString()}</b><small>POINTS · {profile.multiplier.toFixed(2)}× MULTIPLIER</small></div>
        <div className="profile-actions">
          <button type="button" onClick={editProfile}>EDIT PROFILE</button>
          <button type="button" onClick={changeWallet}>{profile.walletVerified ? "SWITCH WALLET" : "CONNECT WALLET"}</button>
          <button type="button" className="danger" onClick={endSession}>SIGN OUT</button>
        </div>
      </section>
      <section className="profile-grid">
        <form className="profile-form" onSubmit={save}>
          <div className="panel-title"><span>01</span> PROFILE DETAILS</div>
          <label>DISPLAY NAME<input id="profile-display-name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} maxLength={40} /></label>
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
        <div><div className="section-kicker">ON-CHAIN / DEPOSITS · WITHDRAWALS · LENDING</div><h2>Transaction history</h2></div>
        <TransactionHistory />
      </section>
      <section className="history-panel">
        <div><div className="section-kicker">POINTS LEDGER / LAST 30 EVENTS</div><h2>Activity history</h2></div>
        <div>{profile.history.map((item, index) => <article key={`${item.created_at}-${index}`}><span>{new Date(item.created_at).toLocaleDateString()}</span><b>{item.description}</b><small>{item.multiplier.toFixed(2)}×</small><strong>+{item.points} PTS</strong></article>)}</div>
      </section>
    </>}
  </main>;
}
