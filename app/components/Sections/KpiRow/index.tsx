import type {FC, ReactNode} from 'react';
import {twJoin} from 'tailwind-merge';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {DashboardTabId} from '~/components/Sections/dashboard-tabs';
import {countSessionsByAttribution} from '~/components/Sections/SessionsList/format';
import {shimmer} from '~/components/Skeleton';
import {formatDollars} from '~/data/format/units';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

type Props = {
  activity: ActivityResponse;
  costs: CostsResponse;
  /** Which tab is active; the tile set is contextual to it. The Work tab has
   * no KPI row (DESIGN-SPEC 1.4): 'work' is excluded structurally so the
   * dead default branch cannot come back by accident. */
  tab: Exclude<DashboardTabId, 'work'>;
};

const gridClass = 'grid grid-cols-2 gap-4 lg:grid-cols-4';
const tileClass =
  'bg-bg-elev border-border-soft flex flex-col gap-1 rounded-md border p-4';
const labelClass = 'text-label text-fg-dim';
/** C-34: every numeral tile value. */
const metricValueClass = 'text-metric font-mono text-fg tabular-nums';
/** EstimatedAdHocTile's "Not available" is prose, not a numeral: 2.25rem of
 * a two-word sentence wraps in a quarter-width tile and reads as an error
 * message, so it stays at the old heading size rather than stepping to
 * `metricValueClass` with the real figures. Do not "finish the job" here. */
const proseValueClass = 'text-title font-medium text-fg';
const sublabelClass = 'text-label text-fg-mute';
const noteClass = 'text-label text-warn-soft';

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
      <p className={metricValueClass}>{formatDollars(recordedDollars)}</p>
      <p className={sublabelClass}>Recorded, all GAIA events</p>
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
        <p className={proseValueClass}>Not available</p>
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
      <p className={metricValueClass}>
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

const CountTile: FC<{label: string; sublabel: string; value: number}> = ({
  label,
  sublabel,
  value,
}) => (
  <KpiTile label={label}>
    <p className={metricValueClass}>{value}</p>
    <p className={sublabelClass}>{sublabel}</p>
  </KpiTile>
);

const TotalTokensTile: FC<{activity: ActivityResponse}> = ({activity}) => (
  <KpiTile label="Total tokens">
    <p className={metricValueClass}>
      {formatCompactNumber(activity.kpis.totalTokens)}
    </p>
    <p className={sublabelClass}>All activity</p>
  </KpiTile>
);

/**
 * SPEC section 6.2, contextual per tab (feedback): the top-block tiles sit
 * above the tab strip and change with the active tab. Sessions leads with
 * session counts and the GAIA-vs-ad-hoc split; Insights pairs volume with
 * spend. Spend is never summed across recorded and estimated (SPEC section 5
 * rule 3). The Work tab has no KPI row (DESIGN-SPEC 1.4): its own
 * specs/plans merge ratio lived here as the default branch until P4 deleted
 * it as unreachable.
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
        <p className={twJoin(metricValueClass, shimmer)}>$0.00</p>
        <p className={twJoin(sublabelClass, shimmer)}>
          Recorded, all GAIA events
        </p>
      </div>
    ))}
  </div>
);
