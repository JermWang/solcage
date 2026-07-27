"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

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

type ProtocolConfig = {
  network: string;
  rpcHost: string;
  programId: string | null;
  vaultAuthority: string | null;
  programConfigured: boolean;
  transactionMode: "read-only" | "configuration-required";
};

export default function LendingPage() {
  const [asset, setAsset] = useState(() => {
    if (typeof window === "undefined") return collateralAssets[0];
    const requestedAsset = new URLSearchParams(window.location.search).get("asset")?.toUpperCase();
    return collateralAssets.find((item) => item.symbol === requestedAsset) ?? collateralAssets[0];
  });
  const [amount, setAmount] = useState("0");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [wallet, setWallet] = useState<string | null>(null);
  const [config, setConfig] = useState<ProtocolConfig | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then((response) => response.json()),
      fetch("/api/protocol/config").then((response) => response.json()),
    ]).then(([profile, protocol]) => {
      setWallet(profile.walletVerifiedAt ? profile.walletAddress : null);
      setConfig(protocol);
    }).catch(() => undefined);
  }, []);

  const amountNumber = Number(amount) || 0;
  const maxBorrow = useMemo(() => amountNumber * asset.ltv / 100, [amountNumber, asset.ltv]);
  const actionLabel = !wallet
    ? "Verify wallet to continue"
    : !config?.programConfigured
      ? "Program-controlled vault required"
      : asset.status !== "ACTIVE"
        ? `${asset.symbol} is under risk review`
        : "Transaction client awaiting audited program";

  return (
    <CasinoChrome active="lending">
      <div className="lending-app-content">
        <header className="lending-dashboard-head">
          <div><span>MEMECOIN CREDIT / SOLANA</span><h1>The Cage</h1><p>Deposit eligible collateral, monitor position health, borrow against the approved value, and withdraw after obligations are cleared.</p></div>
          <div className="protocol-status">
            <span><i className={config?.programConfigured ? "online" : ""} /> PROGRAM</span>
            <b>{config?.programConfigured ? "READ ONLY" : "NOT DEPLOYED"}</b>
            <small>{config?.network ?? "mainnet-beta"} · {config?.rpcHost ?? "loading"}</small>
          </div>
        </header>

        <section className="lending-metrics">
          <article><span>TOTAL COLLATERAL</span><b>$0.00</b><small>On-chain vault value</small></article>
          <article><span>OUTSTANDING CREDIT</span><b>$0.00</b><small>Across active positions</small></article>
          <article><span>YOUR HEALTH</span><b>—</b><small>No open position</small></article>
          <article><span>NETWORK</span><b>SOLANA</b><small>{config?.network ?? "mainnet-beta"}</small></article>
        </section>

        <section className="lending-terminal">
          <div className="collateral-market">
            <header><div><span>COLLATERAL MARKET</span><h2>Eligible assets</h2></div><small>$10M CAP FLOOR + LIQUIDITY GATES</small></header>
            <div className="collateral-table-head"><span>ASSET</span><span>MARKET CAP</span><span>LIQUIDITY</span><span>MAX LTV</span><span>STATUS</span></div>
            <div className="collateral-table">
              {collateralAssets.map((item) => (
                <button key={item.symbol} className={asset.symbol === item.symbol ? "selected" : ""} onClick={() => setAsset(item)}>
                  <span className="asset-cell">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt="" />
                    <span><b>${item.symbol}</b><small>{item.name}</small></span>
                  </span>
                  <span>{item.cap}</span><span>{item.liquidity}</span><strong>{item.ltv ? `${item.ltv}%` : "—"}</strong><em className={item.status.toLowerCase()}>{item.status}</em>
                </button>
              ))}
            </div>
          </div>

          <aside className="position-composer">
            <header><span>POSITION TERMINAL</span><b>{asset.symbol}</b></header>
            <div className="position-tabs"><button className={mode === "deposit" ? "active" : ""} onClick={() => setMode("deposit")}>DEPOSIT</button><button className={mode === "withdraw" ? "active" : ""} onClick={() => setMode("withdraw")}>WITHDRAW</button></div>
            <label>COLLATERAL AMOUNT <span>AVAILABLE —</span></label>
            <div className="position-amount">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Collateral amount" />
              <span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.image} alt="" />{asset.symbol}
              </span>
            </div>
            <div className="position-summary">
              <p><span>Asset status</span><b className={asset.status === "ACTIVE" ? "good" : ""}>{asset.status}</b></p>
              <p><span>Maximum LTV</span><b>{asset.ltv ? `${asset.ltv}%` : "Disabled"}</b></p>
              <p><span>Estimated borrow capacity</span><b>{maxBorrow.toFixed(2)} USDC</b></p>
              <p><span>Liquidation threshold</span><b>{asset.ltv ? `${Math.min(asset.ltv + 12, 55)}%` : "—"}</b></p>
            </div>
            <Link className="position-action disabled" href={!wallet ? "/profile" : "#protocol-readiness"}>{actionLabel}</Link>
            <small className="position-note">Transactions remain disabled unless a verified wallet, deployed program, vault authority, supported mint, and active risk configuration are all present.</small>
          </aside>
        </section>

        <section className="position-history">
          <header><div><span>YOUR POSITIONS</span><h2>Position history</h2></div><b>0 ACTIVE</b></header>
          <div><span>NO ON-CHAIN POSITIONS FOUND</span><p>Verified deposits, borrows, repayments, liquidations, and withdrawals will appear here by transaction signature.</p></div>
        </section>

        <section className="protocol-readiness" id="protocol-readiness">
          <div><span>PROTOCOL READINESS</span><h2>Real funds require a real program.</h2></div>
          <div className="readiness-list">
            <p className="done"><i>✓</i><span><b>Persistent identity and history</b><small>Profiles, referrals, rewards, and event history are backed by PostgreSQL.</small></span></p>
            <p className={config?.programId ? "done" : ""}><i>{config?.programId ? "✓" : "2"}</i><span><b>Lending program deployment</b><small>Program ID must be deployed, audited, and configured for the production environment.</small></span></p>
            <p className={config?.vaultAuthority ? "done" : ""}><i>{config?.vaultAuthority ? "✓" : "3"}</i><span><b>Program-controlled token vaults</b><small>Deposits and withdrawals must use PDAs—not a server hot wallet.</small></span></p>
            <p><i>4</i><span><b>Manipulation-resistant pricing</b><small>Each mint needs executable-liquidity pricing, staleness limits, and liquidation coverage.</small></span></p>
          </div>
        </section>
      </div>
    </CasinoChrome>
  );
}
