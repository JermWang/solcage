import { json } from "@/lib/identity";
import { custodyRuntimeConfig } from "@/lib/custody/config";

export const dynamic = "force-dynamic";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const CACHE_MS = 20_000;

type Quote = { usdPrice: number; priceChange24h: number | null };

/**
 * Prices are shared across every visitor, so one upstream call serves them all.
 * Without this each page load would hit Jupiter directly and get rate-limited.
 */
let cache: { at: number; quotes: Record<string, Quote> } | null = null;

function endpoint(mints: string[]) {
  const base = process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag";
  return `${base}/price/v3?ids=${mints.join(",")}`;
}

async function fetchQuotes(mints: string[]): Promise<Record<string, Quote>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quotes;

  const headers: Record<string, string> = {};
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;

  const response = await fetch(endpoint(mints), { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`price upstream ${response.status}`);
  const body = await response.json() as Record<string, { usdPrice?: number; priceChange24h?: number }>;

  const quotes: Record<string, Quote> = {};
  for (const [mint, value] of Object.entries(body)) {
    if (typeof value?.usdPrice !== "number") continue;
    quotes[mint] = {
      usdPrice: value.usdPrice,
      priceChange24h: typeof value.priceChange24h === "number" ? value.priceChange24h : null,
    };
  }
  cache = { at: Date.now(), quotes };
  return quotes;
}

/**
 * Live USD prices for SOL and every configured collateral market.
 *
 * Public: it carries no player data, and the client polls it to keep displayed
 * figures current. A failed upstream returns the last good cache rather than
 * an error, so a brief outage shows slightly stale prices instead of blanks.
 */
export async function GET() {
  const config = custodyRuntimeConfig();
  const markets = config.markets;
  const mints = [SOL_MINT, ...markets.map((market) => market.mint)];

  let quotes: Record<string, Quote>;
  try {
    quotes = await fetchQuotes(mints);
  } catch {
    if (!cache) return json({ error: "Prices are unavailable right now" }, 503);
    quotes = cache.quotes;
  }

  return json({
    sol: quotes[SOL_MINT] ?? null,
    // Only markets we can actually price are returned, so nothing renders with
    // a stale or invented figure.
    collateral: markets
      .filter((market) => quotes[market.mint])
      .map((market) => ({
        symbol: market.symbol,
        name: market.name,
        mint: market.mint,
        advanceBps: market.advanceBps,
        enabled: market.enabled,
        usdPrice: quotes[market.mint].usdPrice,
        priceChange24h: quotes[market.mint].priceChange24h,
      })),
    fetchedAt: new Date(cache?.at ?? Date.now()).toISOString(),
  });
}
