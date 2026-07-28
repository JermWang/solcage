"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  depositSol,
  flushPendingDeposits,
  lamportsToSol,
  readWalletSol,
  solToLamports,
  withdrawSol,
} from "@/lib/wallet";

type Tab = "deposit" | "withdraw";
// Leave a little SOL behind for the network fee when the player taps "Max".
const FEE_HEADROOM = 5_000_000n; // 0.005 SOL

export function Cashier({ open, onClose, onBalance }: {
  open: boolean;
  onClose: () => void;
  onBalance?: (available: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [walletSol, setWalletSol] = useState<bigint | null>(null);
  const [casino, setCasino] = useState<{ available: string; availableRaw: bigint } | null>(null);
  const [walletError, setWalletError] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [balance, wallet] = await Promise.all([
        fetch("/api/wallet/balance").then((r) => (r.ok ? r.json() : null)),
        // Report why this failed rather than leaving a dash on screen forever.
        readWalletSol().then((value) => ({ value }))
          .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "unknown" })),
      ]);
      if (balance && !balance.error) {
        setCasino({ available: balance.balance, availableRaw: BigInt(balance.balanceRaw ?? "0") });
        onBalance?.(balance.balance);
      }
      if ("value" in wallet) {
        setWalletSol(wallet.value);
        setWalletError("");
      } else {
        setWalletError(wallet.error);
      }
    } catch {
      /* leave prior values */
    }
  }, [onBalance]);

  useEffect(() => {
    if (!open) return;
    // Mounted fresh on each open (parent renders conditionally), so state is
    // already clean — the effect only loads balances and wires the Esc key.
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      // Credit anything left stranded by a closed tab or a slow finalization
      // before showing balances, so the numbers are already right.
      const recovered = await flushPendingDeposits().catch(() => 0);
      if (cancelled) return;
      await refresh();
      if (recovered > 0 && !cancelled) {
        setStatus({ kind: "ok", text: "A deposit from earlier has now credited to your balance." });
      }
    })();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, refresh, onClose, busy]);

  if (!open) return null;

  // Deposits leave a little behind for the network fee; withdrawals are of the
  // play balance, which carries no fee for the player.
  const walletMax = walletSol !== null && walletSol > FEE_HEADROOM ? walletSol - FEE_HEADROOM : 0n;
  const spendable = tab === "deposit" ? walletMax : (casino?.availableRaw ?? 0n);

  const setPercent = (percent: number) => {
    if (spendable <= 0n) return setAmount("0");
    const portion = percent >= 100 ? spendable : (spendable * BigInt(percent)) / 100n;
    setAmount(lamportsToSol(portion, 4));
  };

  async function run() {
    setStatus(null);
    let lamports: bigint;
    try {
      lamports = solToLamports(amount);
    } catch (error) {
      return setStatus({ kind: "error", text: error instanceof Error ? error.message : "Invalid amount" });
    }
    if (lamports <= 0n) return setStatus({ kind: "error", text: "Enter an amount" });

    try {
      if (tab === "deposit") {
        setBusy("Approve the transfer in your wallet…");
        await depositSol(lamports, (stage) => {
          setBusy(stage === "signing" ? "Approve the transfer in your wallet…"
            : stage === "confirming" ? "Confirming on Solana…"
            : "Crediting your balance…");
        });
        setStatus({ kind: "ok", text: `Deposited ${amount} SOL. Good luck.` });
      } else {
        setBusy("Sending your withdrawal…");
        await withdrawSol(lamports);
        setStatus({ kind: "ok", text: `Sent ${amount} SOL to your wallet.` });
      }
      setAmount("");
      await refresh();
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="cashier-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="cashier-panel" ref={panelRef} role="dialog" aria-label="Cashier">
        <header className="cashier-head">
          <div className="cashier-tabs">
            <button className={tab === "deposit" ? "active" : ""} onClick={() => { setTab("deposit"); setAmount(""); setStatus(null); }}>Deposit</button>
            <button className={tab === "withdraw" ? "active" : ""} onClick={() => { setTab("withdraw"); setAmount(""); setStatus(null); }}>Withdraw</button>
          </div>
          <button className="cashier-close" onClick={() => !busy && onClose()} aria-label="Close">✕</button>
        </header>

        <div className="cashier-balances">
          <div>
            <span>PLAY BALANCE</span>
            <b>{casino ? casino.available : "…"} SOL</b>
          </div>
          <div>
            <span>{tab === "deposit" ? "IN YOUR WALLET" : "WITHDRAWABLE"}</span>
            <b>{tab === "deposit"
              ? (walletSol !== null ? lamportsToSol(walletSol, 4) : walletError ? "—" : "…")
              : (casino ? casino.available : "…")} SOL</b>
            {tab === "deposit" && walletError && <i className="cashier-warn">Could not read your wallet: {walletError}</i>}
          </div>
        </div>

        <label className="cashier-amount">
          <span>{tab === "deposit" ? "AMOUNT TO DEPOSIT" : "AMOUNT TO WITHDRAW"}</span>
          <div>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={Boolean(busy)}
              aria-label="Amount in SOL"
            />
            <em>SOL</em>
          </div>
          <div className="cashier-percents">
            {[25, 50, 75, 100].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => setPercent(percent)}
                disabled={Boolean(busy) || spendable <= 0n}
              >
                {percent === 100 ? "MAX" : `${percent}%`}
              </button>
            ))}
          </div>
        </label>

        <button className="cashier-action" onClick={run} disabled={Boolean(busy) || !amount}>
          {busy || (tab === "deposit" ? "Deposit SOL" : "Withdraw to my wallet")}
        </button>

        {status && <p className={`cashier-status ${status.kind}`} aria-live="polite">{status.text}</p>}

        <p className="cashier-note">
          {tab === "deposit"
            ? "One tap. Your wallet signs a plain SOL transfer — nothing else is approved."
            : "Withdrawals go straight back to your connected wallet."}
        </p>
      </div>
    </div>
  );
}
