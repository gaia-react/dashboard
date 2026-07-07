import type {FC, ReactNode} from 'react';
import AsyncSection from '~/components/AsyncSection';
import ActivityHeatmap, {
  ActivityHeatmapSkeleton,
} from '~/components/Sections/ActivityHeatmap';
import CostTable, {CostTableSkeleton} from '~/components/Sections/CostTable';
import CostTrend, {CostTrendSkeleton} from '~/components/Sections/CostTrend';
import type {DashboardTabId} from '~/components/Sections/dashboard-tabs';
import {
  DASHBOARD_TABS,
  resolveTabId,
} from '~/components/Sections/dashboard-tabs';
import DashboardHeader, {
  DashboardHeaderSkeleton,
} from '~/components/Sections/DashboardHeader';
import KpiRow, {KpiRowSkeleton} from '~/components/Sections/KpiRow';
import ModelMix, {ModelMixSkeleton} from '~/components/Sections/ModelMix';
import ParseHealth, {
  ParseHealthSkeleton,
} from '~/components/Sections/ParseHealth';
import SessionsList, {
  SessionsListSkeleton,
} from '~/components/Sections/SessionsList';
import Tabs, {tabButtonId, tabPanelId} from '~/components/Tabs';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {combineResourceStates} from '~/hooks/combineResourceStates';
import {useDashboardData} from '~/hooks/useDashboardData';
import {useQueryParams} from '~/hooks/useQueryParams';

const TabPanel: FC<{children: ReactNode; tab: DashboardTabId}> = ({
  children,
  tab,
}) => (
  <div
    aria-labelledby={tabButtonId(tab)}
    className="flex flex-col gap-12"
    id={tabPanelId(tab)}
    role="tabpanel"
    tabIndex={0}
  >
    {children}
  </div>
);

/**
 * Page shell. The header and the contextual KPI row (SPEC section 6.1/6.2)
 * read both `/api/costs` and `/api/activity`, so they gate on `headerState`;
 * the tab content below paints per resource (CostTable and CostTrend the
 * moment `/api/costs` lands, the session-scan sections once `/api/activity`
 * does, PLAN D2). The active tab lives in `?tab=` (Work | Sessions | Activity),
 * with the top blocks pinned above the tab strip.
 */
const App = () => {
  const {activity, costs, refresh} = useDashboardData<
    CostsResponse,
    ActivityResponse
  >();
  const [params, setQueryParams] = useQueryParams();
  const tab = resolveTabId(params.get('tab'));

  const headerState = combineResourceStates(costs.state, activity.state);
  const resolvedSessions =
    activity.state.status === 'success' ?
      activity.state.data.sessions
    : undefined;

  const selectTab = (id: string): void => {
    setQueryParams({tab: id});
  };

  return (
    <div className="min-h-dvh px-4 pb-16 md:px-8">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 pt-10">
        {headerState.status === 'success' ?
          <DashboardHeader
            activity={headerState.data.activity}
            costs={headerState.data.costs}
            refresh={refresh}
          />
        : <DashboardHeaderSkeleton />}

        <AsyncSection
          label="Key metrics"
          onRetry={refresh}
          skeleton={<KpiRowSkeleton />}
          state={headerState}
        >
          {(data) => (
            <KpiRow activity={data.activity} costs={data.costs} tab={tab} />
          )}
        </AsyncSection>

        <Tabs
          activeId={tab}
          items={DASHBOARD_TABS}
          label="Dashboard sections"
          onSelect={selectTab}
        />

        {tab === 'work' && (
          <TabPanel tab="work">
            <AsyncSection
              label="Specs and plans"
              onRetry={refresh}
              skeleton={<CostTableSkeleton />}
              state={costs.state}
            >
              {(costsData) => (
                <CostTable
                  entries={costsData.entries}
                  sessions={resolvedSessions}
                />
              )}
            </AsyncSection>
          </TabPanel>
        )}

        {tab === 'sessions' && (
          <TabPanel tab="sessions">
            <AsyncSection
              label="Sessions"
              onRetry={refresh}
              skeleton={<SessionsListSkeleton />}
              state={activity.state}
            >
              {(activityData) => (
                <SessionsList sessions={activityData.sessions} />
              )}
            </AsyncSection>
          </TabPanel>
        )}

        {tab === 'activity' && (
          <TabPanel tab="activity">
            <AsyncSection
              label="Activity"
              onRetry={refresh}
              skeleton={<ActivityHeatmapSkeleton />}
              state={activity.state}
            >
              {(activityData) => (
                <ActivityHeatmap heatmap={activityData.heatmap} />
              )}
            </AsyncSection>

            <AsyncSection
              label="Model mix"
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
              label="Cost trend"
              onRetry={refresh}
              skeleton={<CostTrendSkeleton />}
              state={costs.state}
            >
              {(costsData) => <CostTrend costs={costsData} />}
            </AsyncSection>

            <AsyncSection
              label="Parse health"
              onRetry={refresh}
              skeleton={<ParseHealthSkeleton />}
              state={headerState}
            >
              {(data) => (
                <ParseHealth
                  activityParseHealth={data.activity.parseHealth}
                  costsParseHealth={data.costs.parseHealth}
                />
              )}
            </AsyncSection>
          </TabPanel>
        )}
      </main>
    </div>
  );
};

export default App;
