import type {CostEntry} from '~/data/schemas/api';

/**
 * Cumulative recorded dollars / duration across a table (feedback, shown next
 * to the specs/plans toggle). `null` only when NONE of the entries carry a
 * figure, same null-vs-zero rule as a single cell; rows with no figure are
 * otherwise skipped rather than poisoning the whole total.
 *
 * Used only inside CostTable/ (`CostTable/index.tsx`); dies with the folder
 * in Phase 3 rather than moving to `~/data/format/units`.
 */
export const sumRecordedDollars = (entries: CostEntry[]): null | number => {
  const knownValues = entries
    .map((entry) => entry.totals.recordedDollars)
    .filter((value): value is number => value !== null);

  return knownValues.length === 0 ?
      null
    : knownValues.reduce((sum, value) => sum + value, 0);
};

export const sumDurationSeconds = (entries: CostEntry[]): null | number => {
  const knownValues = entries
    .map((entry) => entry.totals.durationSeconds)
    .filter((value): value is number => value !== null);

  return knownValues.length === 0 ?
      null
    : knownValues.reduce((sum, value) => sum + value, 0);
};
