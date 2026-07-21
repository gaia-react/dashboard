import type {FC, ReactNode} from 'react';
import {twJoin} from 'tailwind-merge';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {DashboardTabId} from '~/components/Sections/dashboard-tabs';
import {formatDollars} from '~/components/Sections/KpiRow/format-kpi';
import {countSessionsByAttribution} from '~/components/Sections/SessionsList/format';
import {shimmer} from '~/components/Skeleton';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

type Props = {
  activity: ActivityResponse;
  costs: CostsResponse;
  /** Which tab is active; the tile set is contextual to it. */
  tab: DashboardTabId;
};

const gridClass = 'grid grid-cols-2 gap-4 lg:grid-cols-4';
const tileClass =
  'bg-bg-elev border-border-soft flex flex-col gap-1 rounded-md border p-4';
const labelClass = 'text-fg-mute font-mono text-xs tracking-[0.2em] uppercase';
const valueClass = 'text-title font-medium text-fg';
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

const RecordedSpendTile: FC<{costs: CostsResponse}> = ({costs}) => {
  // Null means nothing anywhere has a recorded dollar figure yet (a fresh
  // project); render it the same as zero rather than a distinct "no data"
  // state, since the tile already has one for exactly that meaning.
  const recordedDollars = costs.kpis.recordedDollars ?? 0;

  return (
    <KpiTile label="Recorded spend">
      <p className={valueClass}>{formatDollars(recordedDollars)}</p>
      <p className={sublabelClass}>Recorded, spec &amp; plan work</p>
      {recordedDollars === 0 && (
        <p className={noteClass}>No recorded cost yet</p>
      )}
    </KpiTile>
  );
};

const EstimatedAdHocTile: FC<{activity: ActivityResponse}> = ({activity}) => {
  const {estimatedAdHocDollars} = activity.kpis;

  if (estimatedAdHocDollars === null) {
    return (
      <KpiTile label="Estimated ad hoc spend">
        <p className={valueClass}>Not available</p>
        <p className={sublabelClass}>Estimated, rate table unusable</p>
      </KpiTile>
    );
  }

  // A "lower bound" marker only makes sense on a non-zero estimate: pairing it
  // with $0 is contradictory (KNOWN-ISSUES W10), so a zero value reads as
  // "no ad hoc activity" instead of "at least $0".
  const showLowerBound =
    estimatedAdHocDollars.lowerBound && estimatedAdHocDollars.value > 0;

  return (
    <KpiTile label="Estimated ad hoc spend">
      <p className={valueClass}>
        {showLowerBound && '≥'}
        {formatDollars(estimatedAdHocDollars.value)}
      </p>
      <p className={sublabelClass}>Estimated, ad hoc only</p>
      {showLowerBound && (
        <p className={noteClass}>Lower bound: one or more models unpriced</p>
      )}
      {estimatedAdHocDollars.value === 0 && (
        <p className={noteClass}>No ad hoc activity to estimate</p>
      )}
    </KpiTile>
  );
};

const MergedRatioTile: FC<{
  label: string;
  merged: number;
  total: number;
}> = ({label, merged, total}) => (
  <KpiTile label={label}>
    <p className={valueClass}>
      {merged} / {total}
    </p>
    <p className={sublabelClass}>Merged</p>
  </KpiTile>
);

const CountTile: FC<{label: string; sublabel: string; value: number}> = ({
  label,
  sublabel,
  value,
}) => (
  <KpiTile label={label}>
    <p className={valueClass}>{value}</p>
    <p className={sublabelClass}>{sublabel}</p>
  </KpiTile>
);

const TotalTokensTile: FC<{activity: ActivityResponse}> = ({activity}) => (
  <KpiTile label="Total tokens">
    <p className={valueClass}>
      {formatCompactNumber(activity.kpis.totalTokens)}
    </p>
    <p className={sublabelClass}>All activity</p>
  </KpiTile>
);

/**
 * SPEC section 6.2, contextual per tab (feedback): the top-block tiles sit
 * above the tab strip and change with the active tab. Work leads with spend
 * and the specs/plans merge ratios; Sessions drops those for session counts
 * and the GAIA-vs-ad-hoc split; Activity pairs volume with spend. Spend is
 * never summed across recorded and estimated (SPEC section 5 rule 3).
 */
const KpiRow: FC<Props> = ({activity, costs, tab}) => {
  if (tab === 'sessions') {
    const {adHoc, attributed} = countSessionsByAttribution(activity.sessions);

    return (
      <div className={gridClass}>
        <CountTile
          label="Sessions"
          sublabel="All activity"
          value={activity.sessions.length}
        />
        <CountTile
          label="GAIA"
          sublabel="Attributed to a spec or plan"
          value={attributed}
        />
        <CountTile label="Ad hoc" sublabel="No spec or plan" value={adHoc} />
        <TotalTokensTile activity={activity} />
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className={gridClass}>
        <CountTile
          label="Active days"
          sublabel="Days with any activity"
          value={activity.kpis.activeDays}
        />
        <TotalTokensTile activity={activity} />
        <RecordedSpendTile costs={costs} />
        <EstimatedAdHocTile activity={activity} />
      </div>
    );
  }

  return (
    <div className={gridClass}>
      <RecordedSpendTile costs={costs} />
      <EstimatedAdHocTile activity={activity} />
      <MergedRatioTile
        label="Specs"
        merged={costs.kpis.specs.merged}
        total={costs.kpis.specs.total}
      />
      <MergedRatioTile
        label="Plans"
        merged={costs.kpis.plans.merged}
        total={costs.kpis.plans.total}
      />
    </div>
  );
};

export default KpiRow;

const TILE_COUNT = 4;

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
        <p className={twJoin(sublabelClass, shimmer)}>
          Recorded, spec &amp; plan
        </p>
      </div>
    ))}
  </div>
);
