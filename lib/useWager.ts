"use client";

import { useCallback, useEffect, useState } from "react";

export type WagerState = {
  /** Spendable balance, in whole SOL. */
  balance: number;
  symbol: string;
  minStake: number;
  maxStake: number;
  /** False until the first load completes. */
  loaded: boolean;
  /** True when the table is taking real wagers. */
  open: boolean;
  refresh: () => Promise<void>;
};

function toNumber(raw: unknown, decimals: number) {
  const value = BigInt(String(raw ?? "0"));
  return Number(value) / 10 ** decimals;
}

/**
 * The player's real spendable balance and the live table limits, read from the
 * same endpoint that enforces them so what a game offers can never exceed what
 * settlement will accept.
 */
export function useWager(): WagerState {
  const [state, setState] = useState({
    balance: 0,
    symbol: "SOL",
    minStake: 0.01,
    maxStake: 0.25,
    loaded: false,
    open: false,
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/balance", { cache: "no-store" });
      if (!response.ok) {
        setState((current) => ({ ...current, loaded: true }));
        return;
      }
      const data = await response.json();
      if (data.error) {
        setState((current) => ({ ...current, loaded: true }));
        return;
      }
      const decimals = Number(data.decimals ?? 9);
      setState({
        balance: toNumber(data.balanceRaw, decimals),
        symbol: String(data.symbol ?? "SOL"),
        minStake: toNumber(data.limits?.minStakeRaw, decimals) || 0.01,
        maxStake: toNumber(data.limits?.maxStakeRaw, decimals) || 0.25,
        loaded: true,
        open: data.wagering === "open",
      });
    } catch {
      setState((current) => ({ ...current, loaded: true }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();

    // Keep the balance live. A round settled in another tab, a deposit that
    // finalized, or a withdrawal all move it without this page doing anything,
    // so poll gently and re-read the moment the tab is looked at again.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 8_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { ...state, refresh };
}

/** Clamp a stake to the live limits and the player's balance. */
export function clampStake(value: number, wager: WagerState) {
  const ceiling = Math.min(wager.maxStake, wager.balance || wager.maxStake);
  if (!Number.isFinite(value)) return wager.minStake;
  return Math.min(Math.max(value, wager.minStake), Math.max(ceiling, wager.minStake));
}

/** Trim float noise so a stake matches what the server will parse. */
export function roundStake(value: number) {
  return Math.round(value * 1e6) / 1e6;
}
