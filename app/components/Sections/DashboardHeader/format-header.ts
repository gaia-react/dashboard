/**
 * Pure formatting helpers for DashboardHeader (SPEC section 6.1). Framework
 * free so the freshness line and the coverage-divergence rule are each one
 * small, directly testable function. `timeZone` is exposed only for test
 * determinism; production call sites omit it and Intl falls back to the
 * viewer's local zone (SPEC section 5).
 */

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Relative recency for the freshness line ("just now", "5 minutes ago"). */
export const formatScannedAt = (
  scannedAt: string,
  now: Date = new Date()
): string => {
  const elapsedSeconds = Math.max(
    0,
    (now.getTime() - new Date(scannedAt).getTime()) / 1000
  );

  if (elapsedSeconds < SECONDS_PER_MINUTE) {
    return 'just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);

  if (elapsedMinutes < MINUTES_PER_HOUR) {
    return `${pluralize(elapsedMinutes, 'minute')} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / MINUTES_PER_HOUR);

  if (elapsedHours < HOURS_PER_DAY) {
    return `${pluralize(elapsedHours, 'hour')} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / HOURS_PER_DAY);

  return `${pluralize(elapsedDays, 'day')} ago`;
};

/** A UTC instant as a `YYYY-MM-DD` calendar date in the given (or local) zone. */
export const formatLocalDate = (
  isoTimestamp: string,
  timeZone?: string
): string =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(new Date(isoTimestamp));

/**
 * The date this project first shows any signal: the earlier of the first cost
 * row and the first session-log activity. Once tracking is always-on from
 * release, a coverage-divergence disclosure is noise; a single "project
 * started" date is the useful fact. Null only when neither dataset exists yet
 * (a fresh adopter), in which case the header shows no start line at all.
 */
export const formatProjectStart = (
  costSince: null | string,
  activitySince: null | string,
  timeZone?: string
): null | string => {
  const candidates = [costSince, activitySince].filter(
    (value): value is string => value !== null
  );

  if (candidates.length === 0) {
    return null;
  }

  const earliest = candidates.reduce(
    (oldest, value) =>
      new Date(value).getTime() < new Date(oldest).getTime() ? value : oldest,
    candidates[0]
  );

  return formatLocalDate(earliest, timeZone);
};

export type FreshnessLineInput = {
  scannedAt: string;
  sessionCount: number;
  specsTotal: number;
};

export const formatFreshnessLine = (
  input: FreshnessLineInput,
  now?: Date
): string =>
  `Scanned ${pluralize(input.sessionCount, 'session')} · ${pluralize(input.specsTotal, 'spec')} · ${formatScannedAt(input.scannedAt, now)}`;
