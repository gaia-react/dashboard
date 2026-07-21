import {formatCompactNumber} from '~/components/Charts/scale-helpers';

/**
 * Placeholder for a missing recorded-cost (or duration) figure (SPEC section
 * 6.3, feedback): a single dash renders in each gap cell, with the reason
 * explained once above the table, never per-cell. Distinct from a real zero,
 * which encodes as an actual `$0.00` / `0m`.
 */
export const NO_DATA_LABEL = '-';

const DOLLARS_OPTIONS: Intl.NumberFormatOptions = {
  currency: 'USD',
  style: 'currency',
};
/** `locale` is undefined on every real call; only tests pass one explicitly.
 * Reuse this hoisted formatter on that common path instead of rebuilding one
 * per table row. */
const defaultDollarsFormat = new Intl.NumberFormat(undefined, DOLLARS_OPTIONS);

export const formatDollars = (value: number, locale?: string): string =>
  (locale === undefined ? defaultDollarsFormat : (
    new Intl.NumberFormat(locale, DOLLARS_OPTIONS)
  )
  ).format(value);

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

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};
const defaultDateTimeFormat = new Intl.DateTimeFormat(
  undefined,
  DATE_TIME_OPTIONS
);

export const formatDateTime = (iso: string, locale?: string): string =>
  (locale === undefined ?
    defaultDateTimeFormat
  : new Intl.DateTimeFormat(locale, DATE_TIME_OPTIONS)
  ).format(new Date(iso));

export const formatTokens = (value: number, locale?: string): string =>
  formatCompactNumber(value, locale);
