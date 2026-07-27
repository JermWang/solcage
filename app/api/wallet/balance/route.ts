import { transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { balanceRaw, fromBaseUnits } from "@/lib/bankroll";
import { houseConfig, houseReadiness } from "@/lib/house";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const config = houseConfig();
    const readiness = houseReadiness(config);
    const raw = await transaction((client) => balanceRaw(client, identity.userId));
    return json({
      balanceRaw: raw.toString(),
      balance: fromBaseUnits(raw, config.decimals),
      symbol: config.symbol,
      decimals: config.decimals,
      depositAddress: readiness.ready ? config.wallet : null,
      wagering: readiness.ready ? "open" : "closed",
      checks: readiness.checks,
      limits: {
        minStakeRaw: config.limits.minStakeRaw.toString(),
        maxStakeRaw: config.limits.maxStakeRaw.toString(),
        maxPayoutRaw: config.limits.maxPayoutRaw.toString(),
      },
    }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Balance unavailable" }, 503);
  }
}
