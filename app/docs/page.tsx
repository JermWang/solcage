"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CasinoChrome } from "@/components/CasinoChrome";

type DocsConfig = {
  network: string;
  ready: boolean;
  market: { symbol: string; name: string; advanceBps: number } | null;
};

const SECTIONS = [
  ["why", "Why not just sell?"],
  ["overview", "The short version"],
  ["before", "Before you start"],
  ["open", "Opening a position"],
  ["advance", "What you receive"],
  ["repay", "What you owe"],
  ["claim", "Getting your tokens back"],
  ["states", "Position states"],
  ["risk", "Risks worth understanding"],
  ["play", "Playing the floor"],
  ["fair", "Provable fairness"],
  ["faq", "FAQ"],
] as const;

export default function DocsPage() {
  const [config, setConfig] = useState<DocsConfig | null>(null);

  useEffect(() => {
    fetch("/api/custody/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.error) setConfig(payload);
      })
      .catch(() => undefined);
  }, []);

  const symbol = config?.market?.symbol ?? "SOLCAGE";
  const advancePct = (config?.market?.advanceBps ?? 2_000) / 100;
  const reservePct = 100 - advancePct;

  return (
    <CasinoChrome active="docs">
      <div className="docs-page">
        <header className="docs-hero">
          <span>PLAYER DOCUMENTATION</span>
          <h1>How The Cage works</h1>
          <p>
            SolCage turns a memecoin position into spendable USDC without you selling and walking away
            from the token. This page covers everything you need to know as a player: what happens to
            your collateral, what you get, what you owe, and how you get your tokens back.
          </p>
          <div className="docs-hero-meta">
            <div><span>ADVANCE RATE</span><b>{advancePct}%</b></div>
            <div><span>LIABILITY</span><b>TOKEN QUANTITY</b></div>
            <div><span>SETTLEMENT</span><b>USDC</b></div>
            <div><span>ROUNDS</span><b>PROVABLY FAIR</b></div>
          </div>
        </header>

        <div className="docs-layout">
          <aside className="docs-toc">
            <span>ON THIS PAGE</span>
            <nav aria-label="Documentation sections">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`}>{label}</a>
              ))}
            </nav>
          </aside>

          <div className="docs-body">
            <section id="why">
              <h2>Why not just sell?</h2>
              <p>
                You could sell your bag, take the cash to any table, and buy back afterwards. Nothing
                stops you. But that plan has a second decision buried in it, and the second one is the
                hard one — because by the time you make it you have either lost the money or watched
                the entry get away from you. Selling to play is a bet on the tables <em>and</em> a bet
                that you will still be able to rebuild your position afterwards.
              </p>
              <p>SolCage exists to take that second bet off the table.</p>
              <ol className="docs-steps">
                <li>
                  <b>Only the advance is ever at risk</b>
                  <span>
                    {advancePct}% of your position&rsquo;s value reaches you as spendable USDC. The
                    other {reservePct}% is ring-fenced against your position the moment you open it —
                    it never enters your balance and cannot be wagered. A losing night costs you the
                    advance. It cannot cost you your bag.
                  </span>
                </li>
                <li>
                  <b>Your position is counted in tokens, not dollars</b>
                  <span>
                    You get back the exact quantity you deposited. Sell your own supply and a run in
                    the market means rebuying fewer coins than you started with — the same money no
                    longer buys the same position.
                  </span>
                </li>
                <li>
                  <b>Nothing is liquidated and nothing accrues</b>
                  <span>
                    No liquidation price, no funding rate, no clock. You repay exactly what you
                    received, whenever you choose to.
                  </span>
                </li>
              </ol>
              <p className="docs-callout">
                The honest trade: if {symbol} <b>falls</b> while your position is open, you do not
                capture that dip — someone who sold their own supply could have rebought cheaper.
                You are exchanging that discount for a fixed cost, a fixed quantity, and never having
                to time the way back in.
              </p>
            </section>

            <section id="overview">
              <h2>The short version</h2>
              <p>
                You hand approved collateral to SolCage custody, and your deposit funds the advance
                directly: <b>{advancePct}% of its value reaches you as USDC</b>, straight to your
                wallet. The remaining {reservePct}% stays ring-fenced against your position. Repay the
                advance and custody returns <b>the exact quantity of tokens you deposited</b>.
              </p>
              <ol className="docs-steps">
                <li><b>Deposit</b><span>You sign a transfer of {symbol} to custody. Nothing moves without your signature.</span></li>
                <li><b>Advance</b><span>Your deposit is converted at the price of that moment, and {advancePct}% of its value lands in your wallet as USDC.</span></li>
                <li><b>Repay</b><span>You send back the exact USDC advance. No interest, no rolling balance.</span></li>
                <li><b>Claim</b><span>Custody reacquires your token quantity and transfers it to your wallet.</span></li>
              </ol>
              <p className="docs-callout">
                This is not a margin loan. There is no interest meter, no health factor, and nothing
                gets liquidated out from under you while you hold the position.
              </p>
            </section>

            <section id="before">
              <h2>Before you start</h2>
              <ul className="docs-list">
                <li>
                  <b>Verify your wallet.</b> Positions are tied to a wallet you have proven you control.
                  Do this from your <Link href="/profile">profile</Link> before opening anything.
                </li>
                <li>
                  <b>Only approved collateral is accepted.</b> The Cage runs one enabled market at a
                  time — currently <b>${symbol}</b>. Sending any other token to custody is not a
                  position and will not be credited.
                </li>
                <li>
                  <b>The terminal can be gated.</b> If any operational check fails, the action button
                  is disabled and reads <em>launch readiness required</em>. That is deliberate: the
                  system refuses to take your deposit when it cannot complete the round trip. Live
                  status is on the <Link href="/lending">lending page</Link>.
                </li>
                <li>
                  <b>There are size caps.</b> Each position has a maximum, and the market as a whole
                  has a cap on how much collateral can be outstanding at once. Oversized deposits are
                  rejected before anything is converted.
                </li>
              </ul>
            </section>

            <section id="open">
              <h2>Opening a position</h2>
              <p>
                Enter the amount of {symbol} you want to put up and approve the transfer in your
                wallet. You are signing one specific transfer for one specific amount — custody never
                gets a standing allowance over your balance and cannot pull more later.
              </p>
              <p>
                Once that transfer finalizes on Solana, your position exists, and the value of your
                deposit at that moment is what sets your advance.
              </p>
              <p className="docs-callout">
                Worth understanding: your position is denominated in <b>tokens, not dollars</b>. The
                deposit is converted when you open rather than parked in a vault, so from that moment
                what you hold is a claim on the same <em>quantity</em> — which custody reacquires in
                full before your claim releases.
              </p>
            </section>

            <section id="advance">
              <h2>What you receive</h2>
              <p>
                Your deposit&rsquo;s value splits two ways, and both numbers are recorded against your position:
              </p>
              <div className="docs-split">
                <article>
                  <span>YOUR ADVANCE</span>
                  <b>{advancePct}%</b>
                  <small>Sent to your wallet in USDC. Yours to use however you want — it is a real transfer, not a site credit.</small>
                </article>
                <article>
                  <span>HELD RESERVE</span>
                  <b>{reservePct}%</b>
                  <small>Ring-fenced against your position and used to repurchase your tokens. Not lent out to anyone else.</small>
                </article>
              </div>
              <p>
                Every step — deposit, sale, advance, repayment, buyback, claim — is written to the
                audit journal on the lending page with its Solana signature, so you can check each
                transfer on-chain yourself.
              </p>
            </section>

            <section id="repay">
              <h2>What you owe</h2>
              <p>
                You owe <b>exactly the USDC advance you received</b>. Not more. The repayment amount
                is fixed the moment your position opens and does not grow with time.
              </p>
              <ul className="docs-list">
                <li><b>No interest.</b> Holding a position for a week costs the same as holding it for an hour.</li>
                <li><b>No partial repayment.</b> You repay the advance in one transfer, then claim.</li>
                <li><b>No deadline to repay.</b> Nothing force-closes your position on a timer.</li>
              </ul>
              <p>
                The repay tab pre-fills the exact amount owed. You approve that transfer in your
                wallet the same way you approved the deposit.
              </p>
            </section>

            <section id="claim">
              <h2>Getting your tokens back</h2>
              <p>
                After your repayment is confirmed, hit <b>claim</b>. Custody uses the held reserve plus
                your repayment to buy back the exact quantity of {symbol} you originally deposited,
                then transfers it to your wallet.
              </p>
              <p>
                The claim will not release a partial amount. If the buyback cannot acquire your full
                token quantity, the position stays repaid and flagged rather than paying you out
                short, and the reason is shown on your position.
              </p>
              <p className="docs-callout">
                What you get back is the <b>same number of tokens</b>, not the same dollar value. If
                {" "}{symbol} tripled while your position was open, you get your quantity back and that
                appreciation is yours.
              </p>
            </section>

            <section id="states">
              <h2>Position states</h2>
              <p>Your position moves through these states, and the terminal shows the current one:</p>
              <div className="docs-table">
                <div className="docs-table-head"><span>STATE</span><span>WHAT IT MEANS</span></div>
                {[
                  ["SELLING", "Your deposit landed and custody is selling it."],
                  ["ADVANCING", "The sale settled and your USDC is on its way."],
                  ["OPEN", "You have the advance. Repay whenever you want."],
                  ["REPAID", "Your USDC came back. Ready to claim."],
                  ["CLAIMING", "Custody is repurchasing your token quantity."],
                  ["REPURCHASED", "Your tokens are secured and the transfer is next."],
                  ["CLAIMED", "Tokens are back in your wallet. Position closed."],
                  ["OPERATOR REVIEW", "Automation stopped and a human is picking it up. Your deposit is still recorded and still yours."],
                ].map(([state, meaning]) => (
                  <div key={state}><b>{state}</b><span>{meaning}</span></div>
                ))}
              </div>
            </section>

            <section id="risk">
              <h2>Risks worth understanding</h2>
              <p>Worth reading before you open a position — these are the things that decide how it goes.</p>
              <ul className="docs-list risk">
                <li>
                  <b>A sharp rally can delay your claim.</b> The budget for reacquiring your tokens is
                  what the deposit was worth when you opened. If {symbol} runs hard before you repay,
                  that budget may not stretch to the full quantity, and your claim is held for review
                  rather than settling short.
                </li>
                <li>
                  <b>Market costs are real.</b> Opening and closing a position each carry a market
                  cost, so fees and slippage apply at both ends. Very small positions feel this most.
                </li>
                <li>
                  <b>Your upside is fixed to a quantity, not a price.</b> While the position is open
                  you hold a claim on that quantity rather than the tokens themselves — so the count
                  you get back is the same whichever way the price moved.
                </li>
                <li>
                  <b>This is custody, not a trustless vault.</b> An operator holds the assets and
                  executes the round trip. Every step is signed and published, but you are trusting
                  that operator to complete it.
                </li>
                <li>
                  <b>Only send from the wallet you verified.</b> Transfers from another wallet will not
                  match your position.
                </li>
              </ul>
            </section>

            <section id="play">
              <h2>Playing the floor</h2>
              <p>
                Your advance arrives as USDC in your own wallet — it is not locked into the casino and
                the tables do not draw from it automatically. You decide what, if anything, to do with it.
              </p>
              <p>
                Rounds on the SolCage floor settle to <b>loyalty XP</b>, which is what drives your
                position on the <Link href="/leaderboard">leaderboard</Link> and the weekly race. Every
                verified round earns XP, and so does opening a lending position.
              </p>
              <ul className="docs-list">
                <li><b>Referred players earn 1.25×</b> XP on everything they do.</li>
                <li><b>Referrers earn a 10% bonus</b> on the activity of players they bring in.</li>
                <li><b>XP is tied to a verified wallet.</b> Unverified accounts do not rank.</li>
              </ul>
            </section>

            <section id="fair">
              <h2>Provable fairness</h2>
              <p>
                Every round is committed before you play and revealed after, so the result cannot be
                changed once your bet is in:
              </p>
              <ol className="docs-steps">
                <li><b>Commit</b><span>The server generates a secret seed and shows you its SHA-256 hash before the round.</span></li>
                <li><b>Your input</b><span>Your own client seed goes into the draw, so the server cannot know the outcome alone.</span></li>
                <li><b>Reveal</b><span>After the round, the server seed is published. Hash it yourself and it must match the commitment you were given.</span></li>
              </ol>
              <p>
                Outcomes are derived with HMAC-SHA256 over the seed pair. The round ID, server hash,
                revealed seed, and your client seed are all shown with each result, so any round can be
                re-derived independently.
              </p>
            </section>

            <section id="faq">
              <h2>FAQ</h2>
              <dl className="docs-faq">
                <dt>Can I lose my collateral by playing?</dt>
                <dd>No. Your position and the tables are separate systems. Game rounds settle in loyalty XP and never touch your custody position or your reserve.</dd>

                <dt>What if I never repay?</dt>
                <dd>Nothing is seized and nothing accrues. The position simply stays open, the reserve stays held against it, and you keep the USDC. You just do not get your token quantity back until the advance is repaid.</dd>

                <dt>Can I repay from a different wallet?</dt>
                <dd>No. Repayment has to come from the same verified wallet that opened the position.</dd>

                <dt>Do I get back the same tokens I deposited?</dt>
                <dd>The same quantity of the same token, reacquired for you before the claim releases. Fungible tokens have no individual identity, so quantity is the meaningful unit.</dd>

                <dt>Why is the terminal disabled?</dt>
                <dd>An operational check has failed — a missing market, a settlement route that is unavailable, or insufficient operator inventory. The live checklist is at the bottom of the <Link href="/lending">lending page</Link>.</dd>

                <dt>Where can I verify all of this?</dt>
                <dd>The audit journal on the lending page links every deposit, sale, advance, repayment, buyback, and claim to its Solana transaction signature.</dd>
              </dl>
            </section>

            <footer className="docs-footer">
              <p>
                Play responsibly. Only put up collateral you can afford to have locked in a round trip,
                and never treat an advance as free money — it is repayable.
              </p>
              <Link className="docs-cta" href="/lending">Open the lending terminal ↗</Link>
            </footer>
          </div>
        </div>
      </div>
    </CasinoChrome>
  );
}
