import type {FC, ReactNode} from 'react';
import AsyncSection from '~/components/AsyncSection';
import ActivityHeatmap, {
  ActivityHeatmapSkeleton,
} from '~/components/Sections/ActivityHeatmap';
import AdHocReviews from '~/components/Sections/AdHocReviews';
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
import Insights, {InsightsSkeleton} from '~/components/Sections/Insights';
import KpiRow, {KpiRowSkeleton} from '~/components/Sections/KpiRow';
import ModelMix, {ModelMixSkeleton} from '~/components/Sections/ModelMix';
import ParseHealth from '~/components/Sections/ParseHealth';
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
 * the tab content below paints per resource (CostTable the moment
 * `/api/costs` lands, the session-scan sections once `/api/activity` does,
 * PLAN D2). Cost trend also gates on `headerState`: its ad-hoc overlay needs
 * `activity.sessions`, so it waits for both resources like the header does,
 * trading away costs-only progressive paint for that one section. The active
 * tab lives in `?tab=` (Work | Sessions | Insights, the last keyed by id
 * `activity`), with the top blocks pinned above the tab strip.
 */
const App = () => {
  const {activity, costs, refresh} = useDashboardData<
    CostsResponse,
    ActivityResponse
  >();
  const [params, , resetQueryParams] = useQueryParams();
  const tab = resolveTabId(params.get('tab'));

  const headerState = combineResourceStates(costs.state, activity.state);
  const resolvedSessions =
    activity.state.status === 'success' ?
      activity.state.data.sessions
    : undefined;

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

  // A cross-tab jump to one cost entry (the Sessions attribution badge) lands
  // on the Work tab with its table selected, symmetric to viewSession.
  const viewEntry = (key: string, table?: 'plans' | 'specs'): void => {
    resetQueryParams({entry: key, tab: 'work', work: table ?? null});
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
                  onViewSession={viewSession}
                  sessions={resolvedSessions}
                />
              )}
            </AsyncSection>

            {/* Ad-hoc code reviews (SPEC-032) sit below the cost table and
                only appear when the project has any: net-new recorded spend
                with no spec/plan row, surfaced so the KPI reconciles. */}
            {costs.state.status === 'success' &&
              costs.state.data.adHocReviews.length > 0 && (
                <AdHocReviews
                  onViewSession={viewSession}
                  reviews={costs.state.data.adHocReviews}
                />
              )}
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
                <SessionsList
                  onViewEntry={viewEntry}
                  sessions={activityData.sessions}
                />
              )}
            </AsyncSection>
          </TabPanel>
        )}

        {tab === 'activity' && (
          <TabPanel tab="activity">
            <AsyncSection
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
              label="Model Usage"
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
              state={headerState}
            >
              {(data) => (
                <CostTrend activity={data.activity} costs={data.costs} />
              )}
            </AsyncSection>

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

            {/* Parse health is a footer that only appears when a data problem
                exists (feedback): silent when clean, so it renders directly
                rather than through AsyncSection's skeleton/region. */}
            {headerState.status === 'success' && (
              <ParseHealth
                activityParseHealth={headerState.data.activity.parseHealth}
                costsParseHealth={headerState.data.costs.parseHealth}
              />
            )}
          </TabPanel>
        )}
      </main>
    </div>
  );
};

export default App;
