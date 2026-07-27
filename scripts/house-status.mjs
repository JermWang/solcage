/** Print the live house readiness exactly as the game routes evaluate it. */
import { houseConfig, houseReadiness, gameLimits } from "../lib/house.ts";
import { houseTreasuryOnChain } from "../lib/house-solana.ts";

const config = houseConfig();
const readiness = houseReadiness(config);
const onChain = await houseTreasuryOnChain();

const sol = (raw) => (Number(raw) / 1e9).toFixed(4);

console.log("wagering:", readiness.ready ? "OPEN" : "CLOSED");
readiness.checks.forEach((c) => console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.label} — ${c.detail}`));
console.log("\nbankroll on-chain:", sol(onChain.lamports), "SOL  (spendable", sol(onChain.spendable) + ")");
console.log("rake:", config.rakeBps / 100 + "%", "→", config.rakeDestination);
console.log("stake:", sol(config.limits.minStakeRaw), "–", sol(config.limits.maxStakeRaw), "SOL");
console.log("max win/round:", sol(config.limits.maxPayoutRaw), "SOL");
console.log("\nper-game stake ceiling:");
for (const g of gameLimits(config)) {
  console.log(`  ${g.game.padEnd(13)} ${String(g.multiplier).padStart(4)}x  full payout up to ${sol(g.uncappedStakeRaw).padStart(8)} SOL stake${g.topWinAlwaysCapped ? "  (top wins always capped)" : ""}`);
}
