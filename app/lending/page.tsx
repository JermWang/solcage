"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";
import type { ClientMarket, LendingAction } from "@/lib/solana/lendingClient";

type Asset = {
  symbol: string;
  name: string;
  image: string;
  ltv: number;
  cap: string;
  liquidity: string;
  status: "ACTIVE" | "WATCH";
};

const collateralAssets: Asset[] = [
  { symbol: "FARTCOIN", name: "Fartcoin", image: "/coin-art/fartcoin.webp", ltv: 30, cap: "$100M+", liquidity: "Deep", status: "ACTIVE" },
  { symbol: "BONK", name: "Bonk", image: "/coin-art/bonk.webp", ltv: 35, cap: "$100M+", liquidity: "Deep", status: "ACTIVE" },
  { symbol: "WIF", name: "dogwifhat", image: "/coin-art/wif.jpg", ltv: 30, cap: "$100M+", liquidity: "Deep", status: "ACTIVE" },
  { symbol: "PENGU", name: "Pudgy Penguins", image: "/coin-art/pengu.webp", ltv: 35, cap: "$100M+", liquidity: "Deep", status: "ACTIVE" },
  { symbol: "POPCAT", name: "Popcat", image: "/coin-art/popcat.webp", ltv: 25, cap: "$10M+", liquidity: "Medium", status: "ACTIVE" },
  { symbol: "TRIPLET", name: "Tung Tung Tung Sahur", image: "/coin-art/triplet.webp", ltv: 0, cap: "Monitored", liquidity: "Review", status: "WATCH" },
  { symbol: "KINS", name: "Kintara", image: "/coin-art/kins.webp", ltv: 0, cap: "Monitored", liquidity: "Review", status: "WATCH" },
  { symbol: "JIMOTHY", name: "Jimothy the Raccoon", image: "/coin-art/jimothy.webp", ltv: 0, cap: "Monitored", liquidity: "Review", status: "WATCH" },
];

type ConfiguredMarket = ClientMarket & {
  ltvBps: number;
  liquidationLtvBps: number;
};

type ProtocolConfig = {
  network: string;
  rpcHost: string;
  clientRpcUrl: string;
  programId: string | null;
  vaultAuthority: string | null;
  borrowMint: string | null;
  borrowDecimals: number;
  programConfigured: boolean;
  transactionMode: "enabled" | "configuration-required";
  markets: ConfiguredMarket[];
};

type ProtocolPosition = {
  symbol: string;
  mint: string;
  decimals: number;
  collateralAmount: string;
  debtAmount: string;
  positionAddress: string;
};

type ProtocolHistory = {
  signature: string;
  action: LendingAction;
  asset_symbol: string;
  mint_address: string;
  raw_amount: string;
  slot: string;
  block_time: string | null;
  status: string;
  created_at: string;
};

type ProtocolData = {
  history: ProtocolHistory[];
  positions: ProtocolPosition[];
  reconciliationStatus: "connected" | "configuration-required" | "rpc-unavailable";
};

function formatBaseUnits(raw: string, decimals: number, precision = 4) {
  const value = BigInt(raw || "0");
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export default function LendingPage() {
  const [asset, setAsset] = useState(() => {
    if (typeof window === "undefined") return collateralAssets[0];
    const requestedAsset = new URLSearchParams(window.location.search).get("asset")?.toUpperCase();
    return collateralAssets.find((item) => item.symbol === requestedAsset) ?? collateralAssets[0];
  });
  const [amount, setAmount] = useState("0");
  const [mode, setMode] = useState<LendingAction>("deposit");
  const [wallet, setWallet] = useState<string | null>(null);
  const [config, setConfig] = useState<ProtocolConfig | null>(null);
  const [protocolData, setProtocolData] = useState<ProtocolData>({
    history: [],
    positions: [],
    reconciliationStatus: "configuration-required",
  });
  const [submitting, setSubmitting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState("");

  const refreshProtocolData = useCallback(async () => {
    const response = await fetch("/api/protocol/transactions", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setProtocolData(payload);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then((response) => response.json()),
      fetch("/api/protocol/config").then((response) => response.json()),
      fetch("/api/protocol/transactions", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([profile, protocol, snapshot]) => {
      setWallet(profile.walletVerified ? profile.walletAddress : null);
      setConfig(protocol);
      if (!snapshot.error) setProtocolData(snapshot);
    }).catch(() => undefined);
  }, [refreshProtocolData]);

  const configuredMarket = useMemo(
    () => config?.markets.find((market) => market.symbol === asset.symbol && market.enabled) ?? null,
    [asset.symbol, config],
  );
  const displayLtv = configuredMarket ? configuredMarket.ltvBps / 100 : asset.ltv;
  const amountNumber = Number(amount) || 0;
  const maxBorrow = useMemo(
    () => amountNumber * displayLtv / 100,
    [amountNumber, displayLtv],
  );
  const openPosition = protocolData.positions.find((position) => position.symbol === asset.symbol);
  const canSubmit = Boolean(
    wallet
    && config?.transactionMode === "enabled"
    && config.programId
    && config.borrowMint
    && configuredMarket
    && asset.status === "ACTIVE"
    && !submitting,
  );
  const actionLabel = submitting
    ? "Confirming on Solana…"
    : !wallet
      ? "Verify wallet to continue"
      : config?.transactionMode !== "enabled"
        ? "Program configuration required"
        : !configuredMarket
          ? `${asset.symbol} market is not enabled`
          : asset.status !== "ACTIVE"
            ? `${asset.symbol} is under risk review`
            : `${mode} ${mode === "borrow" || mode === "repay" ? "USDC" : asset.symbol}`;

  async function submitPosition() {
    if (!canSubmit || !wallet || !config?.programId || !config.borrowMint || !configuredMarket) return;
    setSubmitting(true);
    setTransactionStatus("Approve the transaction in Phantom.");
    try {
      const { sendLendingTransaction } = await import("@/lib/solana/lendingClient");
      const settlement = await sendLendingTransaction({
        action: mode,
        amount,
        programId: config.programId,
        borrowMint: config.borrowMint,
        borrowDecimals: config.borrowDecimals,
        rpcUrl: config.clientRpcUrl,
        verifiedWallet: wallet,
        market: configuredMarket,
      });
      setTransactionStatus("Reconciling the confirmed transaction with your SolCage history.");
      const response = await fetch("/api/protocol/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature: settlement.signature }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to reconcile the transaction.");
      await refreshProtocolData();
      setTransactionStatus(`${mode[0].toUpperCase()}${mode.slice(1)} confirmed · ${settlement.signature.slice(0, 8)}…`);
      setAmount("0");
    } catch (error) {
      setTransactionStatus(error instanceof Error ? error.message : "Transaction cancelled.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CasinoChrome active="lending">
      <div className="lending-app-content">
        <header className="lending-dashboard-head">
          <div><span>MEMECOIN CREDIT / SOLANA</span><h1>The Cage</h1><p>Deposit eligible collateral, monitor position health, borrow against the approved value, and withdraw after obligations are cleared.</p></div>
          <div className="protocol-status">
            <span><i className={config?.transactionMode === "enabled" ? "online" : ""} /> PROGRAM</span>
            <b>{config?.transactionMode === "enabled" ? "TRANSACTIONS ENABLED" : "CONFIGURATION REQUIRED"}</b>
            <small>{config?.network ?? "mainnet-beta"} · {config?.rpcHost ?? "loading"}</small>
          </div>
        </header>

        <section className="lending-metrics">
          <article><span>OPEN POSITIONS</span><b>{protocolData.positions.length}</b><small>Reconciled from program accounts</small></article>
          <article><span>CONFIRMED ACTIONS</span><b>{protocolData.history.length}</b><small>Stored by Solana signature</small></article>
          <article><span>YOUR HEALTH</span><b>{protocolData.positions.some((position) => BigInt(position.debtAmount) > 0n) ? "ACTIVE" : "CLEAR"}</b><small>{protocolData.reconciliationStatus.replaceAll("-", " ")}</small></article>
          <article><span>NETWORK</span><b>SOLANA</b><small>{config?.network ?? "mainnet-beta"}</small></article>
        </section>

        <section className="lending-terminal">
          <div className="collateral-market">
            <header><div><span>COLLATERAL MARKET</span><h2>Eligible assets</h2></div><small>$10M CAP FLOOR + LIQUIDITY GATES</small></header>
            <div className="collateral-table-head"><span>ASSET</span><span>MARKET CAP</span><span>LIQUIDITY</span><span>MAX LTV</span><span>STATUS</span></div>
            <div className="collateral-table">
              {collateralAssets.map((item) => {
                const liveMarket = config?.markets.find((market) => market.symbol === item.symbol && market.enabled);
                const status = liveMarket && item.status === "ACTIVE" ? "ACTIVE" : "WATCH";
                const ltv = liveMarket ? liveMarket.ltvBps / 100 : item.ltv;
                return (
                  <button key={item.symbol} className={asset.symbol === item.symbol ? "selected" : ""} onClick={() => setAsset(item)}>
                    <span className="asset-cell">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt="" />
                      <span><b>${item.symbol}</b><small>{item.name}</small></span>
                    </span>
                    <span>{item.cap}</span><span>{item.liquidity}</span><strong>{ltv ? `${ltv}%` : "—"}</strong><em className={status.toLowerCase()}>{status}</em>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="position-composer">
            <header><span>POSITION TERMINAL</span><b>{asset.symbol}</b></header>
            <div className="position-tabs">
              {(["deposit", "borrow", "repay", "withdraw"] as LendingAction[]).map((action) => (
                <button key={action} className={mode === action ? "active" : ""} onClick={() => setMode(action)}>{action.toUpperCase()}</button>
              ))}
            </div>
            <label>{mode === "borrow" || mode === "repay" ? "USDC AMOUNT" : "COLLATERAL AMOUNT"} <span>ON-CHAIN {openPosition ? formatBaseUnits(openPosition.collateralAmount, openPosition.decimals) : "0"} {asset.symbol}</span></label>
            <div className="position-amount">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Collateral amount" />
              <span>
                {mode === "deposit" || mode === "withdraw" ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.image} alt="" />{asset.symbol}
                  </>
                ) : "USDC"}
              </span>
            </div>
            <div className="position-summary">
              <p><span>Market configuration</span><b className={configuredMarket ? "good" : ""}>{configuredMarket ? "ENABLED" : "NOT ENABLED"}</b></p>
              <p><span>Maximum LTV</span><b>{displayLtv ? `${displayLtv}%` : "Disabled"}</b></p>
              <p><span>{mode === "borrow" ? "Requested credit" : "Estimated borrow capacity"}</span><b>{mode === "borrow" ? amountNumber.toFixed(2) : maxBorrow.toFixed(2)} USDC</b></p>
              <p><span>Liquidation threshold</span><b>{configuredMarket ? `${configuredMarket.liquidationLtvBps / 100}%` : "—"}</b></p>
            </div>
            {!wallet
              ? <Link className="position-action disabled" href="/profile">{actionLabel}</Link>
              : <button className={canSubmit ? "position-action" : "position-action disabled"} type="button" disabled={!canSubmit} onClick={submitPosition}>{actionLabel}</button>}
            <small className="position-note">Every accepted action must be signed by your verified wallet, confirmed by Solana, matched to a configured program market, and persisted by transaction signature.</small>
            {transactionStatus && <p className="position-transaction-status" aria-live="polite">{transactionStatus}</p>}
          </aside>
        </section>

        <section className="position-history">
          <header><div><span>YOUR POSITIONS</span><h2>On-chain activity</h2></div><b>{protocolData.positions.length} ACTIVE</b></header>
          {protocolData.history.length ? (
            <div className="protocol-history-list">
              {protocolData.history.map((entry) => {
                const decimals = config?.markets.find((market) => market.mint === entry.mint_address)?.decimals
                  ?? config?.borrowDecimals
                  ?? 6;
                return (
                  <a href={`https://solscan.io/tx/${entry.signature}`} target="_blank" rel="noreferrer" key={entry.signature}>
                    <span><b>{entry.action.toUpperCase()} {entry.asset_symbol}</b><small>{new Date(entry.created_at).toLocaleString()}</small></span>
                    <strong>{formatBaseUnits(entry.raw_amount, decimals)}</strong>
                    <em>{entry.signature.slice(0, 6)}…{entry.signature.slice(-6)}</em>
                  </a>
                );
              })}
            </div>
          ) : (
            <div><span>NO ON-CHAIN POSITIONS FOUND</span><p>Confirmed deposits and withdrawals appear here after their program instruction and verified signer are reconciled from Solana.</p></div>
          )}
        </section>

        <section className="protocol-readiness" id="protocol-readiness">
          <div><span>PROTOCOL CONTROLS</span><h2>Program-owned funds. Verifiable state.</h2></div>
          <div className="readiness-list">
            <p className="done"><i>✓</i><span><b>Persistent identity and history</b><small>Profiles, referrals, rewards, games, and program actions are backed by PostgreSQL.</small></span></p>
            <p className={config?.programId ? "done" : ""}><i>{config?.programId ? "✓" : "2"}</i><span><b>Lending program deployment</b><small>The configured program ID controls the protocol state and instruction surface.</small></span></p>
            <p className={configuredMarket ? "done" : ""}><i>{configuredMarket ? "✓" : "3"}</i><span><b>Program-controlled token vaults</b><small>Collateral vault authority is a market PDA, never a server hot wallet.</small></span></p>
            <p className={configuredMarket?.priceFeedAccount ? "done" : ""}><i>{configuredMarket?.priceFeedAccount ? "✓" : "4"}</i><span><b>Manipulation-resistant pricing</b><small>Enabled markets require a Pyth feed ID, staleness limit, confidence limit, and liquidation threshold.</small></span></p>
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
