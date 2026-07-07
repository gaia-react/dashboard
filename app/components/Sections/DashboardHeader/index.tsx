import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import gaiaLogo from '~/assets/gaia-logo.svg';
import {
  formatFreshnessLine,
  formatProjectStart,
} from '~/components/Sections/DashboardHeader/format-header';
import {shimmer} from '~/components/Skeleton';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {useQueryParams} from '~/hooks/useQueryParams';
import {useRelativeTime} from '~/hooks/useRelativeTime';

type Props = {
  activity: ActivityResponse;
  costs: CostsResponse;
  refresh: () => void;
};

const eyebrowClass =
  'text-fg-mute font-mono text-xs tracking-[0.2em] uppercase';
const titleButtonClass =
  'flex items-center gap-4 rounded-sm focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2';
/** Prominent, legible per-project label (feedback): the display font used
 * elsewhere for section headings, sized down for the header's compact row. */
const projectNameClass = 'font-display text-fg text-right text-xl font-light';
/**
 * The project path is shown in full, never truncated: a truncated path or
 * scan line hides the very thing it is meant to identify. Longer values wrap
 * (capped so the block cannot span the whole header) rather than getting cut
 * off; `break-all` lets a long slash-separated path fold cleanly.
 */
const projectIdentityClass =
  'text-fg-dim max-w-sm text-right text-sm break-all';
const freshnessClass =
  'text-fg-mute max-w-sm text-right font-mono text-xs tracking-wider';
const refreshButtonClass =
  'border-border text-fg-dim hover:border-accent-2 hover:text-fg focus-visible:outline-accent flex flex-col items-center gap-0.5 rounded-sm border px-4 py-2 font-mono text-xs tracking-[0.15em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * SPEC section 6.1: wordmark, project identity, data-freshness line, refresh,
 * and the coverage disclosure when cost and activity history diverge.
 * Presentational only: the integrator supplies costs/activity already
 * resolved via AsyncSection and the shared useDashboardData().refresh.
 */
const DashboardHeader: FC<Props> = ({activity, costs, refresh}) => {
  const resetQueryParams = useQueryParams()[2];
  const {costSince} = costs.coverage;
  const {activitySince, scannedAt, sessionCount} = activity.scan;
  const projectStart = formatProjectStart(costSince, activitySince);
  const lastUpdated = useRelativeTime(new Date(scannedAt).getTime());

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-6">
        {/* Clicking the title returns to the Work tab and drops every other
            filter (feedback): a real button, not a hash link, so it never
            leaves a stray history entry or fights the query-param router. */}
        <button
          className={titleButtonClass}
          onClick={() => resetQueryParams({tab: 'work'})}
          type="button"
        >
          <img alt="GAIA" className="h-8 w-auto" src={gaiaLogo} />
          <span className={eyebrowClass}>Dashboard</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <h1 className={projectNameClass}>{costs.project.name}</h1>
            <p className={projectIdentityClass}>{costs.project.root}</p>
            <p className={freshnessClass}>
              {formatFreshnessLine({
                sessionCount,
                specsTotal: costs.kpis.specs.total,
              })}
            </p>
          </div>
          {/* Accessible name stays stable ("Refresh data") rather than the
              ticking "Last update" caption: a screen reader announcing a
              changed name every 60s on an interactive control is confusing
              (feedback: judgment call, noted for review). */}
          <button
            aria-label="Refresh data"
            className={refreshButtonClass}
            onClick={refresh}
            type="button"
          >
            <span>Last update</span>
            <span>{lastUpdated}</span>
          </button>
        </div>
      </div>
      {projectStart !== null && (
        <p className="text-fg-mute text-xs">Project started {projectStart}</p>
      )}
    </header>
  );
};

export default DashboardHeader;

/**
 * Pixel-matching loading placeholder (skeleton-loaders skill): same element
 * types and typography classes as the real header, including the fixed
 * identity width, so AsyncSection's swap causes zero layout shift.
 */
export const DashboardHeaderSkeleton: FC = () => (
  <header aria-hidden={true} className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <img alt="" className="h-8 w-auto" src={gaiaLogo} />
        <span className={twJoin(eyebrowClass, shimmer)}>Dashboard</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end gap-1">
          <h1 className={twJoin(projectNameClass, shimmer)}>project</h1>
          <p
            className={twJoin(projectIdentityClass, shimmer)}
            data-testid="header-identity-skeleton"
          >
            /Users/you/projects/project
          </p>
          <p className={twJoin(freshnessClass, shimmer)}>
            Scanned 0 sessions · 0 specs
          </p>
        </div>
        <button
          className={twJoin(refreshButtonClass, shimmer)}
          tabIndex={-1}
          type="button"
        >
          <span>Last update</span>
          <span>Just now</span>
        </button>
      </div>
    </div>
  </header>
);
