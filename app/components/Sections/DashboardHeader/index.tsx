import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import gaiaLogo from '~/assets/gaia-logo.svg';
import {
  coverageDiverges,
  formatCoverageDisclosure,
  formatFreshnessLine,
} from '~/components/Sections/DashboardHeader/format-header';
import {shimmer} from '~/components/Skeleton';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

type Props = {
  activity: ActivityResponse;
  costs: CostsResponse;
  refresh: () => void;
};

const eyebrowClass =
  'text-fg-mute font-mono text-xs tracking-[0.2em] uppercase';
/**
 * Fixed width on both the skeleton and the real identity block: real project
 * name/path length is unknowable ahead of data, so the box is sized by this
 * class, not by content, and the data swap cannot reflow it (skeleton-loaders
 * skill). Longer values truncate rather than grow the header.
 */
const identityWidthClass = 'w-64';
const projectIdentityClass = twJoin(
  identityWidthClass,
  'text-fg-dim truncate text-right text-sm'
);
const freshnessClass = twJoin(
  identityWidthClass,
  'text-fg-mute truncate text-right font-mono text-xs tracking-wider'
);
const refreshButtonClass =
  'border-border text-fg-dim hover:border-accent-2 hover:text-fg focus-visible:outline-accent rounded-sm border px-3 py-1.5 font-mono text-xs tracking-[0.15em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * SPEC section 6.1: wordmark, project identity, data-freshness line, refresh,
 * and the coverage disclosure when cost and activity history diverge.
 * Presentational only: the integrator supplies costs/activity already
 * resolved via AsyncSection and the shared useDashboardData().refresh.
 */
const DashboardHeader: FC<Props> = ({activity, costs, refresh}) => {
  const {costSince} = costs.coverage;
  const {activitySince, scannedAt, sessionCount} = activity.scan;
  const showCoverageDisclosure = coverageDiverges(costSince, activitySince);

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img alt="GAIA" className="h-8 w-auto" src={gaiaLogo} />
          <span className={eyebrowClass}>Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <p className={projectIdentityClass}>
              {costs.project.name} · {costs.project.root}
            </p>
            <p className={freshnessClass}>
              {formatFreshnessLine({
                scannedAt,
                sessionCount,
                specsTotal: costs.kpis.specs.total,
              })}
            </p>
          </div>
          <button
            className={refreshButtonClass}
            onClick={refresh}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>
      {showCoverageDisclosure &&
        costSince !== null &&
        activitySince !== null && (
          <p className="text-fg-mute text-xs">
            {formatCoverageDisclosure(costSince, activitySince)}
          </p>
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
          <p
            className={twJoin(projectIdentityClass, shimmer)}
            data-testid="header-identity-skeleton"
          >
            project · /Users/you/projects/project
          </p>
          <p className={twJoin(freshnessClass, shimmer)}>
            Scanned 0 sessions · 0 specs · just now
          </p>
        </div>
        <button
          className={twJoin(refreshButtonClass, shimmer)}
          tabIndex={-1}
          type="button"
        >
          Refresh
        </button>
      </div>
    </div>
  </header>
);
