import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {Buckets, SessionSummary} from '~/data/schemas/api';
import {sortAlphabetically} from '~/data/sort';

export {costEntryAnchorId} from '~/components/Sections/anchor-ids';

export {sessionAnchorId} from '~/components/Sections/anchor-ids';

/** SPEC 6.6 / PLAN D5: client-side pagination, 50 sessions per page. */
export const SESSIONS_PAGE_SIZE = 50;

/** The `all` value doubles as the sentinel for "no model filter applied". */
export const ALL_MODELS_FILTER_VALUE = 'all';

export type AttributionCounts = {
  adHoc: number;
  attributed: number;
};

export type AttributionFilterValue = 'ad-hoc' | 'all' | 'attributed';

/**
 * Ground-truth attribution split (SPEC section 9.2): computed the same way
 * regardless of the active filters, so it stays comparable to the KPI row
 * and spec detail links, which partition the identical `sessions` array by
 * the same `attribution !== null` rule.
 */
export const countSessionsByAttribution = (
  sessions: SessionSummary[]
): AttributionCounts =>
  sessions.reduce<AttributionCounts>(
    (counts, session) =>
      session.attribution ?
        {...counts, attributed: counts.attributed + 1}
      : {...counts, adHoc: counts.adHoc + 1},
    {adHoc: 0, attributed: 0}
  );

/** Every distinct model across all sessions, alphabetical, for the model filter options. */
export const uniqueModelNames = (sessions: SessionSummary[]): string[] =>
  sortAlphabetically([
    ...new Set(sessions.flatMap((session) => session.models)),
  ]);

/**
 * Attribution and model filters, applied together (PLAN D5: filters run
 * BEFORE pagination, never after).
 */
export const filterSessions = (
  sessions: SessionSummary[],
  attributionFilter: AttributionFilterValue,
  modelFilter: string
): SessionSummary[] =>
  sessions.filter((session) => {
    const isAttributed = session.attribution !== null;
    const matchesAttribution =
      attributionFilter === 'all' ||
      (attributionFilter === 'attributed' && isAttributed) ||
      (attributionFilter === 'ad-hoc' && !isAttributed);
    const matchesModel =
      modelFilter === ALL_MODELS_FILTER_VALUE ||
      session.models.includes(modelFilter);

    return matchesAttribution && matchesModel;
  });

/** Slices an already-filtered list to one 1-indexed page. */
export const paginateSessions = (
  sessions: SessionSummary[],
  page: number
): SessionSummary[] => {
  const startIndex = (page - 1) * SESSIONS_PAGE_SIZE;

  return sessions.slice(startIndex, startIndex + SESSIONS_PAGE_SIZE);
};

/** Always at least one page, even for an empty (filtered) result. */
export const totalPageCount = (sessionCount: number): number =>
  Math.max(1, Math.ceil(sessionCount / SESSIONS_PAGE_SIZE));

export const totalTokenCount = (buckets: Buckets): number =>
  buckets.freshInput + buckets.cacheWrite + buckets.cacheRead + buckets.output;

/** Title fallback chain (SPEC section 6.6): the server already resolves
 * ai-title / truncated last-prompt into `title`; the client's only
 * remaining fallback is the raw session id. */
export const sessionDisplayTitle = (session: SessionSummary): string =>
  session.title ?? session.sessionId;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export const formatSessionDuration = (durationSeconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
};

// Locale fixed to 'en-US' (not a prop): this section takes only `sessions`
// per the Phase 5 contract, and a fixed locale keeps currency/date-time
// output deterministic in tests without plumbing a locale prop through.
const dollarsFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
});

export const formatSessionDollars = (value: number): string =>
  dollarsFormatter.format(value);

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Renders in the viewer's local timezone (SPEC section 5): Intl resolves
 * the system timezone when none is given. */
export const formatSessionDateTime = (isoTimestamp: string): string =>
  dateTimeFormatter.format(new Date(isoTimestamp));

export const formatSessionTokenCount = (value: number): string =>
  formatCompactNumber(value, 'en-US');
