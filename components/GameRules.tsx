"use client";

import { useEffect, useState } from "react";
import { gameRules } from "@/lib/game-rules";

/**
 * Full rules for a table, behind an always-available button.
 *
 * Separate from the beginner hints: those are a nudge you can turn off, this is
 * the complete ruleset and paytable, and it never goes away.
 */
export function GameRules({ game }: { game: string }) {
  const rules = gameRules(game);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!rules) return null;

  return (
    <>
      <button type="button" className="rules-button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">ⓘ</span> Rules &amp; payouts
      </button>

      {open && (
        <div
          className="rules-overlay"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="rules-panel" role="dialog" aria-modal="true" aria-label={`${rules.title} rules`}>
            <header>
              <div>
                <span>{rules.variant}</span>
                <h2>{rules.title}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close rules">✕</button>
            </header>

            <p className="rules-rtp"><b>Return to player</b> {rules.rtp}</p>

            <div className="rules-body">
              {rules.sections.map((section) => (
                <section key={section.heading}>
                  <h3>{section.heading}</h3>
                  {section.body && <p>{section.body}</p>}
                  {section.list && (
                    <ol>
                      {section.list.map((item, index) => <li key={index}>{item}</li>)}
                    </ol>
                  )}
                  {section.table && (
                    <div className="rules-table-wrap">
                      <table>
                        <thead>
                          <tr><th>{section.table.columns[0]}</th><th>{section.table.columns[1]}</th></tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map(([left, right]) => (
                            <tr key={left}><td>{left}</td><td>{right}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
