import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';
import {formatDayLabel} from '~/components/Charts/date-helpers';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import EmptyState from '~/components/EmptyState';
import {formatDuration} from '~/components/Sections/CostTable/format';
import {
  busiestModel,
  longestSessions,
  mostActiveDay,
  topCostlyEntries,
  totalRecordedWorkSeconds,
} from '~/components/Sections/Insights/insights';
import {formatDollars} from '~/components/Sections/KpiRow/format-kpi';
import {formatSessionDuration} from '~/components/Sections/SessionsList/format';
import Skeleton, {shimmer} from '~/components/Skeleton';
import {formatModelName} from '~/data/format/model-name';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

export type InsightsProps = {
  activity: ActivityResponse;
  costs: CostsResponse;
  locale?: string;
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-6 rounded-md border p-6';

export const eyebrowClassName =
  'text-secondary-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'font-display text-fg text-2xl font-light';
const captionClassName = 'text-fg-mute text-sm';
const statTileClassName =
  'bg-bg-elev-2 border-border-soft flex flex-col gap-1 rounded-md border p-4';
const statLabelClassName =
  'text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const statValueClassName = 'font-display text-fg truncate text-xl font-light';
const statSubtextClassName = 'text-fg-mute text-xs';
const listLabelClassName =
  'text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const keyBadgeClassName =
  'border-border-soft text-fg-mute shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide';

const StatTile: FC<{label: string; sub: string; value: string}> = ({
  label,
  sub,
  value,
}) => (
  <div className={statTileClassName}>
    <p className={statLabelClassName}>{label}</p>
    <p className={statValueClassName}>{value}</p>
    <p className={statSubtextClassName}>{sub}</p>
  </div>
);

const RankedList: FC<{children: ReactNode; label: string}> = ({
  children,
  label,
}) => (
  <div className="flex flex-col gap-2">
    <p className={listLabelClassName}>{label}</p>
    <ol className="flex flex-col">{children}</ol>
  </div>
);

/**
 * SPEC feedback: an Insights section for the Activity tab — the most expensive
 * work, the longest sessions, and the busiest day/model/total-time, each read
 * off the already-fetched cost and activity slices. Presentational; the
 * reducers in insights.ts do the ranking.
 */
const Insights: FC<InsightsProps> = ({activity, costs, locale}) => {
  const costly = topCostlyEntries(costs.entries);
  const longest = longestSessions(activity.sessions);
  const activeDay = mostActiveDay(activity.heatmap);
  const model = busiestModel(activity.modelTotals);
  const workSeconds = totalRecordedWorkSeconds(costs.entries);

  const hasContent =
    costly.length > 0 ||
    longest.length > 0 ||
    activeDay !== null ||
    model !== null;

  return (
    <div className={sectionChromeClassName}>
      <header>
        <p className={eyebrowClassName}>Highlights</p>
        <h2 className={headingClassName}>What stood out</h2>
        <p className={captionClassName}>
          The standouts across this project&apos;s cost and activity.
        </p>
      </header>

      {hasContent ?
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Most active day"
              sub={
                activeDay === null ? 'No activity yet' : (
                  `${formatCompactNumber(activeDay.output, locale)} output · ${activeDay.sessionCount} sessions`
                )
              }
              value={
                activeDay === null ? '-' : (
                  formatDayLabel(activeDay.date, locale)
                )
              }
            />
            <StatTile
              label="Busiest model"
              sub={
                model === null ?
                  'No model activity yet'
                : `${formatCompactNumber(model.output, locale)} output tokens`
              }
              value={model === null ? '-' : formatModelName(model.model)}
            />
            <StatTile
              label="Recorded work time"
              sub="Across all specs & plans"
              value={workSeconds > 0 ? formatDuration(workSeconds) : '-'}
            />
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <RankedList label="Costliest specs & plans">
              {costly.length === 0 ?
                <li className={captionClassName}>No priced work yet.</li>
              : costly.map((item) => (
                  <li
                    key={item.key}
                    className="border-border-soft flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
                  >
                    <span className={keyBadgeClassName}>{item.key}</span>
                    <span className="text-fg-dim min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <span className="text-fg shrink-0 font-semibold">
                      {formatDollars(item.dollars, locale)}
                    </span>
                  </li>
                ))
              }
            </RankedList>

            <RankedList label="Longest sessions">
              {longest.length === 0 ?
                <li className={captionClassName}>No sessions yet.</li>
              : longest.map((item) => (
                  <li
                    key={item.sessionId}
                    className="border-border-soft flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
                  >
                    <span className="text-fg-dim min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <span className="text-fg-mute shrink-0 font-mono text-xs">
                      {formatSessionDuration(item.durationSeconds)}
                    </span>
                  </li>
                ))
              }
            </RankedList>
          </div>
        </>
      : <EmptyState
          description="As specs, plans, and sessions accrue, this project's standout numbers surface here."
          title="No insights yet"
        />
      }
    </div>
  );
};

export default Insights;

/** Pixel-matching loading placeholder for AsyncSection's `skeleton` prop. */
export const InsightsSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={sectionChromeClassName}
    data-testid="insights-skeleton"
  >
    <header>
      <p className={twMerge(eyebrowClassName, shimmer)}>Highlights</p>
      <h2 className={twMerge(headingClassName, shimmer)}>What stood out</h2>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">
      {['a', 'b', 'c'].map((key) => (
        <Skeleton key={key} className="h-20 w-full" />
      ))}
    </div>
    <div className="grid gap-8 md:grid-cols-2">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  </div>
);
