import { Pool, type PoolClient } from "pg";

declare global {
  var __solcagePool: Pool | undefined;
  var __solcageSchema: Promise<void> | undefined;
}

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

/**
 * Railway's private network terminates inside the VPC and offers no TLS, while
 * managed providers (Supabase, Neon, RDS) refuse plaintext. Decide per host so
 * the same build works against either.
 */
function sslConfig(connectionString: string) {
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    host = "";
  }
  const isPrivate = host.endsWith(".railway.internal")
    || host === "localhost"
    || host === "127.0.0.1"
    || host === "";
  if (isPrivate) return undefined;
  // Verify by default; set DATABASE_SSL_NO_VERIFY=true only if a provider
  // presents a chain Node cannot validate.
  return { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== "true" };
}

export function db() {
  if (!globalThis.__solcagePool) {
    const connectionString = databaseUrl();
    globalThis.__solcagePool = new Pool({
      connectionString,
      ssl: sslConfig(connectionString),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalThis.__solcagePool;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(24) NOT NULL,
    display_name VARCHAR(40) NOT NULL,
    avatar_url TEXT,
    bio VARCHAR(180) NOT NULL DEFAULT '',
    wallet_address VARCHAR(64),
    referral_code VARCHAR(12) NOT NULL UNIQUE,
    referred_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_verified_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_verified_wallet_idx ON users (wallet_address) WHERE wallet_verified_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users (referred_by)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS wallet_challenges (
    nonce VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS wallet_challenge_user_idx ON wallet_challenges (user_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS reward_ledger (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL,
    base_points INTEGER NOT NULL,
    multiplier NUMERIC(5,2) NOT NULL DEFAULT 1,
    points INTEGER NOT NULL,
    description VARCHAR(160) NOT NULL,
    event_key VARCHAR(100) NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS reward_user_created_idx ON reward_ledger (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS loan_history (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_symbol VARCHAR(16) NOT NULL,
    collateral_amount NUMERIC(30,10) NOT NULL,
    collateral_value NUMERIC(18,2) NOT NULL,
    chips_drawn NUMERIC(18,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    event_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS loans_user_created_idx ON loan_history (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game VARCHAR(32) NOT NULL,
    bet NUMERIC(18,2) NOT NULL,
    outcome VARCHAR(12) NOT NULL,
    payout NUMERIC(18,2) NOT NULL,
    event_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS games_user_created_idx ON game_history (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS game_fair_rounds (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game VARCHAR(32) NOT NULL,
    server_seed CHAR(64) NOT NULL,
    server_seed_hash CHAR(64) NOT NULL,
    client_seed VARCHAR(128),
    nonce INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'committed',
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revealed_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS fair_rounds_user_created_idx ON game_fair_rounds (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS protocol_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signature VARCHAR(96) NOT NULL UNIQUE,
    action VARCHAR(24) NOT NULL,
    asset_symbol VARCHAR(16) NOT NULL,
    mint_address VARCHAR(64) NOT NULL,
    raw_amount NUMERIC(20,0) NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS protocol_transactions_user_created_idx
   ON protocol_transactions (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS custody_positions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(64) NOT NULL,
    collateral_symbol VARCHAR(16) NOT NULL,
    collateral_mint VARCHAR(64) NOT NULL,
    collateral_decimals SMALLINT NOT NULL,
    collateral_raw NUMERIC(20,0) NOT NULL,
    sale_proceeds_raw NUMERIC(20,0),
    advance_raw NUMERIC(20,0),
    reserve_raw NUMERIC(20,0),
    repaid_raw NUMERIC(20,0) NOT NULL DEFAULT 0,
    repurchase_cost_raw NUMERIC(20,0),
    repurchased_raw NUMERIC(20,0),
    status VARCHAR(24) NOT NULL,
    deposit_signature VARCHAR(96) NOT NULL UNIQUE,
    sell_signature VARCHAR(128),
    advance_signature VARCHAR(96),
    repay_signature VARCHAR(96) UNIQUE,
    buy_signature VARCHAR(128),
    claim_signature VARCHAR(96),
    failure_reason VARCHAR(240),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS custody_positions_user_created_idx
   ON custody_positions (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS custody_positions_status_idx
   ON custody_positions (status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS custody_events (
    id UUID PRIMARY KEY,
    position_id UUID NOT NULL REFERENCES custody_positions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key VARCHAR(140) NOT NULL UNIQUE,
    action VARCHAR(32) NOT NULL,
    signature VARCHAR(128),
    asset_symbol VARCHAR(16) NOT NULL,
    mint_address VARCHAR(64) NOT NULL,
    raw_amount NUMERIC(20,0) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS custody_events_user_created_idx
   ON custody_events (user_id, created_at DESC)`,
  // Wallet-first sign-in: a challenge is issued before any account exists, so
  // it can no longer be tied to a user. CREATE TABLE IF NOT EXISTS will not
  // alter an already-created table, so relax it explicitly. Idempotent.
  `ALTER TABLE wallet_challenges ALTER COLUMN user_id DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS wallet_challenge_wallet_idx
   ON wallet_challenges (wallet_address, expires_at)`,
];

export async function ensureSchema() {
  if (!globalThis.__solcageSchema) {
    globalThis.__solcageSchema = (async () => {
      for (const statement of schemaStatements) await db().query(statement);
    })().catch((error) => {
      globalThis.__solcageSchema = undefined;
      throw error;
    });
  }
  return globalThis.__solcageSchema;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
