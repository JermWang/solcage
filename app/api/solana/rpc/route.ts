import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * Only what the cashier needs to build and follow a deposit. Anything else is
 * refused so this cannot be used as a general-purpose RPC.
 */
const ALLOWED_METHODS = new Set([
  "getLatestBlockhash",
  "getBalance",
  "getSignatureStatuses",
  "getFeeForMessage",
  "getMinimumBalanceForRentExemption",
]);

function upstream() {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/**
 * Minimal Solana JSON-RPC proxy.
 *
 * NEXT_PUBLIC_ values are not inlined into client bundles here, so the browser
 * would otherwise fall back to the public endpoint, which rate-limits and often
 * refuses browser traffic outright. Routing through the server uses the
 * configured RPC without putting its key in front of the user, and keeps the
 * method surface to the handful the cashier actually calls.
 */
export async function POST(request: Request) {
  try {
    // Session-gated: only a signed-in player can spend this quota.
    const identity = await requireIdentity(request);

    const body = await request.json() as { method?: unknown; params?: unknown; id?: unknown };
    if (typeof body.method !== "string" || !ALLOWED_METHODS.has(body.method)) {
      return json({ error: "Unsupported method" }, 400, identity);
    }

    const response = await fetch(upstream(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: typeof body.id === "number" || typeof body.id === "string" ? body.id : 1,
        method: body.method,
        params: Array.isArray(body.params) ? body.params : [],
      }),
    });

    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: "Solana request failed" }, 502);
  }
}
