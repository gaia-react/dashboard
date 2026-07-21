/**
 * Linear meter geometry (DESIGN-SPEC 6.2, 11.6: the gauge is a linear meter,
 * not an arc). A single ratio against a limit. An out-of-range value is real
 * data (an audit costing more than its phase total is possible with mixed
 * sources), so the meter clamps its own fill rather than misdrawing past the
 * track; the true figure is labeled separately, never inferred from the
 * clamped width alone.
 */

const MINIMUM_VISIBLE_PERCENT = 2;
const MAXIMUM_PERCENT = 100;

/** Ratio of value to max, clamped to [0, 1]. max <= 0 means no share can be
 * computed (there is nothing to divide by), so it returns 0 rather than
 * dividing by zero or a negative limit. */
export const clampShare = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, value / max));
};

/** A 0-1 share to a track-fill percentage, floored at 2% so a real but tiny
 * non-zero share (e.g. 0.3%) still shows a visible sliver of fill. */
export const meterWidthPercent = (share: number): number => {
  if (share <= 0) {
    return 0;
  }

  return Math.max(
    MINIMUM_VISIBLE_PERCENT,
    Math.min(MAXIMUM_PERCENT, share * MAXIMUM_PERCENT)
  );
};
