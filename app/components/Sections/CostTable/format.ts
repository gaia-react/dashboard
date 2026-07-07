import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {Buckets} from '~/data/schemas/api';

export {costEntryAnchorId} from '~/components/Sections/anchor-ids';

export {sessionAnchorId} from '~/components/Sections/anchor-ids';

/**
 * Em-free label for a missing recorded-cost (or duration) figure (SPEC
 * section 6.3): "no data" renders once per gap cell, with the reason
 * explained a single time above the table (`CostTableNote`), never
 * per-cell.
 */
export const NO_DATA_LABEL = 'no data';

export const sumBuckets = (buckets: Buckets): number =>
  buckets.freshInput + buckets.cacheWrite + buckets.cacheRead + buckets.output;

export const formatTokens = (value: number, locale?: string): string =>
  formatCompactNumber(value, locale);

export const formatDollars = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale, {currency: 'USD', style: 'currency'}).format(
    value
  );

/** Recorded dollars only (SPEC section 5 rule 3); never an estimate. */
export const formatDollarsCell = (
  value: null | number,
  locale?: string
): string => (value === null ? NO_DATA_LABEL : formatDollars(value, locale));

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** Elapsed = summed phase durations (already computed upstream). */
export const formatDuration = (seconds: null | number): string => {
  if (seconds === null) {
    return NO_DATA_LABEL;
  }

  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
};

export const formatDateTime = (iso: string, locale?: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
