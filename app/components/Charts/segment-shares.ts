/**
 * Phase composition geometry (DESIGN-SPEC 6.4): a value list to display
 * percentages of the total. A null value has no recorded figure and is
 * skipped from the segments entirely (reported separately, in `nullKeys`,
 * for a footnote); it is never treated as zero. A real recorded zero is
 * also omitted from the segments, since a zero-value segment renders
 * nothing visible anyway. Every remaining segment's percent is floored at
 * 1% so a real, non-zero, sub-1% phase never displays as "0%".
 */

export type PhaseAmount = {
  key: string;
  value: null | number;
};

export type PhaseSegment = {
  key: string;
  percent: number;
  value: number;
};

const MINIMUM_DISPLAY_PERCENT = 1;

export const segmentShares = (
  amounts: PhaseAmount[]
): {nullKeys: string[]; segments: PhaseSegment[]} => {
  const nullKeys = amounts
    .filter((amount) => amount.value === null)
    .map((amount) => amount.key);
  const positive = amounts.filter(
    (amount): amount is {key: string; value: number} =>
      typeof amount.value === 'number' && amount.value > 0
  );
  const total = positive.reduce((sum, amount) => sum + amount.value, 0);

  if (total <= 0) {
    return {nullKeys, segments: []};
  }

  const segments = positive.map(({key, value}) => ({
    key,
    percent: Math.max(
      MINIMUM_DISPLAY_PERCENT,
      Math.round((value / total) * 100)
    ),
    value,
  }));

  return {nullKeys, segments};
};
