import {twMerge} from 'tailwind-merge';
import gaiaLogo from '~/assets/gaia-logo.svg';
import SectionSlot from '~/components/App/SectionSlot';
import {shimmer} from '~/components/Skeleton';
import {useDashboardData} from '~/hooks/useDashboardData';

/**
 * Shell-level slice of the /api/costs response: only what the header reads.
 * The Phase 5 integrator retypes useDashboardData with the full
 * CostsResponse / ActivityResponse from schemas/api.ts.
 */
type ShellCostsSlice = {
  project: {name: string; root: string};
};

const projectIdentityClass = 'text-fg-dim text-sm';

/**
 * Page shell (SPEC section 6 top-to-bottom order). Each SectionSlot below is
 * a named slot the Phase 5 integrator replaces with the real section wrapped
 * in AsyncSection; the slot's resource (costs vs activity) is already the
 * right one per PLAN D2, so cost sections paint before the session scan
 * finishes.
 */
const App = () => {
  const {activity, costs, refresh} = useDashboardData<ShellCostsSlice>();

  return (
    <div className="min-h-dvh px-4 pb-16 md:px-8">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 pt-10">
        {/* SPEC 6.1 header: P5 W10 grows this into DashboardHeader */}
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img alt="GAIA" className="h-8 w-auto" src={gaiaLogo} />
            <span className="text-fg-mute font-mono text-xs tracking-[0.2em] uppercase">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            {costs.state.status === 'loading' && (
              <p
                aria-hidden={true}
                className={twMerge(projectIdentityClass, shimmer)}
              >
                project · /Users/you/projects/project
              </p>
            )}
            {costs.state.status === 'success' && (
              <p className={projectIdentityClass}>
                {costs.state.data.project.name} ·{' '}
                {costs.state.data.project.root}
              </p>
            )}
            <button
              className="border-border text-fg-dim hover:border-accent-2 hover:text-fg focus-visible:outline-accent rounded-sm border px-3 py-1.5 font-mono text-xs tracking-[0.15em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          </div>
        </header>

        {/* SPEC 6.2 KpiRow slot (costs; P5 also reads activity for token KPIs) */}
        <SectionSlot
          description="Recorded spend, estimated ad hoc spend, specs, plans, sessions, tokens, and active days."
          onRetry={refresh}
          state={costs.state}
          title="Key metrics"
        />

        {/* SPEC 6.3 CostTable slot (costs) */}
        <SectionSlot
          description="What each spec and plan cost, with phase and session detail."
          onRetry={refresh}
          state={costs.state}
          title="Specs and plans"
        />

        {/* SPEC 6.4 ActivityHeatmap slot (activity) */}
        <SectionSlot
          description="Daily output tokens across the full session history."
          onRetry={refresh}
          state={activity.state}
          title="Activity"
        />

        {/* SPEC 6.5 ModelMix slot (activity) */}
        <SectionSlot
          description="Which models do the work, in total and week by week."
          onRetry={refresh}
          state={activity.state}
          title="Model mix"
        />

        {/* SPEC 6.6 SessionsList slot (activity) */}
        <SectionSlot
          description="Every session, attributed or ad hoc."
          onRetry={refresh}
          state={activity.state}
          title="Sessions"
        />

        {/* SPEC 6.7 CostTrend slot (costs) */}
        <SectionSlot
          description="Recorded cost per spec and plan over time."
          onRetry={refresh}
          state={costs.state}
          title="Cost trend"
        />

        {/* SPEC 6.8 ParseHealth footer slot (P5 merges both parseHealth slices) */}
        <SectionSlot
          description="Skipped lines and unknown values from both data sources."
          onRetry={refresh}
          state={activity.state}
          title="Parse health"
        />
      </main>
    </div>
  );
};

export default App;
