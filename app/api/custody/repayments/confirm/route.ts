import { db, transaction } from "@/lib/db";
import { json, requireIdentity } from "@/lib/identity";
import { custodyRuntimeConfig } from "@/lib/custody/config";
import { positionJson, recordCustodyEvent, verifiedWallet } from "@/lib/custody/database";
import { maybeProxyCustody } from "@/lib/custody/proxy";
import { verifyIncomingTransfer } from "@/lib/custody/solana";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const proxied = await maybeProxyCustody(request);
  if (proxied) return proxied;
  try {
    const identity = await requireIdentity(request);
    const wallet = await verifiedWallet(identity.userId);
    const config = custodyRuntimeConfig();
    if (!config.enabled || !config.custodyAddress || !wallet) {
      return json({ error: "Custody repayments are launch-gated" }, 503, identity);
    }
    const body = await request.json() as { positionId?: unknown; signature?: unknown };
    if (
      typeof body.positionId !== "string"
      || typeof body.signature !== "string"
      || body.signature.length > 96
    ) return json({ error: "Invalid repayment confirmation" }, 400, identity);
    const positionId = body.positionId;
    const repaymentSignature = body.signature;
    const found = await db().query(
      `SELECT * FROM custody_positions
       WHERE id = $1 AND user_id = $2 AND status = 'open'`,
      [positionId, identity.userId],
    );
    if (!found.rowCount) return json({ error: "Open custody position not found" }, 404, identity);
    const position = found.rows[0];
    const repayment = BigInt(position.advance_raw);
    const settlement = await verifyIncomingTransfer({
      signature: repaymentSignature,
      owner: wallet,
      destinationOwner: config.custodyAddress,
      mint: config.usdcMint,
      amount: repayment,
      decimals: config.usdcDecimals,
      tokenProgram: config.usdcTokenProgram,
    });
    const updated = await transaction(async (client) => {
      const result = await client.query(
        `UPDATE custody_positions
         SET repaid_raw = $3, repay_signature = $4, status = 'repaid',
             metadata = metadata || $5::jsonb, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'open'
         RETURNING *`,
        [
          positionId,
          identity.userId,
          repayment.toString(),
          repaymentSignature,
          JSON.stringify({ repaySlot: settlement.slot, repayBlockTime: settlement.blockTime }),
        ],
      );
      if (!result.rowCount) throw new Error("Position was already repaid");
      await recordCustodyEvent(client, {
        positionId,
        userId: identity.userId,
        eventKey: `custody:repay:${repaymentSignature}`,
        action: "advance_repaid",
        signature: repaymentSignature,
        symbol: "USDC",
        mint: config.usdcMint,
        rawAmount: repayment,
      });
      return result.rows[0];
    });
    return json({ position: positionJson(updated) }, 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to confirm repayment" }, 400);
  }
}
