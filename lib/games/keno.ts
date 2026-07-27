export const KENO_NUMBER_COUNT = 80;
export const KENO_DRAW_COUNT = 20;
export const KENO_MIN_PICKS = 5;
export const KENO_MAX_PICKS = 10;
export const KENO_ENTROPY_COUNT = 128;

export const KENO_PAYTABLE: Readonly<Record<number, readonly number[]>> = Object.freeze({
  5: [0, 0, 1.44, 2.87, 21.55, 107.77],
  6: [0, 0, 0, 2.79, 8.37, 107.35, 209.13],
  7: [0, 0, 0, 1.38, 4.13, 19.3, 413.48, 1378.26],
  8: [0, 0, 0, 1.4, 2.79, 6.98, 107.44, 279.08, 1395.39],
  9: [0, 0, 0, 0, 1.35, 8.1, 67.52, 224.16, 675.17, 1350.34],
  10: [0, 0, 0, 0, 1.36, 6.81, 13.62, 122.61, 374.65, 681.17, 1362.35],
});

export function validateKenoSelections(values: unknown) {
  if (!Array.isArray(values)) throw new Error("Select between 5 and 10 numbers");
  const numbers = values.map(Number);
  if (numbers.length < KENO_MIN_PICKS || numbers.length > KENO_MAX_PICKS) {
    throw new Error("Select between 5 and 10 numbers");
  }
  if (
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > KENO_NUMBER_COUNT)
    || new Set(numbers).size !== numbers.length
  ) {
    throw new Error("Invalid Keno selection");
  }
  return [...numbers].sort((left, right) => left - right);
}

export function uniqueKenoDraw(entropy: readonly number[]) {
  const draw: number[] = [];
  const seen = new Set<number>();
  for (const value of entropy) {
    if (!Number.isInteger(value) || value < 1 || value > KENO_NUMBER_COUNT) {
      throw new Error("Invalid Keno entropy");
    }
    if (!seen.has(value)) {
      seen.add(value);
      draw.push(value);
      if (draw.length === KENO_DRAW_COUNT) return draw;
    }
  }
  throw new Error("Insufficient Keno entropy");
}

export function kenoMultiplier(pickCount: number, hitCount: number) {
  if (!Number.isInteger(pickCount) || !KENO_PAYTABLE[pickCount]) throw new Error("Invalid Keno pick count");
  if (!Number.isInteger(hitCount) || hitCount < 0 || hitCount > pickCount) throw new Error("Invalid Keno hit count");
  return KENO_PAYTABLE[pickCount][hitCount] ?? 0;
}

function combinations(total: number, selected: number) {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = result * (total - selected + index) / index;
  }
  return result;
}

export function kenoExpectedReturn(pickCount: number) {
  if (!KENO_PAYTABLE[pickCount]) throw new Error("Invalid Keno pick count");
  let expected = 0;
  for (let hits = 0; hits <= pickCount; hits += 1) {
    const probability = (
      combinations(pickCount, hits)
      * combinations(KENO_NUMBER_COUNT - pickCount, KENO_DRAW_COUNT - hits)
    ) / combinations(KENO_NUMBER_COUNT, KENO_DRAW_COUNT);
    expected += probability * kenoMultiplier(pickCount, hits);
  }
  return expected;
}
