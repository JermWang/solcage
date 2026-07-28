"use client";

import { useEffect, useState } from "react";
import { gameHint } from "@/lib/game-hints";

const OPT_OUT_KEY = "solcage:hide-beginner-tips";

/**
 * Beginner guidance for a table, shown by default and dismissible.
 *
 * The opt-out is global rather than per-game: someone who turns tips off has
 * said they don't want them anywhere. A small "How to play" button always
 * remains so the panel can be brought back.
 */
export function GameHints({ game }: { game: string }) {
  const hint = gameHint(game);
  // Visible by default so the guidance is in the server-rendered page and is
  // there the instant a new player lands. Anyone who opted out has it removed
  // on the first client tick.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Deferred a tick: reading storage synchronously here would set state
    // during the effect and cascade a re-render.
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(OPT_OUT_KEY) === "1") setHidden(true);
      } catch {
        /* storage blocked — leave the tips showing */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(next: boolean) {
    setHidden(next);
    try {
      if (next) window.localStorage.setItem(OPT_OUT_KEY, "1");
      else window.localStorage.removeItem(OPT_OUT_KEY);
    } catch {
      /* storage blocked — the choice still holds for this visit */
    }
  }

  if (!hint) return null;

  if (hidden) {
    return (
      <button type="button" className="hints-reopen" onClick={() => choose(false)}>
        ? How to play
      </button>
    );
  }

  return (
    <aside className="game-hints" aria-label={`How to play ${hint.title}`}>
      <header>
        <div>
          <span>NEW TO THIS?</span>
          <h2>{hint.title}</h2>
        </div>
        <button type="button" onClick={() => choose(true)} aria-label="Hide beginner tips">
          Hide tips ✕
        </button>
      </header>
      <p className="game-hints-summary">{hint.summary}</p>
      <ol>
        {hint.steps.map((step, index) => (
          <li key={index}><b>{index + 1}</b><span>{step}</span></li>
        ))}
      </ol>
      <p className="game-hints-tip"><b>Tip</b> {hint.tip}</p>
    </aside>
  );
}
