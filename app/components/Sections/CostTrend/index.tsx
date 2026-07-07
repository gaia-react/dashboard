import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';
import {formatWeekLabel, parseDayKey} from '~/components/Charts/date-helpers';
import PeriodSpendBars from '~/components/Charts/PeriodSpendBars';
import type {PeriodBarDatum} from '~/components/Charts/PeriodSpendBars';
import EmptyState from '~/components/EmptyState';
import {formatDollars} from '~/components/Sections/CostTable/format';
import type {
  PeriodSpendBucket,
  SpendGranularity,
} from '~/components/Sections/CostTrend/period-spend';
import {buildPeriodSpend} from '~/components/Sections/CostTrend/period-spend';
import Skeleton, {shimmer} from '~/components/Skeleton';
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

export const headingClassName = 'font-display text-fg text-2xl font-light';

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
 * The window spans the whole project's activity (SPEC 6.7 ad-hoc overlay),
 * not just where cost tracking exists: `activity.scan.activitySince` is the
 * earliest timed session across the whole scan, the same "since" shape as
 * `coverage.costSince` on the cost side. Ends at the later of the activity
 * scan's own snapshot time and the last cost entry (both should track
 * "now" closely; the comparison is a cheap safety net, not a real gap).
 */
const resolveWindow = (
  costs: CostsResponse,
  activity: ActivityResponse
): {end: string; start: string} => {
  const start =
    activity.scan.activitySince ??
    costs.entries.at(0)?.sortAt ??
    activity.scan.scannedAt;
  const lastEntryIso = costs.entries.at(-1)?.sortAt;
  const end =
    lastEntryIso !== undefined && lastEntryIso > activity.scan.scannedAt ?
      lastEntryIso
    : activity.scan.scannedAt;

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
 * Both `costs.entries` and `activity.sessions` already arrive chronological.
 * The empty state only fires when BOTH series total 0: either series alone
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
