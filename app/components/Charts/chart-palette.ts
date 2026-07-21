/**
 * Chart palette (DESIGN-SPEC section 2.6): brand tokens in fixed series
 * order, tokens only, no hex literals. Colors are expressed as Tailwind
 * utility classes so SVG marks and legend swatches stay theme-consistent
 * (CSS variables do not substitute inside SVG presentation attributes).
 *
 * `info` and `moss` are appended at slots 7 and 8, after the existing six,
 * rather than inserted after the three base brand hues. Measured: inserting
 * drops the worst all-pairs CVD separation to deltaE 2.9 at five concurrent
 * series (moss against secondary); appending holds 5.4 through six series
 * and repaints no existing chart. Slots 1 through 6 keep their order and
 * their hues.
 */

export const SERIES_FILL_CLASSES = [
  'fill-accent',
  'fill-secondary',
  'fill-warn',
  'fill-accent-soft',
  'fill-secondary-soft',
  'fill-warn-soft',
  'fill-info',
  'fill-moss',
];

export const SERIES_SWATCH_CLASSES = [
  'bg-accent',
  'bg-secondary',
  'bg-warn',
  'bg-accent-soft',
  'bg-secondary-soft',
  'bg-warn-soft',
  'bg-info',
  'bg-moss',
];

/** DESIGN-SPEC section 2.6: past ~8 concurrent series the chart is overloaded. */
export const MAX_CONCURRENT_SERIES = 8;

export const OTHER_SERIES_KEY = 'other';

const OTHER_SERIES_COLOR = {
  fillClassName: 'fill-fg-mute',
  swatchClassName: 'bg-fg-mute',
};

export type SeriesColor = {
  fillClassName: string;
  swatchClassName: string;
};

/**
 * Palette slots by position in seriesKeys; the "other" bucket wears a neutral
 * so the six brand hues stay reserved for named series.
 */
export const buildSeriesColorMap = (
  seriesKeys: string[]
): Record<string, SeriesColor> =>
  Object.fromEntries(
    seriesKeys.map((key, index) => [
      key,
      key === OTHER_SERIES_KEY ? OTHER_SERIES_COLOR : (
        {
          fillClassName:
            SERIES_FILL_CLASSES.at(index) ?? OTHER_SERIES_COLOR.fillClassName,
          swatchClassName:
            SERIES_SWATCH_CLASSES.at(index) ??
            OTHER_SERIES_COLOR.swatchClassName,
        }
      ),
    ])
  );

export type GroupedSeries = {
  rows: Record<string, number>[];
  seriesKeys: string[];
};

/**
 * Orders series by grand total (descending, ties alphabetical) and, past ~8
 * concurrent series, folds the tail into a single "other" series so a chart
 * never needs more hues than the palette provides.
 */
export const groupTailSeries = (
  rows: Record<string, number>[],
  limit: number = MAX_CONCURRENT_SERIES
): GroupedSeries => {
  const totals = new Map<string, number>();

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort -- canonical/no-use-extend-native flags toSorted on an array literal; copying first gives the same non-mutating behavior (precedent: app/data/sort.ts)
  const orderedKeys = [...totals.keys()].sort((left, right) => {
    const difference = (totals.get(right) ?? 0) - (totals.get(left) ?? 0);

    return difference === 0 ? left.localeCompare(right) : difference;
  });

  if (orderedKeys.length <= limit) {
    return {rows, seriesKeys: orderedKeys};
  }

  const namedKeys = orderedKeys.slice(0, limit - 1);
  const tailKeys = new Set(orderedKeys.slice(limit - 1));
  const foldedRows = rows.map((row) => {
    const folded: Record<string, number> = {};
    let otherTotal = 0;

    for (const [key, value] of Object.entries(row)) {
      if (tailKeys.has(key)) {
        otherTotal += value;
      } else {
        folded[key] = value;
      }
    }

    folded[OTHER_SERIES_KEY] = otherTotal;

    return folded;
  });

  return {
    rows: foldedRows,
    seriesKeys: [...namedKeys, OTHER_SERIES_KEY],
  };
};
