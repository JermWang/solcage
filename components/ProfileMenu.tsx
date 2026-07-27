"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signInWithWallet, signOut, switchWallet } from "@/lib/wallet";

type ProfileMenuProps = {
  signedIn: boolean;
  displayName: string;
  walletAddress?: string | null;
  onSignedIn?: (profile: { displayName?: string; points?: number }) => void;
};

export function ProfileMenu({ signedIn, displayName, walletAddress, onSignedIn }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await action();
      if (result && typeof result === "object") onSignedIn?.(result as { displayName?: string; points?: number });
      close();
    } catch (error) {
      setBusy(error instanceof Error ? error.message : "Something went wrong");
      return;
    }
    setBusy("");
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        className="casino-connect"
        onClick={() => run("Connecting…", signInWithWallet)}
      >
        {busy || "Connect wallet"}
      </button>
    );
  }

  const short = walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : null;

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className="casino-profile"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
      >
        {displayName.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="profile-menu-panel" role="menu">
          <div className="profile-menu-head">
            <b>{displayName}</b>
            {short && <code>{short}</code>}
          </div>
          <Link role="menuitem" href="/profile" onClick={close}>Edit profile</Link>
          <Link role="menuitem" href="/leaderboard" onClick={close}>Leaderboard</Link>
          <Link role="menuitem" href="/lending" onClick={close}>Your positions</Link>
          <button role="menuitem" type="button" onClick={() => run("Switching…", switchWallet)}>
            Switch wallet
          </button>
          <button
            role="menuitem"
            type="button"
            className="danger"
            onClick={() => run("Signing out…", async () => {
              await signOut();
              location.assign("/");
            })}
          >
            Sign out
          </button>
          {busy && <small className="profile-menu-status">{busy}</small>}
        </div>
      )}
    </div>
  );
}
