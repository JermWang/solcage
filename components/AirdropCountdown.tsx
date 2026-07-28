"use client";

import { useEffect, useState } from "react";

/**
 * Countdown to the loyalty airdrop.
 *
 * The target is a fixed instant supplied by the server-side env rather than
 * "365 days from whenever this component mounted" — otherwise every visitor
 * would see a different deadline and it would reset on each page load.
 */
/* Served from /api/site-config: NEXT_PUBLIC_ values are not inlined into client
   bundles here, so reading process.env in the browser would yield undefined. */

function remaining(target: number) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1_000),
    done: ms <= 0,
  };
}

export function AirdropCountdown({ compact = false }: { compact?: boolean }) {
  const [target, setTarget] = useState<number>(NaN);
  const [left, setLeft] = useState<ReturnType<typeof remaining> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/site-config", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && data.airdropAt) setTarget(Date.parse(data.airdropAt));
      } catch { /* no date, no countdown */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const tick = () => setLeft(remaining(target));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [target]);

  // No configured date means nothing to promise, so show nothing at all.
  if (!Number.isFinite(target) || !left) return null;

  if (left.done) {
    return (
      <div className={`airdrop-countdown ${compact ? "compact" : ""}`}>
        <span>LOYALTY AIRDROP</span>
        <b className="airdrop-live">SNAPSHOT TAKEN</b>
      </div>
    );
  }

  return (
    <div className={`airdrop-countdown ${compact ? "compact" : ""}`}>
      <span>LOYALTY AIRDROP</span>
      <div className="airdrop-units">
        {[
          [left.days, "D"],
          [left.hours, "H"],
          [left.minutes, "M"],
          [left.seconds, "S"],
        ].map(([value, unit]) => (
          <b key={unit as string}>
            {String(value).padStart(2, "0")}<em>{unit}</em>
          </b>
        ))}
      </div>
      {!compact && <small>Your XP at the snapshot decides your share. Every round and lending position adds to it.</small>}
    </div>
  );
}
