import type {FC} from 'react';
import {twJoin, twMerge} from 'tailwind-merge';
import gaiaLogo from '~/assets/gaia-logo.svg';
import Icon from '~/components/Icon';
import type {DashboardTabId} from '~/components/Sections/dashboard-tabs';
import {DASHBOARD_TABS} from '~/components/Sections/dashboard-tabs';
import {formatFreshnessLine} from '~/components/Sections/DashboardHeader/format-header';
import {shimmer} from '~/components/Skeleton';
import Tabs from '~/components/Tabs';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {useQueryParams} from '~/hooks/useQueryParams';
import {useRelativeTime} from '~/hooks/useRelativeTime';
import {colorTransition, focusRing, shellInset} from '~/styles/class-names';

/**
 * `shellInset` already carries the horizontal inset steps (base, `sm:`,
 * `xl:`) plus the `2xl:` cap; the rest is DESIGN-SPEC 1.3's literal grid
 * string minus that overlap, so the inset is declared exactly once in the
 * component tree (exit criterion 2) and never hand-typed a second time.
 */
const headerGridClass = twJoin(
  shellInset,
  'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 py-3 lg:h-16 lg:grid-cols-[1fr_auto_1fr] lg:gap-x-6 lg:gap-y-0 lg:py-0'
);

const identityButtonClass = twJoin(
  'flex min-w-0 flex-col gap-0.5 text-left',
  focusRing
);

const refreshBaseClass = twJoin(
  'text-label text-fg-dim inline-flex items-center gap-2 rounded-sm px-3 py-1.5',
  colorTransition,
  focusRing
);
const refreshClass = twMerge(
  refreshBaseClass,
  'hover:bg-bg-elev-2 hover:text-fg active:bg-bg-elev-2 disabled:text-fg-mute disabled:hover:text-fg-mute disabled:hover:bg-transparent'
);

type ProjectIdentityProps = {
  activity: ActivityResponse;
  costs: CostsResponse;
};

/**
 * C-03: returns to the Work tab and clears every other query param, as v1
 * did. `<h1>` sits inside the button per DESIGN-SPEC's literal markup; the
 * wordmark's `alt` is empty because the project name already carries the
 * button's accessible name (C-05).
 */
const ProjectIdentity: FC<ProjectIdentityProps> = ({activity, costs}) => {
  const resetQueryParams = useQueryParams()[2];
  const relative = useRelativeTime(new Date(activity.scan.scannedAt).getTime());
  const freshness = formatFreshnessLine({
    relative,
    sessionCount: activity.scan.sessionCount,
    specsTotal: costs.kpis.specs.total,
  });

  return (
    <button
      className={identityButtonClass}
      onClick={() => resetQueryParams({tab: 'work'})}
      type="button"
    >
      <span className="flex items-center gap-3">
        <img alt="" className="h-6 w-auto" src={gaiaLogo} />
        <h1 className="text-title text-fg truncate">{costs.project.name}</h1>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className="text-fg-dim text-label break-all lg:truncate"
          title={costs.project.root}
        >
          {costs.project.root}
        </span>
        <span className="text-fg-mute text-label font-mono whitespace-nowrap tabular-nums">
          {freshness}
        </span>
      </span>
    </button>
  );
};

type RefreshButtonProps = {
  isRefreshing: boolean;
  onClick: () => void;
};

/**
 * C-08: the label IS the accessible name, and the button holds focus through
 * a click, so the D/L swap ("Refresh" -> "Refreshing") is announced without a
 * live region.
 */
const RefreshButton: FC<RefreshButtonProps> = ({isRefreshing, onClick}) => (
  <button
    className={refreshClass}
    disabled={isRefreshing}
    onClick={onClick}
    type="button"
  >
    <Icon
      className={isRefreshing ? 'motion-safe:animate-spin' : undefined}
      name="refresh"
      size={14}
    />
    {isRefreshing ? 'Refreshing' : 'Refresh'}
  </button>
);

export type TopBarProps = {
  activeTab: DashboardTabId;
  activity: ActivityResponse;
  costs: CostsResponse;
  isRefreshing: boolean;
  onSelectTab: (id: string) => void;
  refresh: () => void;
};

/**
 * The v2 top bar (DESIGN-SPEC 1.3, C-02 to C-08): one `<header>`, identity
 * then tabs then refresh in DOM order, one row at `lg:` and two below via
 * grid placement rather than duplicated markup.
 *
 * Only renders once both `/api/costs` and `/api/activity` have resolved
 * (project name and freshness both need them); `TopBarSkeleton` stands in
 * before that, still rendering a REAL, operable `Tabs` (C-07's states table:
 * tabs are present before data resolves, full stop).
 */
const DashboardHeader: FC<TopBarProps> = ({
  activeTab,
  activity,
  costs,
  isRefreshing,
  onSelectTab,
  refresh,
}) => (
  <header className="border-border-soft bg-bg z-20 shrink-0 border-b">
    <div className={headerGridClass}>
      <div className="col-start-1 row-start-1 min-w-0">
        <ProjectIdentity activity={activity} costs={costs} />
      </div>
      <nav className="col-span-2 col-start-1 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        <Tabs
          activeId={activeTab}
          items={DASHBOARD_TABS}
          label="Dashboard sections"
          onSelect={onSelectTab}
        />
      </nav>
      <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </div>
    </div>
  </header>
);

export default DashboardHeader;

export type TopBarSkeletonProps = {
  activeTab: DashboardTabId;
  onSelectTab: (id: string) => void;
};

/**
 * The loading top bar (C-03 state L: "the whole bar" swaps in). Identity and
 * refresh are decorative shimmer placeholders (each individually
 * `aria-hidden`, matching their real dimensions so the swap causes zero
 * layout shift); the tab strip is real and interactive, per C-07's own
 * exemption from every loading/disabled state a bar-wide skeleton would
 * otherwise impose.
 */
export const TopBarSkeleton: FC<TopBarSkeletonProps> = ({
  activeTab,
  onSelectTab,
}) => (
  <header
    className="border-border-soft bg-bg z-20 shrink-0 border-b"
    data-testid="top-bar-skeleton"
  >
    <div className={headerGridClass}>
      <div
        aria-hidden={true}
        className="col-start-1 row-start-1 min-w-0"
        data-testid="identity-skeleton-region"
      >
        <div className={identityButtonClass}>
          <span className="flex items-center gap-3">
            <img alt="" className="h-6 w-auto" src={gaiaLogo} />
            <span className={twJoin('text-title', shimmer)}>project</span>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span
              className={twJoin('text-label', shimmer)}
              data-testid="header-identity-skeleton"
            >
              /Users/you/projects/project
            </span>
            <span
              className={twJoin('text-label font-mono tabular-nums', shimmer)}
            >
              Scanned 0 sessions, 0 specs, updated Just now
            </span>
          </span>
        </div>
      </div>
      <nav className="col-span-2 col-start-1 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        <Tabs
          activeId={activeTab}
          items={DASHBOARD_TABS}
          label="Dashboard sections"
          onSelect={onSelectTab}
        />
      </nav>
      <div
        aria-hidden={true}
        className="col-start-2 row-start-1 justify-self-end lg:col-start-3"
      >
        <span className={twJoin(refreshBaseClass, shimmer)}>
          <Icon name="refresh" size={14} />
          Refresh
        </span>
      </div>
    </div>
  </header>
);
