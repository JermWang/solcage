import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Rake waiver for $SOLCAGE holders.
 *
 * Holding the threshold amount removes the rake on every round. The balance is
 * read from the chain each time it is checked — never from anything the client
 * sends — and cached briefly, because this runs on the hot path of every bet.
 *
 * Fails closed: if the mint does not exist, the RPC is unreachable, or anything
 * else goes wrong, no waiver is granted and the normal rake applies. A player is
 * never charged more than the standard rate by this failing; the house is simply
 * not made to give away a discount it could not verify.
 */

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; holds: boolean; balance: number }>();

export function waiverMint() {
  return process.env.SOLCAGE_TOKEN_MINT ?? "5tvCy4yXx1GR3XvJ3ziLkhheNkXpTgh93Y5FgsFSpump";
}

export function waiverThreshold() {
  const raw = Number(process.env.SOLCAGE_FEE_WAIVER_MIN_TOKENS ?? "10000");
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/**
 * Total $SOLCAGE held by a wallet, in whole tokens.
 *
 * Reads every token account for the mint rather than assuming the associated
 * one, so a holder with tokens split across accounts is still credited. Uses the
 * parsed uiAmount, which is already decimal-adjusted — no need to know or hardcode
 * the mint's decimals.
 */
async function readBalance(wallet: string): Promise<number> {
  const connection = new Connection(rpcUrl(), "confirmed");
  const accounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(wallet),
    { mint: new PublicKey(waiverMint()) },
  );
  let total = 0;
  for (const entry of accounts.value) {
    const amount = entry.account.data.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === "number") total += amount;
  }
  return total;
}

/** Whether this wallet currently qualifies, with the balance that decided it. */
export async function feeWaiverStatus(wallet: string | null | undefined): Promise<{
  waived: boolean;
  balance: number;
  threshold: number;
}> {
  const threshold = waiverThreshold();
  if (!wallet) return { waived: false, balance: 0, threshold };

  const cached = cache.get(wallet);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { waived: cached.holds, balance: cached.balance, threshold };
  }

  try {
    const balance = await readBalance(wallet);
    const holds = balance >= threshold;
    cache.set(wallet, { at: Date.now(), holds, balance });
    return { waived: holds, balance, threshold };
  } catch {
    // Unverifiable, so no discount. Cached briefly so a broken RPC does not turn
    // every bet into a failing lookup.
    cache.set(wallet, { at: Date.now(), holds: false, balance: 0 });
    return { waived: false, balance: 0, threshold };
  }
}

/** The rake to actually charge this wallet. */
export async function effectiveRakeBps(wallet: string | null | undefined, standardRakeBps: number) {
  if (standardRakeBps <= 0) return 0;
  const status = await feeWaiverStatus(wallet);
  return status.waived ? 0 : standardRakeBps;
}
