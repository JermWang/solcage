"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type Check = {
  key: string;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

type CustodyConfig = {
  network: string;
  rpcHost: string;
  clientRpcUrl: string;
  custodyAddress: string | null;
  usdcMint: string;
  usdcDecimals: number;
  usdcTokenProgram: string;
  swapMode: "simulated" | "jupiter";
  transactionMode: "enabled" | "launch-gated";
  ready: boolean;
  checks: Check[];
  market: {
    symbol: string;
    name: string;
    mint: string;
    decimals: number;
    tokenProgram: string;
    advanceBps: number;
    maxPositionRaw: string;
    maxActiveLiabilityRaw: string;
    enabled: boolean;
  } | null;
};

type CustodyPosition = {
  id: string;
  symbol: string;
  mint: string;
  decimals: number;
  collateralRaw: string;
  saleProceedsRaw: string | null;
  advanceRaw: string | null;
  reserveRaw: string | null;
  repaidRaw: string;
  repurchaseCostRaw: string | null;
  repurchasedRaw: string | null;
  status: string;
  depositSignature: string;
  sellSignature: string | null;
  advanceSignature: string | null;
  repaySignature: string | null;
  buySignature: string | null;
  claimSignature: string | null;
  failureReason: string | null;
  createdAt: string;
};

type CustodyEvent = {
  position_id: string;
  action: string;
  signature: string | null;
  asset_symbol: string;
  mint_address: string;
  raw_amount: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type CustodySnapshot = {
  positions: CustodyPosition[];
  events: CustodyEvent[];
};

type CustodyAction = "open" | "repay" | "claim";

function formatBaseUnits(raw: string | null, decimals: number, precision = 4) {
  const value = BigInt(raw || "0");
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString()
    .padStart(decimals, "0")
    .slice(0, precision)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function explorerUrl(signature: string, network: string) {
  return `https://solscan.io/tx/${signature}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export default function LendingPage() {
  const [mode, setMode] = useState<CustodyAction>("open");
  const [amount, setAmount] = useState("0");
  const [wallet, setWallet] = useState<string | null>(null);
  const [config, setConfig] = useState<CustodyConfig | null>(null);
  const [snapshot, setSnapshot] = useState<CustodySnapshot>({ positions: [], events: [] });
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState("");

  const refresh = useCallback(async () => {
    const [profileResponse, configResponse, positionsResponse] = await Promise.all([
      fetch("/api/me", { cache: "no-store" }),
      fetch("/api/custody/config", { cache: "no-store" }),
      fetch("/api/custody/positions", { cache: "no-store" }),
    ]);
    const [profile, custody, positions] = await Promise.all([
      profileResponse.json(),
      configResponse.json(),
      positionsResponse.json(),
    ]);
    setWallet(profile.walletVerified ? profile.walletAddress : null);
    if (!custody.error) setConfig(custody);
    if (!positions.error) {
      setSnapshot(positions);
      setSelectedPositionId((current) => current ?? positions.positions?.[0]?.id ?? null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const activePosition = useMemo(
    () => snapshot.positions.find((position) => position.id === selectedPositionId)
      ?? snapshot.positions.find((position) => position.status !== "claimed")
      ?? null,
    [selectedPositionId, snapshot.positions],
  );
  const amountValid = /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount.trim()) && Number(amount) > 0;
  const canOpen = Boolean(
    wallet && config?.ready && config.custodyAddress && config.market?.enabled && amountValid && !submitting,
  );
  const canRepay = Boolean(
    wallet && config?.ready && activePosition?.status === "open" && activePosition.advanceRaw && !submitting,
  );
  const canClaim = Boolean(
    wallet
    && config?.ready
    && activePosition
    && ["repaid", "repurchased"].includes(activePosition.status)
    && !submitting,
  );
  const canSubmit = mode === "open" ? canOpen : mode === "repay" ? canRepay : canClaim;

  const actionLabel = submitting
    ? "Finalizing custody action…"
    : !wallet
      ? "Verify wallet to continue"
      : !config?.ready
        ? "Launch readiness required"
        : mode === "open"
          ? (amountValid ? `OPEN ${config.market?.symbol ?? "TOKEN"} LIQUIDITY` : "Enter collateral amount")
          : mode === "repay"
            ? (activePosition?.status === "open" ? "REPAY USDC ADVANCE" : "Select an open position")
            : (activePosition && ["repaid", "repurchased"].includes(activePosition.status)
                ? `CLAIM ${activePosition.symbol}`
                : "Repay before claiming");

  async function submit() {
    if (!canSubmit || !wallet || !config?.custodyAddress || !config.market) return;
    setSubmitting(true);
    try {
      if (mode === "claim") {
        setTransactionStatus("Checking reserve and reacquiring the owed collateral.");
        const response = await fetch("/api/custody/claims", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ positionId: activePosition?.id }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to complete the claim.");
        setTransactionStatus(`Collateral returned · ${payload.position.claimSignature.slice(0, 8)}…`);
      } else {
        const { sendCustodyDeposit } = await import("@/lib/solana/custodyClient");
        const isRepayment = mode === "repay";
        const transferAmount = isRepayment
          ? formatBaseUnits(activePosition?.advanceRaw ?? "0", config.usdcDecimals, config.usdcDecimals)
          : amount;
        setTransactionStatus("Approve the exact transfer in Phantom.");
        const settlement = await sendCustodyDeposit({
          amount: transferAmount,
          decimals: isRepayment ? config.usdcDecimals : config.market.decimals,
          mint: isRepayment ? config.usdcMint : config.market.mint,
          tokenProgram: isRepayment ? config.usdcTokenProgram : config.market.tokenProgram,
          custodyAddress: config.custodyAddress,
          rpcUrl: config.clientRpcUrl,
          verifiedWallet: wallet,
        });
        setTransactionStatus(isRepayment
          ? "Confirming repayment before buyback."
          : "Confirming deposit, sale, and USDC advance.");
        const endpoint = isRepayment
          ? "/api/custody/repayments/confirm"
          : "/api/custody/deposits/confirm";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(isRepayment
            ? { positionId: activePosition?.id, signature: settlement.signature }
            : { signature: settlement.signature, rawAmount: settlement.rawAmount }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to settle the custody transfer.");
        setSelectedPositionId(payload.position.id);
        setTransactionStatus(isRepayment
          ? `Advance repaid · ${settlement.signature.slice(0, 8)}…`
          : `Position opened · ${settlement.signature.slice(0, 8)}…`);
        setAmount("0");
      }
      await refresh();
    } catch (error) {
      setTransactionStatus(error instanceof Error ? error.message : "Custody action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CasinoChrome active="lending">
      <div className="lending-app-content">
        <header className="lending-dashboard-head">
          <div>
            <span>CUSTODIAL LIQUIDITY / SOLANA</span>
            <h1>The Cage</h1>
            <p>Transfer approved collateral to SolCage custody, receive a risk-adjusted USDC advance, repay it, and claim the same token quantity after buyback. <Link className="lending-docs-link" href="/docs">How it works ↗</Link></p>
          </div>
          <div className="protocol-status">
            <span><i className={config?.ready ? "online" : ""} /> CUSTODY</span>
            <b>{config?.ready ? "OPERATOR ATTESTED" : "LAUNCH GATED"}</b>
            <small>{config?.network ?? "mainnet-beta"} · {config?.rpcHost ?? "loading"}</small>
          </div>
        </header>

        <section className="lending-metrics">
          <article><span>POSITIONS</span><b>{snapshot.positions.length}</b><small>Database-reconciled liabilities</small></article>
          <article><span>CUSTODY EVENTS</span><b>{snapshot.events.length}</b><small>Finalized transfers and executions</small></article>
          <article><span>SETTLEMENT</span><b>{config?.swapMode === "jupiter" ? "JUPITER" : "DEVNET"}</b><small>{config?.ready ? "Ready" : "Launch gated"}</small></article>
          <article><span>NETWORK</span><b>SOLANA</b><small>{config?.network ?? "mainnet-beta"}</small></article>
        </section>

        <section className="lending-terminal">
          <div className="collateral-market">
            <header>
              <div><span>CUSTODY MARKET</span><h2>Launch collateral</h2></div>
              <small>FINALIZED TRANSFERS + RESERVE GATES</small>
            </header>
            <div className="collateral-table-head"><span>ASSET</span><span>NETWORK</span><span>ADVANCE</span><span>SWAPS</span><span>STATUS</span></div>
            <div className="collateral-table">
              {config?.market ? (
                <button className="selected" type="button">
                  <span className="asset-cell">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/media/solcage-pfp.png" alt="" />
                    <span><b>${config.market.symbol}</b><small>{config.market.name}</small></span>
                  </span>
                  <span>{config.network}</span>
                  <strong>{config.market.advanceBps / 100}%</strong>
                  <span>{config.swapMode === "jupiter" ? "Jupiter V2" : "Simulated"}</span>
                  <em className={config.ready ? "active" : "watch"}>{config.ready ? "READY" : "GATED"}</em>
                </button>
              ) : (
                <div className="protocol-empty-position">
                  <span>MARKET CONFIGURATION PENDING</span>
                  <p>The launch mint remains disabled until its account and custody controls are verified.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="position-composer">
            <header><span>CUSTODY TERMINAL</span><b>{config?.market?.symbol ?? "PENDING"}</b></header>
            <div className="position-tabs">
              {(["open", "repay", "claim"] as CustodyAction[]).map((action) => (
                <button key={action} className={mode === action ? "active" : ""} onClick={() => setMode(action)}>
                  {action.toUpperCase()}
                </button>
              ))}
            </div>
            {mode === "open" ? (
              <>
                <label>COLLATERAL AMOUNT <span>WALLET-SIGNED TRANSFER</span></label>
                <div className="position-amount">
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Collateral amount" />
                  <span>{config?.market?.symbol ?? "TOKEN"}</span>
                </div>
              </>
            ) : (
              <label>
                POSITION
                <select
                  value={activePosition?.id ?? ""}
                  onChange={(event) => setSelectedPositionId(event.target.value)}
                  aria-label="Custody position"
                >
                  {snapshot.positions.map((position) => (
                    <option value={position.id} key={position.id}>
                      {position.symbol} · {formatBaseUnits(position.collateralRaw, position.decimals)} · {position.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="position-summary">
              <p><span>Custody operator</span><b className={config?.ready ? "good" : ""}>{config?.ready ? "ATTESTED" : "GATED"}</b></p>
              <p><span>Collateral liability</span><b>{activePosition ? `${formatBaseUnits(activePosition.collateralRaw, activePosition.decimals)} ${activePosition.symbol}` : "—"}</b></p>
              <p><span>USDC advance</span><b>{activePosition ? formatBaseUnits(activePosition.advanceRaw, config?.usdcDecimals ?? 6) : "—"} USDC</b></p>
              <p><span>Position state</span><b>{activePosition?.status.replaceAll("-", " ").toUpperCase() ?? "NONE"}</b></p>
              <p><span>Settlement route</span><b>{config?.swapMode === "jupiter" ? "JUPITER SWAP V2" : "DEVNET ADAPTER"}</b></p>
            </div>
            {!wallet
              ? <Link className="position-action disabled" href="/profile">{actionLabel}</Link>
              : <button className={canSubmit ? "position-action" : "position-action disabled"} type="button" disabled={!canSubmit} onClick={submit}>{actionLabel}</button>}
            <small className="position-note">SolCage custody sells deposited collateral, records the exact token liability and USDC reserve, and will not release a claim until repayment and repurchase are complete.</small>
            {transactionStatus && <p className="position-transaction-status" aria-live="polite">{transactionStatus}</p>}
          </aside>
        </section>

        <section className="position-history">
          <header><div><span>YOUR POSITIONS</span><h2>Custody liabilities</h2></div><b>{snapshot.positions.filter((position) => position.status !== "claimed").length} OPEN</b></header>
          {snapshot.positions.length ? (
            <div className="protocol-position-grid">
              {snapshot.positions.map((position) => (
                <article key={position.id}>
                  <span>{position.symbol} · {position.status.replaceAll("-", " ")}</span>
                  <b>{formatBaseUnits(position.collateralRaw, position.decimals)}</b>
                  <small>{formatBaseUnits(position.advanceRaw, config?.usdcDecimals ?? 6)} USDC advance</small>
                  {position.failureReason && <small>{position.failureReason}</small>}
                  <button type="button" onClick={() => setSelectedPositionId(position.id)}>Select position</button>
                </article>
              ))}
            </div>
          ) : <div className="protocol-empty-position"><span>NO CUSTODY POSITIONS</span><p>A finalized wallet transfer creates the position before any sale or advance is attempted.</p></div>}

          <header className="protocol-history-head"><div><span>AUDIT JOURNAL</span><h2>Finalized custody events</h2></div><b>{snapshot.events.length} RECORDED</b></header>
          {snapshot.events.length ? (
            <div className="protocol-history-list">
              {snapshot.events.map((entry, index) => entry.signature && !entry.signature.startsWith("simulated-") ? (
                <a href={explorerUrl(entry.signature, config?.network ?? "mainnet-beta")} target="_blank" rel="noreferrer" key={`${entry.action}-${entry.signature}`}>
                  <span><b>{entry.action.replaceAll("_", " ").toUpperCase()}</b><small>{new Date(entry.created_at).toLocaleString()}</small></span>
                  <strong>{entry.asset_symbol}</strong>
                  <em>{entry.signature.slice(0, 6)}…{entry.signature.slice(-6)}</em>
                </a>
              ) : (
                <div key={`${entry.action}-${index}`}>
                  <span><b>{entry.action.replaceAll("_", " ").toUpperCase()}</b><small>{new Date(entry.created_at).toLocaleString()}</small></span>
                </div>
              ))}
            </div>
          ) : <div className="protocol-empty-position"><span>NO CUSTODY EVENTS</span><p>Deposits, sales, advances, repayments, buybacks, and claims appear here after reconciliation.</p></div>}
        </section>

        <section className="protocol-readiness" id="protocol-readiness">
          <div><span>LIVE READINESS PROOF</span><h2>Managed custody. Explicit liabilities.</h2><p>The terminal stays disabled if any signer, mint, inventory, network, or swap check fails.</p></div>
          <div className="readiness-list">
            {(config?.checks ?? []).map((check) => (
              <p className={check.status === "pass" ? "done" : ""} key={check.key}>
                <i>{check.status === "pass" ? "✓" : "!"}</i>
                <span><b>{check.label}</b><small>{check.detail}</small></span>
              </p>
            ))}
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
