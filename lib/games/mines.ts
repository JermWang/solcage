export const MINES_BOARD_SIZE = 25;
export const ALLOWED_MINE_COUNTS = new Set([3, 5, 10]);

export function generateMinePositions(
  mineCount: number,
  randomInt: (maxExclusive: number) => number,
) {
  const positions = Array.from({ length: MINES_BOARD_SIZE }, (_, index) => index);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }
  return positions.slice(0, mineCount).sort((a, b) => a - b);
}

export function mineMultiplier(revealedCount: number, mineCount: number) {
  if (revealedCount <= 0) return 1;
  const safeCells = MINES_BOARD_SIZE - mineCount;
  let survivalProbability = 1;
  for (let draw = 0; draw < revealedCount; draw += 1) {
    survivalProbability *= (safeCells - draw) / (MINES_BOARD_SIZE - draw);
  }
  return Math.round((0.98 / survivalProbability) * 10_000) / 10_000;
}
