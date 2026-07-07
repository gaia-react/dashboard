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
import type {CostsResponse} from '~/data/schemas/api';

export type CostTrendProps = {
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
 * The chart's accessible name/description (accessibility rule): a single
 * sentence stating the period range and total, so a screen-reader user gets
 * the same summary a sighted user reads off the chart's axis and bar labels.
 */
const buildChartLabel = (
  buckets: PeriodSpendBucket[],
  granularity: SpendGranularity,
  locale: string | undefined
): string => {
  const first = buckets.at(0);
  const last = buckets.at(-1);

  if (!first || !last) {
    return 'Recorded spend by period';
  }

  const total = buckets.reduce((sum, bucket) => sum + bucket.dollars, 0);
  const periodWord = granularity === 'week' ? 'week' : 'month';

  return `Recorded spend by ${periodWord} from ${formatPeriodLabel(first.periodStart, granularity, locale)} to ${formatPeriodLabel(last.periodStart, granularity, locale)}, totaling ${formatDollars(total, locale)}`;
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
        Recorded dollars per {periodWord}, oldest to newest. Only recorded spend
        counts here, never estimated or token-derived money.
      </p>
    </header>
    {children}
  </div>
);

/**
 * Cost-trend section (SPEC 6.7 redesign): period-over-period bars replace the
 * old cumulative running total, which hid whether spend was rising or
 * falling week to week. `costs.entries` already arrives chronological (the
 * /api/costs contract); the reducer buckets by week or month depending on
 * the trend window's own span, starting at `coverage.costSince` (SPEC 6.1)
 * rather than the ledger's full history so a project whose specs/plans
 * predate cost tracking doesn't pad the chart with a wall of dead $0 bars. A
 * total of exactly 0, whether from no entries or entries that are all
 * unpriced, renders the empty state instead of a chart made entirely of $0
 * bars.
 */
const CostTrend: FC<CostTrendProps> = ({costs, locale}) => {
  const {buckets, granularity} = buildPeriodSpend(
    costs.entries,
    costs.coverage.costSince
  );
  const total = buckets.reduce((sum, bucket) => sum + bucket.dollars, 0);
  const periodWord = granularity === 'week' ? 'week' : 'month';
  const data: PeriodBarDatum[] = buckets.map((bucket) => ({
    periodStart: bucket.periodStart,
    value: bucket.dollars,
  }));

  return (
    <Chrome periodWord={periodWord}>
      {total <= 0 ?
        <EmptyState
          description="Recorded spend will appear here once a spec or plan carries a priced cost entry."
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
        Recorded dollars by period, oldest to newest.
      </p>
    </header>
    <Skeleton className="h-[180px] w-140 max-w-full" />
  </div>
);
