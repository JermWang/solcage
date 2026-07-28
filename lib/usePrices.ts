"use client";

import { useCallback, useEffect, useState } from "react";

export type CollateralQuote = {
  symbol: string;
  name: string;
  mint: string;
  advanceBps: number;
  enabled: boolean;
  usdPrice: number;
  priceChange24h: number | null;
};

export type PriceState = {
  sol: { usdPrice: number; priceChange24h: number | null } | null;
  collateral: CollateralQuote[];
  /** False until the first successful load. */
  loaded: boolean;
  refresh: () => Promise<void>;
};

/**
 * Live USD prices, refreshed on an interval and whenever the tab is looked at
 * again. Prices are the one figure on the site that moves without the player
 * doing anything, so leaving them fixed at page load makes the whole page look
 * stale within a minute.
 */
export function usePrices(pollMs = 30_000): PriceState {
  const [state, setState] = useState<{
    sol: PriceState["sol"];
    collateral: CollateralQuote[];
    loaded: boolean;
  }>({ sol: null, collateral: [], loaded: false });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/prices", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (data.error) return;
      setState({
        sol: data.sol ?? null,
        collateral: Array.isArray(data.collateral) ? data.collateral : [],
        loaded: true,
      });
    } catch {
      /* keep the last good prices rather than blanking the page */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pollMs]);

  return { ...state, refresh };
}

/** Format a USD price with enough precision for sub-cent memecoins. */
export function formatUsd(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(9).replace(/0+$/, "")}`;
}

/** Convert a SOL amount to a USD string, or null when no price is known. */
export function solToUsd(amountSol: number, solPrice: number | null | undefined): string | null {
  if (!solPrice || !Number.isFinite(amountSol)) return null;
  const value = amountSol * solPrice;
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}
