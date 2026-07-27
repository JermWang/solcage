export const CRASH_RANDOM_MAX = 1_000_000;
export const CRASH_GROWTH_RATE = 0.115;
export const CRASH_MAX_MULTIPLIER = 1_000;

export function crashPointFromInt(randomValue: number) {
  if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= CRASH_RANDOM_MAX) {
    throw new Error("Invalid crash entropy");
  }
  const unit = randomValue / CRASH_RANDOM_MAX;
  const raw = Math.floor((0.99 / (1 - unit)) * 100) / 100;
  return Math.min(CRASH_MAX_MULTIPLIER, Math.max(1, raw));
}

export function crashMultiplierAtElapsed(elapsedMs: number) {
  const elapsedSeconds = Math.max(0, elapsedMs) / 1_000;
  const raw = Math.floor(Math.exp(elapsedSeconds * CRASH_GROWTH_RATE) * 100) / 100;
  return Math.min(CRASH_MAX_MULTIPLIER, Math.max(1, raw));
}

export function elapsedForCrashMultiplier(multiplier: number) {
  return Math.max(0, Math.log(Math.max(1, multiplier)) / CRASH_GROWTH_RATE) * 1_000;
}
