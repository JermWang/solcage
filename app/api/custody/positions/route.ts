import { db } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { positionJson } from "@/lib/custody/database";
import { maybeProxyCustody } from "@/lib/custody/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const proxied = await maybeProxyCustody(request);
  if (proxied) return proxied;
  try {
    const identity = await requireIdentity(request);
    const [positions, events] = await Promise.all([
      db().query(
        `SELECT * FROM custody_positions
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [identity.userId],
      ),
      db().query(
        `SELECT position_id, action, signature, asset_symbol, mint_address,
                raw_amount::text, payload, created_at
         FROM custody_events
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [identity.userId],
      ),
    ]);
    return json({
      positions: positions.rows.map(positionJson),
      events: events.rows,
    }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to load custody positions" }, 400);
  }
}

