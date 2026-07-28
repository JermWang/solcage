"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type DepositMenuProps = {
  signedIn: boolean;
  /** Open the SOL cashier. When signed out, route to connect first. */
  onSolana: () => void;
};

/** Nav "Deposit" button that drops down to the two funding paths. */
export function DepositMenu({ signedIn, onSolana }: DepositMenuProps) {
  const [open, setOpen] = useState(false);
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

  function chooseSolana() {
    close();
    if (!signedIn) {
      window.location.href = "/profile";
      return;
    }
    onSolana();
  }

  return (
    <div className="deposit-menu" ref={wrapRef}>
      <button
        type="button"
        className="casino-deposit"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Deposit <span className="deposit-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="deposit-menu-panel" role="menu">
          <button role="menuitem" type="button" onClick={chooseSolana}>
            <b>Solana</b><small>Deposit SOL and play</small>
          </button>
          <Link role="menuitem" href="/lending" onClick={close}>
            <b>Lending</b><small>Borrow against a memecoin</small>
          </Link>
        </div>
      )}
    </div>
  );
}
