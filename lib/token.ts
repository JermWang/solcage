/** Public SOLCAGE token facts. Safe to ship to the browser. */

/** SPL mint for $SOLCAGE. Mirrors SOLCAGE_CUSTODY_MARKET.mint on the server. */
export const SOLCAGE_MINT = "5tvCy4yXx1GR3XvJ3ziLkhheNkXpTgh93Y5FgsFSpump";

export const SOLCAGE_SYMBOL = "SOLCAGE";

/** 5tvC…Fpump — for nav chips and other tight spots. */
export function shortenMint(mint: string, lead = 4, tail = 5) {
  if (mint.length <= lead + tail + 1) return mint;
  return `${mint.slice(0, lead)}…${mint.slice(-tail)}`;
}
