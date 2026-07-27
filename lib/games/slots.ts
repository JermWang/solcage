export const SLOT_REEL_COUNT = 5;
export const SLOT_ROW_COUNT = 3;
export const SLOT_LINE_COUNT = 9;
export const SLOT_STRIP_LENGTH = 40;
export const SLOT_ENTROPY_COUNT = SLOT_REEL_COUNT;

export type SlotSymbol =
  | "WILD"
  | "CROWN"
  | "SEVEN"
  | "SOL"
  | "DIAMOND"
  | "CHIP"
  | "LIME"
  | "VAULT";

export type SlotLineWin = {
  line: number;
  symbol: Exclude<SlotSymbol, "VAULT">;
  count: number;
  multiplier: number;
  cells: Array<{ reel: number; row: number }>;
};

const BASE_STRIP: readonly SlotSymbol[] = Object.freeze([
  "VAULT", "LIME", "CHIP", "SOL", "DIAMOND", "LIME", "SEVEN", "CHIP",
  "CROWN", "LIME", "DIAMOND", "SOL", "CHIP", "LIME", "WILD", "SEVEN",
  "DIAMOND", "CHIP", "LIME", "SOL", "CROWN", "CHIP", "DIAMOND", "LIME",
  "SEVEN", "SOL", "CHIP", "LIME", "DIAMOND", "WILD", "CHIP", "CROWN",
  "LIME", "SEVEN", "SOL", "CHIP", "LIME", "DIAMOND", "LIME", "LIME",
]);

function permutedStrip(step: number, offset: number) {
  return Object.freeze(
    Array.from(
      { length: SLOT_STRIP_LENGTH },
      (_, index) => BASE_STRIP[(index * step + offset) % SLOT_STRIP_LENGTH],
    ),
  );
}

export const SLOT_REEL_STRIPS: readonly (readonly SlotSymbol[])[] = Object.freeze([
  permutedStrip(1, 0),
  permutedStrip(3, 7),
  permutedStrip(7, 13),
  permutedStrip(9, 19),
  permutedStrip(11, 29),
]);

// Adapted from the nine 5x3 win vectors in krysits/casino-client.
export const SLOT_PAYLINES: readonly (readonly number[])[] = Object.freeze([
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
]);

export const SLOT_PAYTABLE: Readonly<Record<Exclude<SlotSymbol, "VAULT">, readonly number[]>> =
  Object.freeze({
    WILD: [0, 0, 0, 75, 300, 1_500],
    CROWN: [0, 0, 0, 30, 110, 550],
    SEVEN: [0, 0, 0, 18, 70, 330],
    SOL: [0, 0, 0, 13, 46, 185],
    DIAMOND: [0, 0, 0, 9, 30, 110],
    CHIP: [0, 0, 0, 5.5, 18, 65],
    LIME: [0, 0, 0, 3.5, 11, 40],
  });

export const SLOT_SCATTER_PAYTABLE: Readonly<Record<number, number>> = Object.freeze({
  3: 5,
  4: 25,
  5: 100,
});

function symbolAt(reel: number, stop: number, row: number) {
  const strip = SLOT_REEL_STRIPS[reel];
  const index = (stop + row - 1 + strip.length) % strip.length;
  return strip[index];
}

export function slotMatrixFromStops(stops: readonly number[]) {
  if (
    stops.length !== SLOT_REEL_COUNT
    || stops.some((stop) => !Number.isInteger(stop) || stop < 0 || stop >= SLOT_STRIP_LENGTH)
  ) {
    throw new Error("Invalid slot reel stops");
  }
  return Array.from(
    { length: SLOT_ROW_COUNT },
    (_, row) => Array.from(
      { length: SLOT_REEL_COUNT },
      (_, reel) => symbolAt(reel, stops[reel], row),
    ),
  );
}

function bestLineWin(symbols: readonly SlotSymbol[], rows: readonly number[], line: number) {
  let best: SlotLineWin | null = null;
  for (const symbol of Object.keys(SLOT_PAYTABLE) as Array<Exclude<SlotSymbol, "VAULT">>) {
    let count = 0;
    for (const candidate of symbols) {
      if (candidate === symbol || candidate === "WILD") count += 1;
      else break;
    }
    const multiplier = SLOT_PAYTABLE[symbol][count] ?? 0;
    if (multiplier > (best?.multiplier ?? 0)) {
      best = {
        line,
        symbol,
        count,
        multiplier,
        cells: Array.from({ length: count }, (_, reel) => ({ reel, row: rows[reel] })),
      };
    }
  }
  return best;
}

export function evaluateSlotMatrix(matrix: readonly (readonly SlotSymbol[])[]) {
  if (
    matrix.length !== SLOT_ROW_COUNT
    || matrix.some((row) => row.length !== SLOT_REEL_COUNT)
  ) {
    throw new Error("Invalid slot matrix");
  }
  const lineWins = SLOT_PAYLINES.flatMap((rows, index) => {
    const symbols = rows.map((row, reel) => matrix[row][reel]);
    const win = bestLineWin(symbols, rows, index + 1);
    return win ? [win] : [];
  });
  const scatterCount = matrix.flat().filter((symbol) => symbol === "VAULT").length;
  const scatterMultiplier = SLOT_SCATTER_PAYTABLE[Math.min(5, scatterCount)] ?? 0;
  const lineMultiplier = lineWins.reduce((total, win) => total + win.multiplier, 0) / SLOT_LINE_COUNT;
  const multiplier = Math.round((lineMultiplier + scatterMultiplier) * 1_000_000) / 1_000_000;
  return { lineWins, scatterCount, scatterMultiplier, multiplier };
}

export function spinSlots(stops: readonly number[]) {
  const matrix = slotMatrixFromStops(stops);
  return {
    stops: [...stops],
    matrix,
    ...evaluateSlotMatrix(matrix),
  };
}

function combinations(total: number, selected: number) {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = result * (total - selected + index) / index;
  }
  return result;
}

export function slotExpectedReturn() {
  const symbols = Object.keys(
    BASE_STRIP.reduce<Record<string, number>>((counts, symbol) => {
      counts[symbol] = (counts[symbol] ?? 0) + 1;
      return counts;
    }, {}),
  ) as SlotSymbol[];
  const frequencies = Object.fromEntries(
    symbols.map((symbol) => [symbol, BASE_STRIP.filter((candidate) => candidate === symbol).length]),
  ) as Record<SlotSymbol, number>;

  let lineReturn = 0;
  const visit = (line: SlotSymbol[], probability: number) => {
    if (line.length === SLOT_REEL_COUNT) {
      const win = bestLineWin(line, [0, 0, 0, 0, 0], 1);
      lineReturn += probability * (win?.multiplier ?? 0);
      return;
    }
    for (const symbol of symbols) {
      visit([...line, symbol], probability * frequencies[symbol] / SLOT_STRIP_LENGTH);
    }
  };
  visit([], 1);

  // Each strip contains one scatter. Exactly three of forty stops expose it
  // in a three-row window, so the five-reel count is binomial.
  const scatterChancePerReel = SLOT_ROW_COUNT / SLOT_STRIP_LENGTH;
  let scatterReturn = 0;
  for (let count = 3; count <= SLOT_REEL_COUNT; count += 1) {
    const probability = combinations(SLOT_REEL_COUNT, count)
      * scatterChancePerReel ** count
      * (1 - scatterChancePerReel) ** (SLOT_REEL_COUNT - count);
    scatterReturn += probability * (SLOT_SCATTER_PAYTABLE[count] ?? 0);
  }
  return {
    lineReturn,
    scatterReturn,
    totalReturn: lineReturn + scatterReturn,
  };
}
