import type {SessionScan, TokenBuckets} from '~/data/parse/session-scan';
import type {RateTableLoad} from '~/data/pricing/rates';
import {estimateDollars} from '~/data/pricing/rates';
import type {
  ActivityResponse,
  Buckets,
  SessionSummary,
} from '~/data/schemas/api';

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
   * parseable timestamp (the API summary requires a span). Surfaced so the
   * handler can note them in parse health; their tokens still count in
   * `kpis.totalBuckets` and `modelTotals`.
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

const emptyBuckets = (): Buckets => ({
  cacheRead: 0,
  cacheWrite: 0,
  freshInput: 0,
  output: 0,
});

const addBuckets = (target: Buckets, source: TokenBuckets): void => {
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.freshInput += source.freshInput;
  target.output += source.output;
};

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
  buckets: Buckets;
  outputByModel: Map<string, number>;
  sessionIds: Set<string>;
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
        buckets: emptyBuckets(),
        outputByModel: new Map<string, number>(),
        sessionIds: new Set<string>(),
      };

      fold.sessionIds.add(scan.sessionId);

      for (const [model, buckets] of Object.entries(models)) {
        addBuckets(fold.buckets, buckets);
        fold.outputByModel.set(
          model,
          (fold.outputByModel.get(model) ?? 0) + buckets.output
        );
      }

      days.set(day, fold);
    }
  }

  return days;
};

const sumByModel = (scans: SessionScan[]): Map<string, TokenBuckets> => {
  const totals = new Map<string, TokenBuckets>();

  for (const scan of scans) {
    for (const [model, buckets] of Object.entries(scan.byModel)) {
      const total = totals.get(model) ?? {
        cacheRead: 0,
        cacheWrite: 0,
        cacheWrite1h: 0,
        cacheWrite5m: 0,
        freshInput: 0,
        output: 0,
      };

      total.cacheRead += buckets.cacheRead;
      total.cacheWrite += buckets.cacheWrite;
      total.cacheWrite1h += buckets.cacheWrite1h;
      total.cacheWrite5m += buckets.cacheWrite5m;
      total.freshInput += buckets.freshInput;
      total.output += buckets.output;
      totals.set(model, total);
    }
  }

  return totals;
};

/**
 * When more than MAX_MODEL_SERIES models exist, keep the top series by total
 * output and map the tail onto "other" (SPEC section 6.5; the chart layer
 * also enforces this, but the data stays honest: "other" carries real
 * totals, so sums are preserved).
 */
const buildSeriesMapper = (
  totalsByModel: Map<string, TokenBuckets>
): ((model: string) => string) => {
  if (totalsByModel.size <= MAX_MODEL_SERIES) {
    return (model) => model;
  }

  // Named binding first: canonical/no-use-extend-native false-positives on
  // `toSorted` called directly on an array-literal expression.
  const entries = [...totalsByModel.entries()];
  const ranked = entries
    .toSorted(
      ([modelA, bucketsA], [modelB, bucketsB]) =>
        bucketsB.output - bucketsA.output || modelA.localeCompare(modelB)
    )
    .map(([model]) => model);
  const kept = new Set(ranked.slice(0, MAX_MODEL_SERIES));

  return (model) => (kept.has(model) ? model : OTHER_SERIES);
};

const buildModelTotals = (
  totalsByModel: Map<string, TokenBuckets>,
  mapSeries: (model: string) => string
): ActivityResponse['modelTotals'] => {
  const grouped = new Map<string, Buckets>();

  for (const [model, buckets] of totalsByModel) {
    const series = mapSeries(model);
    const total = grouped.get(series) ?? emptyBuckets();

    addBuckets(total, buckets);
    grouped.set(series, total);
  }

  return [...grouped.entries()]
    .map(([model, buckets]) => ({buckets, model}))
    .toSorted((a, b) => {
      if (a.model === OTHER_SERIES) {
        return 1;
      }

      if (b.model === OTHER_SERIES) {
        return -1;
      }

      return (
        b.buckets.output - a.buckets.output || a.model.localeCompare(b.model)
      );
    });
};

const buildModelWeekly = (
  days: Map<string, DayFold>,
  mapSeries: (model: string) => string
): ActivityResponse['modelWeekly'] => {
  const weeks = new Map<string, Record<string, number>>();

  for (const [day, fold] of days) {
    const weekStart = weekStartOf(day);
    const outputByModel = weeks.get(weekStart) ?? {};

    for (const [model, output] of fold.outputByModel) {
      const series = mapSeries(model);

      outputByModel[series] = (outputByModel[series] ?? 0) + output;
    }

    weeks.set(weekStart, outputByModel);
  }

  return [...weeks.entries()]
    .map(([weekStart, outputByModel]) => ({outputByModel, weekStart}))
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

const toSessionSummary = (
  scan: SessionScan,
  options: AggregateActivityOptions,
  span: {endedAt: string; startedAt: string}
): SessionSummary => {
  const buckets = emptyBuckets();

  for (const modelBuckets of Object.values(scan.byModel)) {
    addBuckets(buckets, modelBuckets);
  }

  return {
    attribution: (options.resolveAttribution ?? (() => null))(scan.sessionId),
    buckets,
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
    turnCount: scan.turnCount,
  };
};

const buildSessions = (
  options: AggregateActivityOptions
): {sessions: SessionSummary[]; untimedSessionIds: string[]} => {
  const sessions: SessionSummary[] = [];
  const untimedSessionIds: string[] = [];

  for (const scan of options.scans) {
    if (scan.startedAt !== undefined && scan.endedAt !== undefined) {
      sessions.push(
        toSessionSummary(scan, options, {
          endedAt: scan.endedAt,
          startedAt: scan.startedAt,
        })
      );
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
  const totalsByModel = sumByModel(options.scans);
  const mapSeries = buildSeriesMapper(totalsByModel);
  const {sessions, untimedSessionIds} = buildSessions(options);

  const heatmap = [...days.entries()]
    .map(([date, fold]) => ({
      buckets: fold.buckets,
      date,
      sessionCount: fold.sessionIds.size,
    }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  const totalBuckets = emptyBuckets();

  for (const buckets of totalsByModel.values()) {
    addBuckets(totalBuckets, buckets);
  }

  let activitySince: null | string = null;

  for (const scan of options.scans) {
    if (
      scan.startedAt !== undefined &&
      (activitySince === null ||
        Date.parse(scan.startedAt) < Date.parse(activitySince))
    ) {
      activitySince = scan.startedAt;
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
      totalBuckets,
    },
    modelTotals: buildModelTotals(totalsByModel, mapSeries),
    modelWeekly: buildModelWeekly(days, mapSeries),
    sessions,
    untimedSessionIds,
  };
};
