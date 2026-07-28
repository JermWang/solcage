import { json } from "@/lib/identity";
import { waiverMint, waiverThreshold } from "@/lib/fee-waiver";

export const dynamic = "force-dynamic";

/**
 * Public, non-sensitive settings the client needs.
 *
 * NEXT_PUBLIC_ values are not inlined into client bundles in this setup, so a
 * component reading process.env in the browser gets undefined. Anything the UI
 * needs at runtime is served from here instead.
 */
export async function GET() {
  return json({
    airdropAt: process.env.SOLCAGE_AIRDROP_AT ?? process.env.NEXT_PUBLIC_SOLCAGE_AIRDROP_AT ?? null,
    feeWaiver: {
      threshold: waiverThreshold(),
      mint: waiverMint(),
      symbol: "SOLCAGE",
    },
  });
}
