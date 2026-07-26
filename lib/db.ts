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

export function db() {
  if (!globalThis.__solcagePool) {
    globalThis.__solcagePool = new Pool({
      connectionString: databaseUrl(),
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
