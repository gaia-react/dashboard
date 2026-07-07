import type {FC, ReactNode} from 'react';
import {twJoin} from 'tailwind-merge';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import {
  formatDollars,
  sumBuckets,
} from '~/components/Sections/KpiRow/format-kpi';
import {shimmer} from '~/components/Skeleton';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

type Props = {
  activity: ActivityResponse;
  costs: CostsResponse;
};

const gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7';
const tileClass =
  'bg-bg-elev border-border-soft flex flex-col gap-1 rounded-md border p-4';
const labelClass = 'text-fg-mute font-mono text-xs tracking-[0.2em] uppercase';
const valueClass = 'font-display text-2xl font-light text-fg';
const sublabelClass = 'text-fg-mute text-xs';
const noteClass = 'text-warn-soft text-xs';

type KpiTileProps = {
  children: ReactNode;
  label: string;
};

/** One metric card: label eyebrow, then a value/sublabel/note body the caller composes. */
const KpiTile: FC<KpiTileProps> = ({children, label}) => (
  <div aria-label={label} className={tileClass} role="group">
    <p className={labelClass}>{label}</p>
    {children}
  </div>
);

const bucketRows = (
  buckets: ActivityResponse['kpis']['totalBuckets']
): {label: string; value: number}[] => [
  {label: 'Fresh input', value: buckets.freshInput},
  {label: 'Cache write', value: buckets.cacheWrite},
  {label: 'Cache read', value: buckets.cacheRead},
  {label: 'Output', value: buckets.output},
];

/**
 * SPEC section 6.2: recorded and estimated spend as distinct, basis-labeled
 * tiles (never summed, SPEC section 5 rule 3), specs/plans/sessions/tokens/
 * active days each stating recorded vs. estimated vs. all-activity via their
 * sublabel. Presentational only: costs/activity arrive already resolved.
 */
const KpiRow: FC<Props> = ({activity, costs}) => {
  const {activeDays, estimatedAdHocDollars, totalBuckets} = activity.kpis;
  const totalTokens = sumBuckets(totalBuckets);

  return (
    <div className={gridClass}>
      <KpiTile label="Recorded spend">
        <p className={valueClass}>
          {formatDollars(costs.kpis.recordedDollars)}
        </p>
        <p className={sublabelClass}>Recorded, tiers 1-2</p>
        {costs.kpis.recordedDollars === 0 && (
          <p className={noteClass}>No recorded cost yet</p>
        )}
      </KpiTile>

      <KpiTile label="Estimated ad hoc spend">
        {estimatedAdHocDollars === null ?
          <>
            <p className={valueClass}>Not available</p>
            <p className={sublabelClass}>Estimated, rate table unusable</p>
          </>
        : <>
            <p className={valueClass}>
              {estimatedAdHocDollars.lowerBound && '≥'}
              {formatDollars(estimatedAdHocDollars.value)}
            </p>
            <p className={sublabelClass}>Estimated, ad hoc only</p>
            {estimatedAdHocDollars.lowerBound && (
              <p className={noteClass}>
                Lower bound: one or more models unpriced
              </p>
            )}
            {estimatedAdHocDollars.value === 0 && (
              <p className={noteClass}>No ad hoc activity to estimate</p>
            )}
          </>
        }
      </KpiTile>

      <KpiTile label="Specs merged">
        <p className={valueClass}>
          {costs.kpis.specs.merged} / {costs.kpis.specs.total}
        </p>
        <p className={sublabelClass}>Ledger</p>
      </KpiTile>

      <KpiTile label="Plans">
        <p className={valueClass}>{costs.kpis.plans.total}</p>
        <p className={sublabelClass}>Ledger</p>
      </KpiTile>

      <KpiTile label="Sessions">
        <p className={valueClass}>{activity.sessions.length}</p>
        <p className={sublabelClass}>All activity</p>
      </KpiTile>

      <KpiTile label="Total tokens">
        <details>
          <summary className={twJoin(valueClass, 'cursor-pointer')}>
            {formatCompactNumber(totalTokens)}
          </summary>
          <ul className="text-fg-dim mt-2 flex flex-col gap-0.5 text-xs">
            {bucketRows(totalBuckets).map((row) => (
              <li key={row.label}>
                {row.label}: {formatCompactNumber(row.value)}
              </li>
            ))}
          </ul>
        </details>
        <p className={sublabelClass}>All activity, tap to expand</p>
      </KpiTile>

      <KpiTile label="Active days">
        <p className={valueClass}>{activeDays}</p>
        <p className={sublabelClass}>All activity</p>
      </KpiTile>
    </div>
  );
};

export default KpiRow;

const TILE_COUNT = 7;

/**
 * Pixel-matching loading placeholder (skeleton-loaders skill): same tile
 * grid and card shell as the real row, shimmering in place of every number.
 */
export const KpiRowSkeleton: FC = () => (
  <div aria-hidden={true} className={gridClass}>
    {Array.from({length: TILE_COUNT}, (unused, index) => (
      <div key={index} className={tileClass} role="group">
        <p className={twJoin(labelClass, shimmer)}>Recorded spend</p>
        <p className={twJoin(valueClass, shimmer)}>$0.00</p>
        <p className={twJoin(sublabelClass, shimmer)}>Recorded, tiers 1-2</p>
      </div>
    ))}
  </div>
);
