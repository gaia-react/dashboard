import type {FC} from 'react';
import type {TrendBarDatum} from '~/components/Charts/TrendBars';
import TrendBars from '~/components/Charts/TrendBars';
import EmptyState from '~/components/EmptyState';
import Skeleton from '~/components/Skeleton';
import type {CostEntry, CostsResponse} from '~/data/schemas/api';

export type CostTrendProps = {
  /** The already-fetched /api/costs response (AsyncSection's render-prop). */
  costs: CostsResponse;
  locale?: string;
};

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

/**
 * SPEC 6.7: cost-per-spec trend. `costs.entries` already arrives
 * chronological (the /api/costs contract), so mapping preserves order.
 * Wraps the shared TrendBars kit, which keeps the dollars and tokens
 * encodings on two independently-scaled axes.
 */
const CostTrend: FC<CostTrendProps> = ({costs, locale}) => {
  const data = costs.entries
    .map(toDatum)
    .filter((datum): datum is TrendBarDatum => datum !== undefined);

  if (data.length === 0) {
    return (
      <EmptyState
        description="Specs and plans will appear here once they carry recorded cost or token usage."
        title="No cost trend yet"
      />
    );
  }

  return <TrendBars data={data} label="Cost per spec trend" locale={locale} />;
};

export default CostTrend;

/** Pixel-matching loading placeholder for AsyncSection's `skeleton` prop. */
export const CostTrendSkeleton: FC = () => (
  <Skeleton className="h-[180px] w-140 max-w-full" />
);
