"use client";

import { useEffect, useRef, useState } from "react";
import { SOLCAGE_MINT, shortenMint } from "@/lib/token";

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  // Non-secure contexts have no async clipboard; fall back to a throwaway node.
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  return copied;
}

export function ContractAddress({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let ok = false;
    try {
      ok = await writeClipboard(SOLCAGE_MINT);
    } catch {
      ok = false;
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className={`ca-copy${copied ? " is-copied" : ""}${className ? ` ${className}` : ""}`}
      onClick={copy}
      title={SOLCAGE_MINT}
      aria-label={`Copy $SOLCAGE contract address ${SOLCAGE_MINT}`}
    >
      <small>CA</small>
      <code>{shortenMint(SOLCAGE_MINT)}</code>
      <i aria-hidden="true">{copied ? "✓" : "⧉"}</i>
      <span className="ca-copy-live" role="status" aria-live="polite">
        {copied ? "Contract address copied" : ""}
      </span>
    </button>
  );
}
