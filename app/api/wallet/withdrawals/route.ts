import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import { verifiedWallet } from "@/lib/custody/database";
import { InsufficientFunds, fromBaseUnits } from "@/lib/bankroll";
import { houseConfig, houseReadiness } from "@/lib/house";
import { requestWithdrawal, sendApprovedWithdrawal, withdrawalLimits } from "@/lib/withdrawals";

export const dynamic = "force-dynamic";

function positiveRaw(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) return null;
  return BigInt(value);
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const config = houseConfig();
    const rows = await db().query(
      `SELECT id, destination, amount_raw::text, status, signature, failure_reason, created_at
       FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
      [identity.userId],
    );
    const limits = withdrawalLimits();
    return json({
      withdrawals: rows.rows.map((row) => ({
        id: row.id,
        destination: row.destination,
        amount: fromBaseUnits(BigInt(row.amount_raw), config.decimals),
        status: row.status,
        signature: row.signature,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
      })),
      limits: {
        reviewAbove: fromBaseUnits(limits.reviewThresholdRaw, config.decimals),
        dailyMax: fromBaseUnits(limits.dailyMaxRaw, config.decimals),
        dailyMaxCount: limits.dailyMaxCount,
      },
      symbol: config.symbol,
    }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const config = houseConfig();
    const readiness = houseReadiness(config);
    if (!readiness.ready) {
      return json({ error: "The cashier is closed", checks: readiness.checks }, 503, identity);
    }

    const wallet = await verifiedWallet(identity.userId);
    if (!wallet) return json({ error: "Verify your Solana wallet first" }, 403, identity);

    const body = await request.json() as { rawAmount?: unknown; destination?: unknown };
    const amountRaw = positiveRaw(body.rawAmount);
    if (!amountRaw) return json({ error: "Invalid amount" }, 400, identity);

    // Default to the verified wallet. Any other destination has to be a valid
    // address, and it is recorded against the request either way.
    const destination = typeof body.destination === "string" && body.destination
      ? body.destination
      : wallet;
    try {
      if (new PublicKey(destination).toBase58() !== destination) throw new Error("bad");
    } catch {
      return json({ error: "Invalid destination address" }, 400, identity);
    }

    const requested = await requestWithdrawal({
      userId: identity.userId,
      destination,
      amountRaw,
    });

    // Small, in-policy withdrawals go straight out. Anything flagged waits for
    // a human — the funds are already locked either way.
    if (requested.status === "approved") {
      const sent = await sendApprovedWithdrawal(requested.id);
      return json({
        id: requested.id,
        status: sent.sent ? "sent" : "approved",
        signature: sent.sent ? sent.signature : null,
        amount: fromBaseUnits(amountRaw, config.decimals),
        destination,
      }, 201, identity);
    }

    return json({
      id: requested.id,
      status: requested.status,
      requiresReview: true,
      amount: fromBaseUnits(amountRaw, config.decimals),
      destination,
      message: "This withdrawal is queued for review. Your balance is already reserved for it.",
    }, 202, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    if (error instanceof InsufficientFunds) {
      return json({ error: "Not enough balance", balanceRaw: error.balanceRaw.toString() }, 402);
    }
    return json({ error: error instanceof Error ? error.message : "Withdrawal failed" }, 400);
  }
}
