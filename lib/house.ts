import { PublicKey } from "@solana/web3.js";
import type { WagerLimits } from "./bankroll";

/**
 * House bankroll configuration.
 *
 * Deliberately separate from the custody wallet. Custody holds collateral and
 * reserves that belong to borrowers; the house holds player funds. One wallet
 * for both would mean a losing streak could eat money owed on lending claims.
 */

function publicKey(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return new PublicKey(value).toBase58() === value ? value : null;
  } catch {
    return null;
  }
}

function bigintOr(value: string | undefined, fallback: bigint) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return BigInt(value);
}

export type HouseConfig = {
  enabled: boolean;
  wallet: string | null;
  hasSigningKey: boolean;
  /** null means native SOL; otherwise the SPL mint players wager in. */
  mint: string | null;
  decimals: number;
  symbol: string;
  limits: WagerLimits;
};

export function houseConfig(): HouseConfig {
  const decimals = Number(process.env.SOLCAGE_HOUSE_DECIMALS ?? "9");
  const mint = publicKey(process.env.SOLCAGE_HOUSE_MINT);
  return {
    enabled: process.env.SOLCAGE_HOUSE_ENABLED === "true",
    wallet: publicKey(process.env.SOLCAGE_HOUSE_WALLET),
    hasSigningKey: Boolean(process.env.SOLCAGE_HOUSE_SECRET_KEY),
    mint,
    decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 12 ? decimals : 9,
    symbol: process.env.SOLCAGE_HOUSE_SYMBOL ?? (mint ? "TOKEN" : "SOL"),
    limits: {
      // Defaults are deliberately small. Raise them once the bankroll is sized.
      minStakeRaw: bigintOr(process.env.SOLCAGE_MIN_STAKE_RAW, 1_000_000n),
      maxStakeRaw: bigintOr(process.env.SOLCAGE_MAX_STAKE_RAW, 100_000_000n),
      maxPayoutRaw: bigintOr(process.env.SOLCAGE_MAX_PAYOUT_RAW, 1_000_000_000n),
    },
  };
}

/** Every gate that must hold before a single real wager is accepted. */
export function houseReadiness(config: HouseConfig) {
  const checks: Array<{ key: string; label: string; ok: boolean; detail: string }> = [];
  const add = (key: string, label: string, ok: boolean, detail: string) =>
    checks.push({ key, label, ok, detail });

  add("enabled", "House switch", config.enabled, config.enabled ? "Enabled" : "Disabled");
  add("wallet", "House wallet", Boolean(config.wallet), config.wallet ?? "Not configured");
  add("signer", "House signer", config.hasSigningKey, config.hasSigningKey ? "Configured" : "Missing");
  add(
    "separate-from-custody",
    "Segregated from custody",
    Boolean(config.wallet) && config.wallet !== process.env.SOLCAGE_CUSTODY_WALLET,
    config.wallet && config.wallet === process.env.SOLCAGE_CUSTODY_WALLET
      ? "House wallet must not be the custody wallet"
      : "Distinct from the custody wallet",
  );
  add(
    "limits",
    "Wager limits",
    config.limits.maxPayoutRaw > 0n && config.limits.maxStakeRaw >= config.limits.minStakeRaw,
    `min ${config.limits.minStakeRaw} · max ${config.limits.maxStakeRaw} · payout cap ${config.limits.maxPayoutRaw}`,
  );
  return { ready: checks.every((c) => c.ok), checks };
}

/**
 * Effective stake ceiling per game, and whether the game is playable at all.
 *
 * The payout cap divided by a game's top multiplier can land below the table
 * minimum — at which point every bet on that game is rejected. That is a
 * configuration problem, not a player problem, so surface it instead of letting
 * it show up as a run of errors.
 */
export function gameLimits(config: HouseConfig) {
  return Object.entries(MAX_MULTIPLIER).map(([game, multiplier]) => {
    const maxStakeRaw = config.limits.maxPayoutRaw / BigInt(Math.ceil(multiplier));
    const capped = maxStakeRaw > config.limits.maxStakeRaw ? config.limits.maxStakeRaw : maxStakeRaw;
    return {
      game,
      multiplier,
      maxStakeRaw: capped.toString(),
      playable: capped >= config.limits.minStakeRaw,
    };
  });
}

/** Highest multiplier each game can return, used to cap exposure per round. */
export const MAX_MULTIPLIER: Record<string, number> = {
  dice: 49,
  roulette: 36,
  plinko: 30,
  slots: 50,
  mines: 25,
  keno: 20,
  crash: 20,
  blackjack: 3,
  baccarat: 9,
  "video-poker": 800,
};
