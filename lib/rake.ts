import { transaction } from "./db.ts";
import { platformRevenue, recordRakeSweep } from "./bankroll.ts";
import { houseConfig } from "./house.ts";
import { HOUSE_RESERVE_LAMPORTS, houseTreasuryOnChain, sendHouseSol } from "./house-solana.ts";

/**
 * Rake sweeping.
 *
 * Rake accrues per bet in the PLATFORM_REVENUE ledger account and is moved
 * on-chain in batches. Transferring per bet would cost more than it collects:
 * 2% of a 0.001 SOL stake is 0.00002 SOL, well under a transaction fee.
 *
 * The ledger is only updated after the transfer confirms, so a failed sweep
 * leaves the rake recorded as still owed rather than claiming it left.
 */

/** Not worth a transaction below this. */
export const MIN_SWEEP_LAMPORTS = 10_000_000n; // 0.01 SOL

export type SweepResult =
  | { swept: false; reason: string; accruedRaw: string }
  | { swept: true; amountRaw: string; signature: string; destination: string };

export async function sweepRake(options?: { minLamports?: bigint }): Promise<SweepResult> {
  const config = houseConfig();
  if (!config.rakeDestination) {
    return { swept: false, reason: "No rake destination configured", accruedRaw: "0" };
  }

  const accrued = await transaction((client) => platformRevenue(client));
  const minimum = options?.minLamports ?? MIN_SWEEP_LAMPORTS;
  if (accrued < minimum) {
    return {
      swept: false,
      reason: `Accrued rake is below the sweep minimum (${minimum} base units)`,
      accruedRaw: accrued.toString(),
    };
  }

  // Never sweep past what the wallet can actually part with: player balances
  // and the fee reserve live in the same account.
  const onChain = await houseTreasuryOnChain();
  if (onChain.spendable < accrued) {
    return {
      swept: false,
      reason: `House wallet holds ${onChain.lamports} lamports; cannot release ${accrued} while keeping the ${HOUSE_RESERVE_LAMPORTS} reserve`,
      accruedRaw: accrued.toString(),
    };
  }

  const sent = await sendHouseSol({ destination: config.rakeDestination, lamports: accrued });
  await transaction((client) =>
    recordRakeSweep(client, { amountRaw: accrued, signature: sent.signature }),
  );

  return {
    swept: true,
    amountRaw: accrued.toString(),
    signature: sent.signature,
    destination: config.rakeDestination,
  };
}
