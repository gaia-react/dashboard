/**
 * Pure formatting helpers for DashboardHeader (SPEC section 6.1). Framework
 * free so the freshness line and the coverage-divergence rule are each one
 * small, directly testable function. `timeZone` is exposed only for test
 * determinism; production call sites omit it and Intl falls back to the
 * viewer's local zone (SPEC section 5).
 */

const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

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
  sessionCount: number;
  specsTotal: number;
};

/**
 * Scan-summary line: session/spec counts (SPEC 6.1). Recency now lives on
 * the refresh button (feedback), via `useRelativeTime`, so this line no
 * longer carries a "just now" tail.
 */
export const formatFreshnessLine = (input: FreshnessLineInput): string =>
  `Scanned ${pluralize(input.sessionCount, 'session')} · ${pluralize(input.specsTotal, 'spec')}`;
