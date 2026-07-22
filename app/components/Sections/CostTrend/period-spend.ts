import {toDayKey} from '~/components/Charts/date-helpers';

/**
 * Minimal shape read for the ad-hoc series; mirrors the fields
 * `deriveEstimatedAdHocDollars` (app/data/aggregate/activity.ts) reads off a
 * `SessionSummary`, so the same filter (attribution-null AND estimated
 * basis) reproduces its total, just bucketed by period instead of summed
 * once. Bucketed by `startedAt` (when the ad-hoc work began), not
 * `endedAt`.
 */
export type AdHocSession = {
  attribution: null | {entryType: string; key: string};
  dollars: null | {
    basis: 'estimated' | 'recorded';
    lowerBound: boolean;
    value: number;
  };
  startedAt: string;
};

export type PeriodSpend = {
  buckets: PeriodSpendBucket[];
  granularity: SpendGranularity;
};

export type PeriodSpendBucket = {
  /** Estimated ad-hoc dollars in this period; 0 where no ad-hoc session
   * started here. */
  adHocDollars: number;
  /** Local calendar day-key (YYYY-MM-DD) marking the period's start. */
  periodStart: string;
  /** Recorded spec/plan dollars in this period; 0 where no priced entry
   * falls here, including every period before cost tracking existed. */
  recordedDollars: number;
};

/**
 * Minimal shape `buildPeriodSpend` reads for the recorded series; every
 * `CostEntry` satisfies this structurally, so the section passes
 * `CostEntry[]` directly and tests build lightweight fixtures without the
 * full schema.
 */
export type SpendEntry = {
  sortAt: string;
  totals: {recordedDollars: null | number};
};

export type SpendGranularity = 'month' | 'week';

const MS_PER_DAY = 86_400_000;
/** Beyond ~8-9 weeks, weekly buckets get too numerous to read as bars;
 * monthly buckets take over. Below it, weekly is more informative. */
const MAX_WEEKLY_SPAN_DAYS = 60;

const chooseGranularity = (
  windowStart: string,
  windowEnd: string
): SpendGranularity => {
  const spanDays =
    (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) /
    MS_PER_DAY;

  return spanDays > MAX_WEEKLY_SPAN_DAYS ? 'month' : 'week';
};

/** Monday-start week, matching the server's own weekly bucketing convention
 * (app/data/aggregate/activity.ts's weekStartOf) so this chart's periods line
 * up with the model-mix weekly chart elsewhere in the same tab. */
const startOfWeek = (date: Date): Date => {
  const mondayOffset = (date.getDay() + 6) % 7;

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - mondayOffset
  );
};

const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const periodStartOf = (iso: string, granularity: SpendGranularity): Date =>
  granularity === 'week' ?
    startOfWeek(new Date(iso))
  : startOfMonth(new Date(iso));

const advance = (date: Date, granularity: SpendGranularity): Date =>
  granularity === 'week' ?
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
  : new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());

/**
 * Recorded spec/plan dollars and estimated ad-hoc dollars, bucketed into the
 * same weeks or months across an explicit window (cost-trend redesign,
 * ad-hoc overlay). The window is the caller's to set: it spans the whole
 * project's activity, not just where cost tracking exists, so the ad-hoc
 * series can show the full history while the recorded series naturally sits
 * at 0 before cost tracking began (SPEC 6.1 coverage). Every period in the
 * window gets a bucket regardless of data, so gap periods render as honest
 * $0 bars rather than skewing the period-over-period comparison. Unpriced
 * entries and non-ad-hoc/non-estimated sessions contribute 0, never counted.
 */
export const buildPeriodSpend = (
  costEntries: SpendEntry[],
  adHocSessions: AdHocSession[],
  window: {end: string; start: string}
): PeriodSpend => {
  const granularity = chooseGranularity(window.start, window.end);
  const recordedSums = new Map<string, number>();

  for (const entry of costEntries) {
    const key = toDayKey(periodStartOf(entry.sortAt, granularity));

    recordedSums.set(
      key,
      (recordedSums.get(key) ?? 0) + (entry.totals.recordedDollars ?? 0)
    );
  }

  const adHocSums = new Map<string, number>();

  for (const session of adHocSessions) {
    // Same predicate as deriveEstimatedAdHocDollars: ad hoc (no spec/plan
    // attribution) AND priced by the estimate path, never a recorded one.
    if (
      session.attribution === null &&
      session.dollars?.basis === 'estimated'
    ) {
      const key = toDayKey(periodStartOf(session.startedAt, granularity));

      adHocSums.set(key, (adHocSums.get(key) ?? 0) + session.dollars.value);
    }
  }

  const buckets: PeriodSpendBucket[] = [];
  const end = periodStartOf(window.end, granularity).getTime();
  let cursor = periodStartOf(window.start, granularity);

  while (cursor.getTime() <= end) {
    const key = toDayKey(cursor);

    buckets.push({
      adHocDollars: adHocSums.get(key) ?? 0,
      periodStart: key,
      recordedDollars: recordedSums.get(key) ?? 0,
    });
    cursor = advance(cursor, granularity);
  }

  return {buckets, granularity};
};
