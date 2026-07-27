"use client";

import { useEffect, useRef, useState } from "react";
import { SOLCAGE_MINT, shortenMint } from "@/lib/token";

function legacyCopy(value: string) {
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

async function writeClipboard(value: string) {
  // writeText can reject even where it exists — no user activation, a denied
  // permission policy, or a non-secure context. Fall through instead of failing.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // handled by the legacy path below
    }
  }
  return legacyCopy(value);
}

type Status = "idle" | "copied" | "failed";

export function ContractAddress({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const addressRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function reset(after: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), after);
  }

  async function copy() {
    if (await writeClipboard(SOLCAGE_MINT)) {
      setStatus("copied");
      reset(1600);
      return;
    }
    // Nothing could reach the clipboard — surface the address and select it so
    // the address is still one keystroke away rather than a dead button.
    setStatus("failed");
    const node = addressRef.current;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    reset(6000);
  }

  const label = status === "copied" ? "✓" : status === "failed" ? "!" : "⧉";

  return (
    <button
      type="button"
      className={`ca-copy${status === "copied" ? " is-copied" : ""}${status === "failed" ? " is-manual" : ""}${className ? ` ${className}` : ""}`}
      onClick={copy}
      title={SOLCAGE_MINT}
      aria-label={`Copy $SOLCAGE contract address ${SOLCAGE_MINT}`}
    >
      <small>CA</small>
      <code>{shortenMint(SOLCAGE_MINT)}</code>
      <i aria-hidden="true">{label}</i>
      {/* Off-screen but selectable: the full address stays one keystroke away
          without widening the chip inside the nav. */}
      <span className="ca-copy-full" ref={addressRef} aria-hidden="true">{SOLCAGE_MINT}</span>
      <span className="ca-copy-live" role="status" aria-live="polite">
        {status === "copied" ? "Contract address copied" : status === "failed" ? "Address selected — press Ctrl or Cmd + C to copy" : ""}
      </span>
    </button>
  );
}
