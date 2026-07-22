import type {FC, ReactNode} from 'react';
import {twJoin} from 'tailwind-merge';
import AsyncSection from '~/components/AsyncSection';
import ActivityHeatmap, {
  ActivityHeatmapSkeleton,
} from '~/components/Sections/ActivityHeatmap';
import CostTrend, {CostTrendSkeleton} from '~/components/Sections/CostTrend';
import type {DashboardTabId} from '~/components/Sections/dashboard-tabs';
import {resolveTabId} from '~/components/Sections/dashboard-tabs';
import DashboardHeader, {
  TopBarSkeleton,
} from '~/components/Sections/DashboardHeader';
import {formatProjectStart} from '~/components/Sections/DashboardHeader/format-header';
import Insights, {InsightsSkeleton} from '~/components/Sections/Insights';
import KpiRow, {KpiRowSkeleton} from '~/components/Sections/KpiRow';
import ModelMix, {ModelMixSkeleton} from '~/components/Sections/ModelMix';
import ParseHealth from '~/components/Sections/ParseHealth';
import SessionsList, {
  SessionsListSkeleton,
} from '~/components/Sections/SessionsList';
import Work from '~/components/Sections/Work';
import {tabButtonId, tabPanelId} from '~/components/Tabs';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {combineResourceStates} from '~/hooks/combineResourceStates';
import {useDashboardData} from '~/hooks/useDashboardData';
import {useQueryParams} from '~/hooks/useQueryParams';
import {shellInset} from '~/styles/class-names';

/**
 * DESIGN-SPEC 1.2: the two-pane Work console scrolls internally at `lg:` and
 * up (each pane owns its own scrollbar), so the region itself must not also
 * scroll. Sessions and Insights are long documents; the region is the
 * scroller at every width. `min-h-0` is load-bearing on both: without it a
 * flex child refuses to shrink below its content and the internal scroll
 * never engages.
 */
const workRegionClass = 'min-h-0 flex-1 overflow-y-auto lg:overflow-hidden';
const documentRegionClass = 'min-h-0 flex-1 overflow-y-auto';

/** DESIGN-SPEC 1.4: the Work panel needs a determinate height at `lg:` and up
 * so its two-pane grid's own `h-full` (and each pane's `overflow-y-auto`)
 * resolves; below `lg:` height is natural and the region above scrolls. */
const workPanelClass = twJoin(shellInset, 'py-4 lg:h-full lg:py-6');
const documentPanelClass = twJoin(
  shellInset,
  'flex flex-col gap-8 py-6 xl:gap-10'
);

const TabPanel: FC<{
  children: ReactNode;
  className: string;
  tab: DashboardTabId;
}> = ({children, className, tab}) => (
  <div
    aria-labelledby={tabButtonId(tab)}
    className={className}
    id={tabPanelId(tab)}
    role="tabpanel"
    tabIndex={0}
  >
    {children}
  </div>
);

/**
 * Page shell (DESIGN-SPEC 1.2, 1.3, 1.4). The top bar sits outside the
 * scroll region and reads both resources (project name and freshness need
 * both); the active tab's panel below paints per resource so the Work tab
 * never blocks on `/api/activity` (PLAN D2).
 *
 * There is no KPI row on the Work tab (DESIGN-SPEC 1.4): the selected
 * event's own Cost / Elapsed / Total tokens live in its detail panel's
 * metric strip. `KpiRow` renders on Sessions and Insights only; its prop
 * type excludes 'work' so the dead branch cannot come back by accident.
 */
const App = () => {
  const {activity, costs, isRefreshing, refresh} = useDashboardData<
    CostsResponse,
    ActivityResponse
  >();
  const [params, , resetQueryParams] = useQueryParams();
  const tab = resolveTabId(params.get('tab'));

  const headerState = combineResourceStates(costs.state, activity.state);

  // Switching tabs clears every other param (feedback): a filter or
  // deep-link left over from the previous tab must not leak into the next.
  const selectTab = (id: string): void => {
    resetQueryParams({tab: id});
  };

  // A cross-tab jump to one session lands on the Sessions tab with no filter
  // or page so the target can never be filtered out of view (feedback).
  const viewSession = (sessionId: string): void => {
    resetQueryParams({id: sessionId, tab: 'sessions'});
  };

  // A cross-tab jump to one cost entry (the Sessions attribution badge)
  // lands on the Work tab with its event selected, symmetric to viewSession.
  const viewEntry = (key: string): void => {
    resetQueryParams({entry: key, tab: 'work'});
  };

  const projectStart =
    headerState.status === 'success' ?
      formatProjectStart(
        headerState.data.costs.coverage.costSince,
        headerState.data.activity.scan.activitySince
      )
    : null;

  return (
    <div className="bg-bg text-fg flex h-dvh flex-col overflow-hidden">
      {headerState.status === 'success' ?
        <DashboardHeader
          activeTab={tab}
          activity={headerState.data.activity}
          costs={headerState.data.costs}
          isRefreshing={isRefreshing}
          onSelectTab={selectTab}
          refresh={refresh}
        />
      : <TopBarSkeleton activeTab={tab} onSelectTab={selectTab} />}

      <div className={tab === 'work' ? workRegionClass : documentRegionClass}>
        {tab === 'work' && (
          <TabPanel className={workPanelClass} tab="work">
            <Work
              activityState={activity.state}
              costsState={costs.state}
              onViewSession={viewSession}
              refresh={refresh}
            />
          </TabPanel>
        )}

        {tab === 'sessions' && (
          <TabPanel className={documentPanelClass} tab="sessions">
            <AsyncSection
              isRetrying={isRefreshing}
              label="Key metrics"
              onRetry={refresh}
              skeleton={<KpiRowSkeleton />}
              state={headerState}
            >
              {(data) => (
                <KpiRow activity={data.activity} costs={data.costs} tab={tab} />
              )}
            </AsyncSection>

            <AsyncSection
              isRetrying={isRefreshing}
              label="Sessions"
              onRetry={refresh}
              skeleton={<SessionsListSkeleton />}
              state={activity.state}
            >
              {(activityData) => (
                <SessionsList
                  onViewEntry={viewEntry}
                  sessions={activityData.sessions}
                />
              )}
            </AsyncSection>
          </TabPanel>
        )}

        {tab === 'activity' && (
          <TabPanel className={documentPanelClass} tab="activity">
            {projectStart !== null && (
              <p className="text-label text-fg-mute">
                Project started {projectStart}
              </p>
            )}

            <AsyncSection
              isRetrying={isRefreshing}
              label="Key metrics"
              onRetry={refresh}
              skeleton={<KpiRowSkeleton />}
              state={headerState}
            >
              {(data) => (
                <KpiRow activity={data.activity} costs={data.costs} tab={tab} />
              )}
            </AsyncSection>

            <AsyncSection
              isRetrying={isRefreshing}
              label="Highlights"
              onRetry={refresh}
              skeleton={<InsightsSkeleton />}
              state={headerState}
            >
              {(data) => (
                <Insights activity={data.activity} costs={data.costs} />
              )}
            </AsyncSection>

            <AsyncSection
              isRetrying={isRefreshing}
              label="Model usage"
              onRetry={refresh}
              skeleton={<ModelMixSkeleton />}
              state={activity.state}
            >
              {(activityData) => (
                <ModelMix
                  modelTotals={activityData.modelTotals}
                  modelWeekly={activityData.modelWeekly}
                />
              )}
            </AsyncSection>

            <AsyncSection
              isRetrying={isRefreshing}
              label="Cost trend"
              onRetry={refresh}
              skeleton={<CostTrendSkeleton />}
              state={headerState}
            >
              {(data) => (
                <CostTrend activity={data.activity} costs={data.costs} />
              )}
            </AsyncSection>

            <AsyncSection
              isRetrying={isRefreshing}
              label="Activity"
              onRetry={refresh}
              skeleton={<ActivityHeatmapSkeleton />}
              state={activity.state}
            >
              {(activityData) => (
                <ActivityHeatmap heatmap={activityData.heatmap} />
              )}
            </AsyncSection>

            {/* Parse health is a footer that only appears when a data
                problem exists (feedback): silent when clean, so it renders
                directly rather than through AsyncSection's skeleton/region. */}
            {headerState.status === 'success' && (
              <ParseHealth
                activityParseHealth={headerState.data.activity.parseHealth}
                costsParseHealth={headerState.data.costs.parseHealth}
              />
            )}
          </TabPanel>
        )}
      </div>
    </div>
  );
};

export default App;
