import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';
import {formatWeekLabel, parseDayKey} from '~/components/Charts/date-helpers';
import PeriodSpendBars from '~/components/Charts/PeriodSpendBars';
import type {PeriodBarDatum} from '~/components/Charts/PeriodSpendBars';
import EmptyState from '~/components/EmptyState';
import type {
  PeriodSpendBucket,
  SpendGranularity,
} from '~/components/Sections/CostTrend/period-spend';
import {buildPeriodSpend} from '~/components/Sections/CostTrend/period-spend';
import Skeleton, {shimmer} from '~/components/Skeleton';
import {formatDollars} from '~/data/format/units';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

export type CostTrendProps = {
  /** The already-fetched /api/activity response; the ad-hoc series comes
   * from its sessions, so this section now needs both resources. */
  activity: ActivityResponse;
  /** The already-fetched /api/costs response (AsyncSection's render-prop). */
  costs: CostsResponse;
  locale?: string;
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-4 rounded-md border p-6';

export const eyebrowClassName =
  'text-accent-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'text-fg text-title font-medium';

export const captionClassName = 'text-fg-mute text-sm';

const MONTH_LABEL_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric',
};

/** No `date-helpers` export formats a month, only a day/week; `week` reuses
 * `formatWeekLabel` (day+month), `month` builds "MMM YYYY" directly off the
 * same `parseDayKey` local-date parsing. */
const formatPeriodLabel = (
  periodStart: string,
  granularity: SpendGranularity,
  locale: string | undefined
): string =>
  granularity === 'week' ?
    formatWeekLabel(periodStart, locale)
  : new Intl.DateTimeFormat(locale, MONTH_LABEL_OPTIONS).format(
      parseDayKey(periodStart)
    );

/**
 * Earliest / latest of a set of possibly-null ISO-8601 timestamps, or
 * undefined when none are dated. ISO-8601 strings sort chronologically under
 * default lexicographic order, so `toSorted()` yields the min/max. Do NOT
 * "simplify" these to `Math.min`/`Math.max` (which coerce the strings to NaN
 * and collapse the whole window) or to a bare `reduce` (reduce-initial-value).
 */
const earliestOf = (
  values: (null | string | undefined)[]
): string | undefined => {
  const dated = values.filter(
    (value): value is string => value !== null && value !== undefined
  );

  return dated.toSorted((a, b) => a.localeCompare(b)).at(0);
};

const latestOf = (
  values: (null | string | undefined)[]
): string | undefined => {
  const dated = values.filter(
    (value): value is string => value !== null && value !== undefined
  );

  return dated.toSorted((a, b) => a.localeCompare(b)).at(-1);
};

/**
 * The window spans the whole project's activity (SPEC 6.7 ad-hoc overlay),
 * not just where cost tracking exists, and it must never clip a real dollar
 * in either series: costs and activity are two separately-reconciled data
 * sources (OVERVIEW.md), so either one's "since" mark can predate the
 * other's. Start is the earliest of both sides' "since" marks and both
 * series' actual earliest dated dollar; end is the latest of "now"
 * (`scannedAt`) and both series' actual latest dated dollar. Falls back to
 * `scannedAt` (always present) when nothing is dated at all.
 */
const resolveWindow = (
  costs: CostsResponse,
  activity: ActivityResponse
): {end: string; start: string} => {
  // Same predicate as buildPeriodSpend/deriveEstimatedAdHocDollars: only
  // ad-hoc, estimated-basis sessions carry a real ad-hoc dollar.
  const adHocStartedAt = activity.sessions
    .filter(
      (session) =>
        session.attribution === null && session.dollars?.basis === 'estimated'
    )
    .map((session) => session.startedAt);

  const start =
    earliestOf([
      activity.scan.activitySince,
      costs.coverage.costSince,
      costs.entries.at(0)?.sortAt,
      ...adHocStartedAt,
    ]) ?? activity.scan.scannedAt;
  const end =
    latestOf([
      activity.scan.scannedAt,
      costs.entries.at(-1)?.sortAt,
      ...adHocStartedAt,
    ]) ?? activity.scan.scannedAt;

  return {end, start};
};

/**
 * The chart's accessible name/description (accessibility rule): a single
 * sentence naming both series, the period range, and each series' total, so
 * a screen-reader user gets the same summary a sighted user reads off the
 * chart's legend and axis labels.
 */
const buildChartLabel = (
  buckets: PeriodSpendBucket[],
  granularity: SpendGranularity,
  locale: string | undefined
): string => {
  const first = buckets.at(0);
  const last = buckets.at(-1);

  if (!first || !last) {
    return 'Recorded spec & plan spend and estimated ad-hoc spend by period';
  }

  const recordedTotal = buckets.reduce(
    (sum, bucket) => sum + bucket.recordedDollars,
    0
  );
  const adHocTotal = buckets.reduce(
    (sum, bucket) => sum + bucket.adHocDollars,
    0
  );
  const periodWord = granularity === 'week' ? 'week' : 'month';
  const range = `from ${formatPeriodLabel(first.periodStart, granularity, locale)} to ${formatPeriodLabel(last.periodStart, granularity, locale)}`;

  return `Recorded spec & plan spend and estimated ad-hoc spend by ${periodWord} ${range}: spec & plan totaling ${formatDollars(recordedTotal, locale)}, ad hoc totaling ${formatDollars(adHocTotal, locale)}`;
};

const Chrome: FC<{children: ReactNode; periodWord: string}> = ({
  children,
  periodWord,
}) => (
  <div className={sectionChromeClassName}>
    <header>
      <p className={eyebrowClassName}>Cost trend</p>
      <h2 className={headingClassName}>Spend over time</h2>
      <p className={captionClassName}>
        Recorded spec &amp; plan spend (solid) beside estimated ad-hoc spend
        (translucent), per {periodWord}. Ad hoc spans the whole project;
        recorded cost tracking is recent, so it only shows up in the latest{' '}
        {periodWord}s.
      </p>
    </header>
    {children}
  </div>
);

/**
 * Cost-trend section (SPEC 6.7 redesign, ad-hoc overlay): period-over-period
 * grouped bars replace the old cumulative running total, and now carry two
 * series so the user can compare GAIA spec/plan work against raw ad-hoc
 * prompting. The window spans the whole project's activity (not clamped to
 * where cost tracking exists), so the ad-hoc series shows the full history
 * while the recorded series naturally sits at 0 before cost tracking began.
 * `costs.entries` arrives chronological; `activity.sessions` arrives
 * reverse-chronological (API contract), so `resolveWindow` never assumes
 * session order, only `buildPeriodSpend`'s per-session bucketing, which is
 * order-independent. The empty state only fires when BOTH series total 0:
 * either series alone
 * carrying a nonzero total is still a real comparison worth showing.
 */
const CostTrend: FC<CostTrendProps> = ({activity, costs, locale}) => {
  const window = resolveWindow(costs, activity);
  const {buckets, granularity} = buildPeriodSpend(
    costs.entries,
    activity.sessions,
    window
  );
  const recordedTotal = buckets.reduce(
    (sum, bucket) => sum + bucket.recordedDollars,
    0
  );
  const adHocTotal = buckets.reduce(
    (sum, bucket) => sum + bucket.adHocDollars,
    0
  );
  const periodWord = granularity === 'week' ? 'week' : 'month';
  const data: PeriodBarDatum[] = buckets.map((bucket) => ({
    adHocValue: bucket.adHocDollars,
    periodStart: bucket.periodStart,
    recordedValue: bucket.recordedDollars,
  }));

  return (
    <Chrome periodWord={periodWord}>
      {recordedTotal <= 0 && adHocTotal <= 0 ?
        <EmptyState
          description="Recorded spend will appear here once a spec or plan carries a priced cost entry; ad-hoc spend once a session outside any spec or plan is priced."
          title="No recorded spend yet"
        />
      : <PeriodSpendBars
          data={data}
          formatPeriodLabel={(periodStart) =>
            formatPeriodLabel(periodStart, granularity, locale)
          }
          formatValue={(value) => formatDollars(value, locale)}
          label={buildChartLabel(buckets, granularity, locale)}
        />
      }
    </Chrome>
  );
};

export default CostTrend;

/** Pixel-matching loading placeholder for AsyncSection's `skeleton` prop. */
export const CostTrendSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={sectionChromeClassName}
    data-testid="cost-trend-skeleton"
  >
    <header>
      <p className={twMerge(eyebrowClassName, shimmer)}>Cost trend</p>
      <h2 className={twMerge(headingClassName, shimmer)}>Spend over time</h2>
      <p className={twMerge(captionClassName, shimmer)}>
        Recorded spend and estimated ad-hoc spend, by period.
      </p>
    </header>
    <Skeleton className="h-[180px] w-140 max-w-full" />
  </div>
);
