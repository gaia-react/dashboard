import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';
import type {TrendBarDatum} from '~/components/Charts/TrendBars';
import TrendBars from '~/components/Charts/TrendBars';
import EmptyState from '~/components/EmptyState';
import Skeleton, {shimmer} from '~/components/Skeleton';
import type {CostEntry, CostsResponse} from '~/data/schemas/api';

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

const sumTokens = (buckets: CostEntry['totals']['buckets']): number =>
  buckets.freshInput + buckets.cacheWrite + buckets.cacheRead + buckets.output;

/**
 * One trend bar per entry with cost data (SPEC 6.3/6.7): recorded dollars
 * where priced, otherwise total tokens. `recordedDollars !== null` is the
 * only thing that decides the encoding, never a zero-fallback, so an
 * unpriced entry can never land on the dollar scale (the section's central
 * correctness rule). Entries with neither a recorded dollar figure nor any
 * token volume carry no cost data and are skipped.
 */
const toDatum = (entry: CostEntry): TrendBarDatum | undefined => {
  const {buckets, recordedDollars} = entry.totals;

  if (recordedDollars !== null) {
    return {
      id: entry.key,
      kind: 'dollars',
      label: entry.title,
      value: recordedDollars,
    };
  }

  const tokens = sumTokens(buckets);

  return tokens > 0 ?
      {id: entry.key, kind: 'tokens', label: entry.title, value: tokens}
    : undefined;
};

const Chrome: FC<{children: ReactNode}> = ({children}) => (
  <div className={sectionChromeClassName}>
    <header>
      <p className={eyebrowClassName}>Cost trend</p>
      <h2 className={headingClassName}>Cost per spec &amp; plan</h2>
      <p className={captionClassName}>
        One bar per spec or plan, oldest to newest. Recorded dollars where the
        ledger priced the work; token volume where it did not, never mixed on
        one axis.
      </p>
    </header>
    {children}
  </div>
);

/**
 * SPEC 6.7: cost-per-spec trend, now with its own section chrome so it reads
 * consistently with the other Activity sections (design pass). `costs.entries`
 * already arrives chronological (the /api/costs contract), so mapping
 * preserves order. Wraps the shared TrendBars kit, which keeps the dollars and
 * tokens encodings on two independently-scaled axes.
 */
const CostTrend: FC<CostTrendProps> = ({costs, locale}) => {
  const data = costs.entries
    .map(toDatum)
    .filter((datum): datum is TrendBarDatum => datum !== undefined);

  return (
    <Chrome>
      {data.length === 0 ?
        <EmptyState
          description="Specs and plans will appear here once they carry recorded cost or token usage."
          title="No cost trend yet"
        />
      : <TrendBars data={data} label="Cost per spec trend" locale={locale} />}
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
      <h2 className={twMerge(headingClassName, shimmer)}>
        Cost per spec &amp; plan
      </h2>
      <p className={twMerge(captionClassName, shimmer)}>
        One bar per spec or plan, oldest to newest.
      </p>
    </header>
    <Skeleton className="h-[180px] w-140 max-w-full" />
  </div>
);
