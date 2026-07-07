import AsyncSection from '~/components/AsyncSection';
import ActivityHeatmap, {
  ActivityHeatmapSkeleton,
} from '~/components/Sections/ActivityHeatmap';
import CostTable, {CostTableSkeleton} from '~/components/Sections/CostTable';
import CostTrend, {CostTrendSkeleton} from '~/components/Sections/CostTrend';
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
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {combineResourceStates} from '~/hooks/combineResourceStates';
import {useDashboardData} from '~/hooks/useDashboardData';

/**
 * Page shell (SPEC section 6 top-to-bottom order). DashboardHeader and
 * KpiRow (6.1/6.2) and the ParseHealth footer (6.8) all read fields from
 * BOTH `/api/costs` and `/api/activity`, so they gate on `headerState`, a
 * combined resource state that only resolves once both endpoints have
 * (PLAN D2 still holds for the cost-only sections below: CostTable's own
 * rows and CostTrend paint the moment `/api/costs` lands, well before the
 * session scan finishes).
 */
const App = () => {
  const {activity, costs, refresh} = useDashboardData<
    CostsResponse,
    ActivityResponse
  >();
  const headerState = combineResourceStates(costs.state, activity.state);
  const resolvedSessions =
    activity.state.status === 'success' ?
      activity.state.data.sessions
    : undefined;

  return (
    <div className="min-h-dvh px-4 pb-16 md:px-8">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 pt-10">
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
          {(data) => <KpiRow activity={data.activity} costs={data.costs} />}
        </AsyncSection>

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

        <AsyncSection
          label="Activity"
          onRetry={refresh}
          skeleton={<ActivityHeatmapSkeleton />}
          state={activity.state}
        >
          {(activityData) => <ActivityHeatmap heatmap={activityData.heatmap} />}
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
          label="Sessions"
          onRetry={refresh}
          skeleton={<SessionsListSkeleton />}
          state={activity.state}
        >
          {(activityData) => <SessionsList sessions={activityData.sessions} />}
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
      </main>
    </div>
  );
};

export default App;
