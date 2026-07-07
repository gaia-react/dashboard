import {toDayKey} from '~/components/Charts/date-helpers';

export type PeriodSpend = {
  buckets: PeriodSpendBucket[];
  granularity: SpendGranularity;
};

export type PeriodSpendBucket = {
  /** Recorded dollars summed over this period; 0 for a period with no
   * priced entries (still rendered, not skipped, so adjacent bars stay a
   * fair period-over-period comparison). */
  dollars: number;
  /** Local calendar day-key (YYYY-MM-DD) marking the period's start. */
  periodStart: string;
};

/**
 * Minimal shape `buildPeriodSpend` reads; every `CostEntry` satisfies this
 * structurally (same precedent as CostTable/sort.ts's `SortableCostEntry`), so
 * the section passes `CostEntry[]` directly and tests build lightweight
 * fixtures without the full schema.
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
  firstIso: string,
  lastIso: string
): SpendGranularity => {
  const spanDays =
    (new Date(lastIso).getTime() - new Date(firstIso).getTime()) / MS_PER_DAY;

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
 * Where the trend window starts. `costSince` (SPEC 6.1 coverage: the
 * earliest cost ROW ts) wins over the first entry's own date when it's later
 * than it: cost recording didn't exist before it, so entries older than it
 * are guaranteed unpriced and would only pad the chart with dead $0 bars.
 * Clamped both ways: never earlier than the first entry (nothing to bucket
 * before it), and never later than the earliest entry that actually carries
 * a recorded dollar figure, so a real dollar can never fall outside the
 * window and silently disappear from the chart.
 */
const resolveWindowStart = (
  entries: SpendEntry[],
  firstEntryIso: string,
  costSince: null | string
): string => {
  const earliestPricedIso = entries.find(
    (entry) => entry.totals.recordedDollars !== null
  )?.sortAt;
  let windowStart = costSince ?? firstEntryIso;

  if (windowStart < firstEntryIso) {
    windowStart = firstEntryIso;
  }

  if (earliestPricedIso !== undefined && earliestPricedIso < windowStart) {
    windowStart = earliestPricedIso;
  }

  return windowStart;
};

/**
 * Recorded dollars per week or month (cost-trend redesign: period-over-period
 * bars replace the cumulative running total). Granularity is derived from the
 * trend window's own span, not hardcoded: a project spanning a couple of
 * months reads clearest as weekly bars, a longer history collapses to
 * monthly. Every period between the window's start and the last entry gets a
 * bucket, even ones with no priced (or no) entries, so gap periods render as
 * an honest $0 bar rather than vanishing and skewing the period-over-period
 * comparison. Unpriced entries (`recordedDollars === null`) contribute 0 to
 * their period, same rule as before: only recorded dollars are ever plotted.
 *
 * `costSince` (`CostsResponse.coverage.costSince`) is optional so existing
 * callers/tests can omit it; without it the window just starts at the first
 * entry, as before.
 */
export const buildPeriodSpend = (
  entries: SpendEntry[],
  costSince: null | string = null
): PeriodSpend => {
  const firstEntryIso = entries.at(0)?.sortAt;
  const lastIso = entries.at(-1)?.sortAt;

  if (firstEntryIso === undefined || lastIso === undefined) {
    return {buckets: [], granularity: 'week'};
  }

  const windowStartIso = resolveWindowStart(entries, firstEntryIso, costSince);
  const granularity = chooseGranularity(windowStartIso, lastIso);
  const sums = new Map<string, number>();

  for (const entry of entries) {
    const key = toDayKey(periodStartOf(entry.sortAt, granularity));

    sums.set(key, (sums.get(key) ?? 0) + (entry.totals.recordedDollars ?? 0));
  }

  const buckets: PeriodSpendBucket[] = [];
  const end = periodStartOf(lastIso, granularity).getTime();
  let cursor = periodStartOf(windowStartIso, granularity);

  while (cursor.getTime() <= end) {
    const key = toDayKey(cursor);

    buckets.push({dollars: sums.get(key) ?? 0, periodStart: key});
    cursor = advance(cursor, granularity);
  }

  return {buckets, granularity};
};
