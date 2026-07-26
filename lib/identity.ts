import type { PoolClient } from "pg";
import { db, ensureSchema, transaction } from "./db";

const COOKIE = "solcage_session";
const MAX_AGE = 60 * 60 * 24 * 365;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE) return rest.join("=");
  }
  return null;
}

function referralCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export type SessionIdentity = { userId: string; setCookie?: string };

export async function readIdentity(request: Request): Promise<SessionIdentity | null> {
  await ensureSchema();
  const token = cookieValue(request);
  if (!token || token.length !== 64) return null;
  const result = await db().query(
    `SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()`,
    [await sha256(token)],
  );
  return result.rowCount ? { userId: result.rows[0].user_id } : null;
}

export async function requireIdentity(request: Request): Promise<SessionIdentity> {
  const current = await readIdentity(request);
  if (current) return current;

  return transaction(async (client) => {
    const userId = crypto.randomUUID();
    const suffix = userId.replaceAll("-", "").slice(0, 6);
    const token = randomToken();
    const code = await uniqueReferralCode(client);
    await client.query(
      `INSERT INTO users (id, username, display_name, referral_code)
       VALUES ($1, $2, $3, $4)`,
      [userId, `player_${suffix}`, `Player ${suffix.toUpperCase()}`, code],
    );
    await client.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '365 days')`,
      [await sha256(token), userId],
    );
    await client.query(
      `INSERT INTO reward_ledger
       (id, user_id, kind, base_points, multiplier, points, description, event_key)
       VALUES ($1, $2, 'welcome', 100, 1, 100, 'Founding player bonus', $3)`,
      [crypto.randomUUID(), userId, `welcome:${userId}`],
    );
    return {
      userId,
      setCookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
    };
  });
}

async function uniqueReferralCode(client: PoolClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = referralCode();
    const found = await client.query("SELECT 1 FROM users WHERE referral_code = $1", [code]);
    if (!found.rowCount) return code;
  }
  throw new Error("Unable to allocate referral code");
}

export function json(data: unknown, status = 200, identity?: SessionIdentity) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (identity?.setCookie) headers.set("set-cookie", identity.setCookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export async function profileSnapshot(userId: string) {
  const user = await db().query(
    `SELECT id, username, display_name, avatar_url, bio, wallet_address, wallet_verified_at,
            referral_code, referred_by, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!user.rowCount) throw new Error("Profile not found");
  const totals = await db().query(
    `SELECT COALESCE(SUM(points), 0)::int AS points, COUNT(*)::int AS events
     FROM reward_ledger WHERE user_id = $1`,
    [userId],
  );
  const rank = await db().query(
    `WITH totals AS (
       SELECT l.user_id, SUM(l.points) AS points
       FROM reward_ledger l JOIN users u ON u.id = l.user_id
       WHERE u.wallet_verified_at IS NOT NULL GROUP BY l.user_id
     ), ranked AS (
       SELECT user_id, RANK() OVER (ORDER BY points DESC) AS rank FROM totals
     ) SELECT rank::int FROM ranked WHERE user_id = $1`,
    [userId],
  );
  const referrals = await db().query(
    `SELECT COUNT(*)::int AS count FROM users WHERE referred_by = $1 AND wallet_verified_at IS NOT NULL`,
    [userId],
  );
  const history = await db().query(
    `SELECT kind, points, multiplier::float8 AS multiplier, description, metadata, created_at
     FROM reward_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  const row = user.rows[0];
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    walletAddress: row.wallet_address,
    walletVerified: Boolean(row.wallet_verified_at),
    referralCode: row.referral_code,
    referred: Boolean(row.referred_by),
    createdAt: row.created_at,
    points: totals.rows[0].points,
    events: totals.rows[0].events,
    rank: row.wallet_verified_at ? (rank.rows[0]?.rank ?? 1) : null,
    referrals: referrals.rows[0].count,
    multiplier: row.referred_by ? 1.25 : 1,
    history: history.rows,
  };
}
