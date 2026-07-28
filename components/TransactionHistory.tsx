"use client";

import { useCallback, useEffect, useState } from "react";

type Txn = {
  id: string;
  kind: "deposit" | "withdrawal" | "lending";
  label: string;
  detail: string;
  amount: string;
  symbol: string;
  signature: string | null;
  status: string;
  createdAt: string;
};

function explorerUrl(signature: string, network: string) {
  return `https://solscan.io/tx/${signature}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

/**
 * Every on-chain movement for the signed-in player — deposits, withdrawals and
 * each step of a lending position — each linking to its transaction on Solscan.
 *
 * `pollMs` keeps it live while a multi-step lending flow is running; the feed is
 * the record afterwards, so the same component serves both.
 */
export function TransactionHistory({ pollMs = 0, limit }: { pollMs?: number; limit?: number }) {
  const [rows, setRows] = useState<Txn[] | null>(null);
  const [network, setNetwork] = useState("mainnet-beta");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/transactions", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.error) return;
      setRows(payload.transactions ?? []);
      if (payload.network) setNetwork(payload.network);
    } catch {
      /* keep whatever is on screen */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    if (!pollMs) return () => { cancelled = true; };
    const timer = window.setInterval(() => { void load(); }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, pollMs]);

  const shown = limit && rows ? rows.slice(0, limit) : rows;

  return (
    <div className="txn-feed">
      {shown === null ? (
        <p className="txn-empty">Loading your transactions…</p>
      ) : shown.length === 0 ? (
        <p className="txn-empty">No transactions yet. Deposits, withdrawals and lending steps appear here with a link to each one on Solscan.</p>
      ) : shown.map((row) => {
        const body = (
          <>
            <span className={`txn-kind ${row.kind}`}>{row.kind}</span>
            <span className="txn-main">
              <b>{row.label}</b>
              <small>{row.detail} · {new Date(row.createdAt).toLocaleString()}</small>
            </span>
            <strong>{row.amount} {row.symbol}</strong>
            {row.signature
              ? <em className="txn-link">{row.signature.slice(0, 6)}…{row.signature.slice(-6)} ↗</em>
              : <em className="txn-pending">{row.status}</em>}
          </>
        );
        return row.signature ? (
          <a
            key={row.id}
            className="txn-row"
            href={explorerUrl(row.signature, network)}
            target="_blank"
            rel="noreferrer"
            title="View this transaction on Solscan"
          >
            {body}
          </a>
        ) : (
          <div key={row.id} className="txn-row">{body}</div>
        );
      })}
    </div>
  );
}
