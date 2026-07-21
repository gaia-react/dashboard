import {canonicalizeTimestamp} from '~/data/aggregate/timestamp';
import type {SessionScan, TokenBuckets} from '~/data/parse/session-scan';
import type {RateTableLoad} from '~/data/pricing/rates';
import {estimateDollars} from '~/data/pricing/rates';
import type {ActivityResponse, SessionSummary} from '~/data/schemas/api';

/**
 * Activity aggregation (SPEC sections 6.4-6.6; PLAN D4): folds W3's
 * timezone-independent hourly-UTC session buckets into viewer-local days for
 * the requested IANA timezone, and derives the model mix, weekly stacks,
 * activity KPIs, and session summaries.
 *
 * Timezone fold imprecision (PLAN D4, accepted for v1): the cache stores
 * HOURLY buckets, so a 30/45-minute-offset zone (e.g. Asia/Kolkata,
 * Australia/Eucla) can misassign up to 45 minutes of activity at local day
 * boundaries; whole-hour-offset zones fold exactly.
 *
 * Granular token buckets never cross the API boundary (Phase 8 v2 redesign):
 * every figure below is a `totalTokens` scalar (fresh input + cache write +
 * cache read + output). Two of the mapped fields are metric changes, not
 * renames: the heatmap cell and `modelWeekly[].tokensByModel` both switch
 * from output tokens to total tokens, because users asked for total tokens,
 * not model-work-performed specifically.
 */

export type ActivityAggregation = {
  /** Earliest session start across all scans, null with no timed activity. */
  activitySince: null | string;
  heatmap: ActivityResponse['heatmap'];
  kpis: ActivityResponse['kpis'];
  modelTotals: ActivityResponse['modelTotals'];
  modelWeekly: ActivityResponse['modelWeekly'];
  /** Reverse-chronological (startedAt), full set; the client paginates. */
  sessions: SessionSummary[];
  /**
   * Sessions omitted from `sessions` because no included message carried a
   * parseable timestamp, or the session span's raw timestamp was wholly
   * unparseable (the API summary requires a canonical span). Surfaced so the
   * handler can note them in parse health; their tokens still count in
   * `kpis.totalTokens` and `modelTotals`.
   */
  untimedSessionIds: string[];
};

export type AggregateActivityOptions = {
  rateTable: RateTableLoad;
  /** Authoritative dollars per session from cost.jsonl terminal rows (W1). */
  recordedDollarsBySession: ReadonlyMap<string, number>;
  resolveAttribution?: SessionAttributionResolver;
  scans: SessionScan[];
  /** IANA timezone name the local-day fold uses. Callers validate it. */
  timeZone: string;
};

/**
 * Maps a session id to its cost attribution, null for ad hoc. The activity
 * handler wires W7's `reconcile/attribution` join in; the all-ad-hoc default
 * only applies when aggregating in isolation (tests).
 */
export type SessionAttributionResolver = (
  sessionId: string
) => SessionSummary['attribution'];

/** Keep at most this many named model series; the tail groups into "other". */
const MAX_MODEL_SERIES = 6;
const OTHER_SERIES = 'other';
const MILLISECONDS_PER_DAY = 86_400_000;

/** Total tokens across all four buckets of one model's usage. */
const totalOf = (buckets: TokenBuckets): number =>
  buckets.cacheRead + buckets.cacheWrite + buckets.freshInput + buckets.output;

/** Memoized per-timezone formatters; en-CA renders YYYY-MM-DD. */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

const getDayFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = dayFormatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    });
    dayFormatters.set(timeZone, formatter);
  }

  return formatter;
};

/** Local calendar day (YYYY-MM-DD) of a UTC instant in the given timezone. */
const localDayOf = (utcInstant: string, timeZone: string): string =>
  getDayFormatter(timeZone).format(new Date(utcInstant));

/** Monday-start week key (YYYY-MM-DD) for a local calendar day. */
const weekStartOf = (day: string): string => {
  const milliseconds = Date.parse(`${day}T00:00:00Z`);
  const mondayOffset = (new Date(milliseconds).getUTCDay() + 6) % 7;

  return new Date(milliseconds - mondayOffset * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
};

type DayFold = {
  sessionIds: Set<string>;
  tokensByModel: Map<string, number>;
  totalTokens: number;
};

/** Fold hourly-UTC buckets into local days for the requested timezone. */
const foldIntoLocalDays = (
  scans: SessionScan[],
  timeZone: string
): Map<string, DayFold> => {
  const days = new Map<string, DayFold>();

  for (const scan of scans) {
    for (const [hourKey, models] of Object.entries(scan.hourlyUtc)) {
      const day = localDayOf(hourKey, timeZone);
      const fold = days.get(day) ?? {
        sessionIds: new Set<string>(),
        tokensByModel: new Map<string, number>(),
        totalTokens: 0,
      };

      fold.sessionIds.add(scan.sessionId);

      for (const [model, buckets] of Object.entries(models)) {
        const total = totalOf(buckets);

        fold.totalTokens += total;
        fold.tokensByModel.set(
          model,
          (fold.tokensByModel.get(model) ?? 0) + total
        );
      }

      days.set(day, fold);
    }
  }

  return days;
};

/**
 * Total tokens per model, summed from each session's OWN totals
 * (`scan.byModel`, already a whole-session aggregate) rather than re-derived
 * from the hourly-UTC fold.
 */
const sumTotalTokensByModel = (scans: SessionScan[]): Map<string, number> => {
  const totals = new Map<string, number>();

  for (const scan of scans) {
    for (const [model, buckets] of Object.entries(scan.byModel)) {
      totals.set(model, (totals.get(model) ?? 0) + totalOf(buckets));
    }
  }

  return totals;
};

/**
 * When more than MAX_MODEL_SERIES models exist, keep the top series by total
 * tokens and map the tail onto "other" (SPEC section 6.5; the chart layer
 * also enforces this, but the data stays honest: "other" carries real
 * totals, so sums are preserved).
 */
const buildSeriesMapper = (
  totalsByModel: Map<string, number>
): ((model: string) => string) => {
  if (totalsByModel.size <= MAX_MODEL_SERIES) {
    return (model) => model;
  }

  // Named binding first: canonical/no-use-extend-native false-positives on
  // `toSorted` called directly on an array-literal expression.
  const entries = [...totalsByModel.entries()];
  const ranked = entries
    .toSorted(
      ([modelA, totalA], [modelB, totalB]) =>
        totalB - totalA || modelA.localeCompare(modelB)
    )
    .map(([model]) => model);
  const kept = new Set(ranked.slice(0, MAX_MODEL_SERIES));

  return (model) => (kept.has(model) ? model : OTHER_SERIES);
};

const buildModelTotals = (
  totalsByModel: Map<string, number>,
  mapSeries: (model: string) => string
): ActivityResponse['modelTotals'] => {
  const grouped = new Map<string, number>();

  for (const [model, total] of totalsByModel) {
    const series = mapSeries(model);

    grouped.set(series, (grouped.get(series) ?? 0) + total);
  }

  return [...grouped.entries()]
    .map(([model, totalTokens]) => ({model, totalTokens}))
    .toSorted((a, b) => {
      if (a.model === OTHER_SERIES) {
        return 1;
      }

      if (b.model === OTHER_SERIES) {
        return -1;
      }

      return b.totalTokens - a.totalTokens || a.model.localeCompare(b.model);
    });
};

const buildModelWeekly = (
  days: Map<string, DayFold>,
  mapSeries: (model: string) => string
): ActivityResponse['modelWeekly'] => {
  const weeks = new Map<string, Record<string, number>>();

  for (const [day, fold] of days) {
    const weekStart = weekStartOf(day);
    const tokensByModel = weeks.get(weekStart) ?? {};

    for (const [model, total] of fold.tokensByModel) {
      const series = mapSeries(model);

      tokensByModel[series] = (tokensByModel[series] ?? 0) + total;
    }

    weeks.set(weekStart, tokensByModel);
  }

  return [...weeks.entries()]
    .map(([weekStart, tokensByModel]) => ({tokensByModel, weekStart}))
    .toSorted((a, b) => a.weekStart.localeCompare(b.weekStart));
};

/**
 * True when a priced (claude-*) model's authoritative cache-write total
 * exceeds its 5m/1h TTL split: old transcript lines can omit
 * `usage.cache_creation`, leaving cache-write tokens the estimate cannot
 * price, so the figure is a floor.
 */
const hasUnpricedCacheWrite = (
  byModel: Record<string, TokenBuckets>
): boolean =>
  Object.entries(byModel).some(
    ([model, buckets]) =>
      model.startsWith('claude-') &&
      buckets.cacheWrite > buckets.cacheWrite1h + buckets.cacheWrite5m
  );

/**
 * Session dollars (SPEC section 6.6): recorded where cost.jsonl priced the
 * session (authoritative), else W4-estimated at the session-end anchor, else
 * null when the rate table is unusable. Recorded and estimated figures never
 * combine (SPEC section 5 rule 3).
 */
const deriveSessionDollars = (
  scan: SessionScan,
  options: AggregateActivityOptions,
  anchor: string
): SessionSummary['dollars'] => {
  const recorded = options.recordedDollarsBySession.get(scan.sessionId);

  if (recorded !== undefined) {
    return {basis: 'recorded', lowerBound: false, value: recorded};
  }

  if (options.rateTable.status !== 'ok') {
    return null;
  }

  const estimate = estimateDollars(
    options.rateTable.table,
    scan.byModel,
    anchor
  );

  return {
    basis: 'estimated',
    lowerBound: estimate.lowerBound || hasUnpricedCacheWrite(scan.byModel),
    value: estimate.dollars,
  };
};

/** Session-level total tokens, summed from the session's OWN per-model totals. */
const sessionTotalTokens = (scan: SessionScan): number => {
  let totalTokens = 0;

  for (const buckets of Object.values(scan.byModel)) {
    totalTokens += totalOf(buckets);
  }

  return totalTokens;
};

const toSessionSummary = (
  scan: SessionScan,
  options: AggregateActivityOptions,
  span: {endedAt: string; startedAt: string}
): SessionSummary => ({
  attribution: (options.resolveAttribution ?? (() => null))(scan.sessionId),
  dollars: deriveSessionDollars(scan, options, span.endedAt),
  durationSeconds: scan.durationSeconds ?? 0,
  endedAt: span.endedAt,
  gitBranch: scan.gitBranch ?? null,
  models: scan.models,
  sessionId: scan.sessionId,
  startedAt: span.startedAt,
  // W3's title fallback chain ends at the uuid; the API contract sends null
  // there instead and lets the client render the uuid (PLAN section 3).
  title: scan.title === scan.sessionId ? null : scan.title,
  totalTokens: sessionTotalTokens(scan),
  turnCount: scan.turnCount,
});

const buildSessions = (
  options: AggregateActivityOptions
): {sessions: SessionSummary[]; untimedSessionIds: string[]} => {
  const sessions: SessionSummary[] = [];
  const untimedSessionIds: string[] = [];

  for (const scan of options.scans) {
    const startedAt = canonicalizeTimestamp(scan.startedAt);
    const endedAt = canonicalizeTimestamp(scan.endedAt);

    if (startedAt !== null && endedAt !== null) {
      sessions.push(toSessionSummary(scan, options, {endedAt, startedAt}));
    } else {
      untimedSessionIds.push(scan.sessionId);
    }
  }

  sessions.sort(
    (a, b) =>
      Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
      a.sessionId.localeCompare(b.sessionId)
  );

  return {sessions, untimedSessionIds};
};

/**
 * Estimated ad hoc spend (SPEC section 5.4): the sum of ESTIMATED session
 * figures over ad hoc (attribution-null) sessions only. Null when the rate
 * table is unusable. Sessions priced by cost.jsonl carry `basis: 'recorded'`
 * and are excluded here, so recorded and estimated dollars never sum into
 * one figure (SPEC section 5 rule 3).
 */
const deriveEstimatedAdHocDollars = (
  sessions: SessionSummary[],
  rateTable: RateTableLoad
): ActivityResponse['kpis']['estimatedAdHocDollars'] => {
  if (rateTable.status !== 'ok') {
    return null;
  }

  let value = 0;
  let lowerBound = false;

  for (const session of sessions) {
    if (
      session.attribution === null &&
      session.dollars?.basis === 'estimated'
    ) {
      value += session.dollars.value;
      lowerBound ||= session.dollars.lowerBound;
    }
  }

  return {lowerBound, value};
};

export const aggregateActivity = (
  options: AggregateActivityOptions
): ActivityAggregation => {
  const days = foldIntoLocalDays(options.scans, options.timeZone);
  const totalsByModel = sumTotalTokensByModel(options.scans);
  const mapSeries = buildSeriesMapper(totalsByModel);
  const {sessions, untimedSessionIds} = buildSessions(options);

  const heatmap = [...days.entries()]
    .map(([date, fold]) => ({
      date,
      sessionCount: fold.sessionIds.size,
      totalTokens: fold.totalTokens,
    }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  let totalTokens = 0;

  for (const total of totalsByModel.values()) {
    totalTokens += total;
  }

  let activitySince: null | string = null;

  for (const scan of options.scans) {
    const startedAt = canonicalizeTimestamp(scan.startedAt);

    if (
      startedAt !== null &&
      (activitySince === null ||
        Date.parse(startedAt) < Date.parse(activitySince))
    ) {
      activitySince = startedAt;
    }
  }

  return {
    activitySince,
    heatmap,
    kpis: {
      activeDays: heatmap.length,
      estimatedAdHocDollars: deriveEstimatedAdHocDollars(
        sessions,
        options.rateTable
      ),
      totalTokens,
    },
    modelTotals: buildModelTotals(totalsByModel, mapSeries),
    modelWeekly: buildModelWeekly(days, mapSeries),
    sessions,
    untimedSessionIds,
  };
};
