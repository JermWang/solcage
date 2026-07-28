import { transaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { availableBalance, fromBaseUnits, lockedBalance } from "@/lib/bankroll";
import { gameLimits, houseConfig, houseReadiness } from "@/lib/house";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const config = houseConfig();
    const readiness = houseReadiness(config);
    const { raw, locked } = await transaction(async (client) => ({
      raw: await availableBalance(client, identity.userId),
      locked: await lockedBalance(client, identity.userId),
    }));
    return json({
      balanceRaw: raw.toString(),
      balance: fromBaseUnits(raw, config.decimals),
      lockedRaw: locked.toString(),
      locked: fromBaseUnits(locked, config.decimals),
      symbol: config.symbol,
      decimals: config.decimals,
      depositAddress: readiness.ready ? config.wallet : null,
      wagering: readiness.ready ? "open" : "closed",
      rakeBps: config.rakeBps,
      games: gameLimits(config),
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
