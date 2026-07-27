export const DICE_ROLL_MIN = 0;
export const DICE_ROLL_MAX = 9_999;
export const DICE_MIN_CHANCE_BPS = 100;
export const DICE_MAX_CHANCE_BPS = 9_500;
export const DICE_RTP_PERCENT = 98;

export type DiceDirection = "under" | "over";

export type DiceSettlement = {
  roll: number;
  direction: DiceDirection;
  chanceBps: number;
  target: number;
  multiplier: number;
  won: boolean;
};

function assertChance(chanceBps: number) {
  if (
    !Number.isInteger(chanceBps)
    || chanceBps < DICE_MIN_CHANCE_BPS
    || chanceBps > DICE_MAX_CHANCE_BPS
  ) {
    throw new Error("Invalid dice win chance");
  }
}

export function diceTarget(chanceBps: number, direction: DiceDirection) {
  assertChance(chanceBps);
  if (direction === "under") return chanceBps;
  if (direction === "over") return DICE_ROLL_MAX - chanceBps;
  throw new Error("Invalid dice direction");
}

export function diceMultiplier(chanceBps: number) {
  assertChance(chanceBps);
  return (DICE_RTP_PERCENT * 100) / chanceBps;
}

export function settleDice(
  roll: number,
  chanceBps: number,
  direction: DiceDirection,
): DiceSettlement {
  if (!Number.isInteger(roll) || roll < DICE_ROLL_MIN || roll > DICE_ROLL_MAX) {
    throw new Error("Invalid dice roll");
  }
  const target = diceTarget(chanceBps, direction);
  const won = direction === "under" ? roll < target : roll > target;
  return {
    roll,
    direction,
    chanceBps,
    target,
    multiplier: diceMultiplier(chanceBps),
    won,
  };
}

export function displayDiceUnits(value: number) {
  return (value / 100).toFixed(2);
}

