import { db } from "@/lib/db";
import { json } from "@/lib/identity";
import { AdminRequired, isAdminRequired, requireAdmin } from "@/lib/admin";
import { fromBaseUnits } from "@/lib/bankroll";
import { houseConfig } from "@/lib/house";
import { rejectWithdrawal, sendApprovedWithdrawal } from "@/lib/withdrawals";

export const dynamic = "force-dynamic";

function denied() {
  return json({ error: "Operator authorisation required" }, 401);
}

/** Review queue, plus anything stuck mid-send that needs a human. */
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const config = houseConfig();
    const rows = await db().query(
      `SELECT id, user_id, destination, amount_raw::text, status, signature,
              failure_reason, created_at, updated_at
       FROM withdrawals
       WHERE status IN ('pending_review', 'sending', 'failed')
       ORDER BY created_at`,
    );
    return json({
      withdrawals: rows.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        destination: row.destination,
        amount: fromBaseUnits(BigInt(row.amount_raw), config.decimals),
        amountRaw: row.amount_raw,
        status: row.status,
        signature: row.signature,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
        // A row left in `sending` is never retried automatically: the transfer
        // may already have landed. Confirm on-chain before touching it.
        needsManualCheck: row.status === "sending",
      })),
      symbol: config.symbol,
    }, 200);
  } catch (error) {
    if (isAdminRequired(error)) return denied();
    return json({ error: error instanceof Error ? error.message : "Unavailable" }, 503);
  }
}

/** Approve (and immediately send) or reject a queued withdrawal. */
export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = await request.json() as { id?: unknown; action?: unknown; note?: unknown };
    const id = String(body.id ?? "");
    const action = String(body.action ?? "");
    const note = String(body.note ?? "").slice(0, 240);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid withdrawal id" }, 400);

    if (action === "reject") {
      await rejectWithdrawal(id, note || "Rejected by operator");
      return json({ id, status: "rejected" }, 200);
    }

    if (action === "approve") {
      // pending_review -> approved, then send. Guarded on the current status so
      // a double submission cannot send twice.
      const claimed = await db().query(
        `UPDATE withdrawals SET status = 'approved', updated_at = NOW()
         WHERE id = $1 AND status = 'pending_review' RETURNING id`,
        [id],
      );
      if (!claimed.rowCount) return json({ error: "Not awaiting review" }, 409);
      const sent = await sendApprovedWithdrawal(id);
      return json({
        id,
        status: sent.sent ? "sent" : "approved",
        signature: sent.sent ? sent.signature : null,
      }, 200);
    }

    return json({ error: "action must be approve or reject" }, 400);
  } catch (error) {
    if (error instanceof AdminRequired || isAdminRequired(error)) return denied();
    return json({ error: error instanceof Error ? error.message : "Action failed" }, 400);
  }
}
