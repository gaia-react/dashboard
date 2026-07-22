import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';
import {formatDayLabel} from '~/components/Charts/date-helpers';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import Sparkline from '~/components/Charts/Sparkline';
import EmptyState from '~/components/EmptyState';
import {
  busiestModel,
  longestSessions,
  mostActiveDay,
  recentDailyTokenTotals,
  topCostlyEntries,
  totalRecordedWorkSeconds,
  weeklyTokensForModel,
} from '~/components/Sections/Insights/insights';
import {formatSessionDuration} from '~/components/Sections/SessionsList/format';
import Skeleton, {shimmer} from '~/components/Skeleton';
import {formatModelName} from '~/data/format/model-name';
import {formatDollars, formatDuration} from '~/data/format/units';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

export type InsightsProps = {
  activity: ActivityResponse;
  costs: CostsResponse;
  locale?: string;
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-6 rounded-md border p-6';

export const eyebrowClassName = 'text-label text-fg-dim';

export const headingClassName = 'text-fg text-title font-medium';
const captionClassName = 'text-fg-mute text-body';
const statTileClassName =
  'bg-bg-elev-2 border-border-soft flex flex-col gap-1 rounded-md border p-4';
// fg-mute -> fg-dim (DESIGN-SPEC section 10, defect 3): these captions sit on
// statTileClassName's bg-elev-2 surface, where fg-mute measures 4.15:1 and
// fails AA. This one-token swap was applied by W10. The per-section eyebrow
// (DESIGN-SPEC 9.1) and the stat/list labels below were later swapped to the
// mandated `text-label text-fg-dim` replacement by the P3 integrator, per
// DESIGN-SPEC 9.1's unconditional "must return nothing" acceptance grep; the
// rest of this file's layout and composition is otherwise untouched, P4
// scope.
const statLabelClassName = 'text-label text-fg-dim';
const statValueClassName =
  'text-fg truncate font-mono text-metric-sm tabular-nums';
const statSubtextClassName = 'text-fg-dim text-label';
// fg-dim, not fg-mute (DESIGN-SPEC section 2.2 / section 10 defect 3): this
// caption sits inside statTileClassName's bg-elev-2 surface, where fg-mute
// measures 4.15:1 and fails AA. Matches statLabelClassName/statSubtextClassName
// on the same tile.
const sparklineCaptionClassName = 'text-label text-fg-dim';
const listLabelClassName = 'text-label text-fg-dim';
const keyBadgeClassName =
  'border-border-soft text-fg-mute shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-label';

/**
 * A sparkline sits below the sublabel only when `series` carries two or more
 * points (DESIGN-SPEC 6.3, C-38); fewer renders nothing and reserves no
 * space, so a tile with no real series (or exactly one point) never grows a
 * placeholder gap.
 */
const StatTile: FC<{
  label: string;
  locale?: string;
  series?: number[];
  seriesLabel?: string;
  sub: string;
  testId: string;
  value: string;
}> = ({label, locale, series, seriesLabel, sub, testId, value}) => (
  <div className={statTileClassName} data-testid={testId}>
    <p className={statLabelClassName}>{label}</p>
    <p className={statValueClassName}>{value}</p>
    <p className={statSubtextClassName}>{sub}</p>
    {series !== undefined && series.length >= 2 && (
      <>
        <Sparkline
          formatValue={(seriesValue) =>
            formatCompactNumber(seriesValue, locale)
          }
          values={series}
        />
        <p className={sparklineCaptionClassName}>{seriesLabel}</p>
      </>
    )}
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
 * SPEC feedback: an Insights section for the Activity tab, covering the most
 * expensive work, the longest sessions, and the busiest day/model/total-time,
 * each read off the already-fetched cost and activity slices. Presentational;
 * the reducers in insights.ts do the ranking.
 */
const Insights: FC<InsightsProps> = ({activity, costs, locale}) => {
  const costly = topCostlyEntries(costs.entries);
  const longest = longestSessions(activity.sessions);
  const activeDay = mostActiveDay(activity.heatmap);
  const model = busiestModel(activity.modelTotals);
  const workSeconds = totalRecordedWorkSeconds(costs.entries);
  const activeDaySeries = recentDailyTokenTotals(activity.heatmap);
  const modelSeries =
    model === null ?
      []
    : weeklyTokensForModel(activity.modelWeekly, model.model);

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
              locale={locale}
              series={activeDaySeries}
              seriesLabel={`Daily tokens, last ${activeDaySeries.length} days`}
              sub={
                activeDay === null ? 'No activity yet' : (
                  `${formatCompactNumber(activeDay.totalTokens, locale)} tokens · ${activeDay.sessionCount} sessions`
                )
              }
              testId="insights-stat-active-day"
              value={
                activeDay === null ? '-' : (
                  formatDayLabel(activeDay.date, locale)
                )
              }
            />
            <StatTile
              label="Busiest model"
              locale={locale}
              series={modelSeries}
              seriesLabel="Weekly tokens for this model"
              sub={
                model === null ?
                  'No model activity yet'
                : `${formatCompactNumber(model.totalTokens, locale)} tokens`
              }
              testId="insights-stat-busiest-model"
              value={model === null ? '-' : formatModelName(model.model)}
            />
            <StatTile
              label="Recorded work time"
              sub="Across all specs & plans"
              testId="insights-stat-work-time"
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
                    className="border-border-soft text-body flex items-center gap-3 border-b py-2 last:border-b-0"
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
                    className="border-border-soft text-body flex items-center gap-3 border-b py-2 last:border-b-0"
                  >
                    <span className="text-fg-dim min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <span className="text-fg-mute text-label shrink-0 font-mono">
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

// Mirrors the three StatTile calls above, in the same order: the first two
// tiles always carry a real series (recentDailyTokenTotals,
// weeklyTokensForModel) so their skeleton reserves the sparkline + caption
// rows; the third never gets a series (DESIGN-SPEC 6.3/7.4), so its skeleton
// stays two rows. Without this, the skeleton-to-real swap grows two of three
// tiles and shifts the ranked lists below them.
const STAT_TILE_SKELETONS = [
  {
    hasSparkline: true,
    label: 'Most active day',
    testId: 'insights-stat-active-day',
  },
  {
    hasSparkline: true,
    label: 'Busiest model',
    testId: 'insights-stat-busiest-model',
  },
  {
    hasSparkline: false,
    label: 'Recorded work time',
    testId: 'insights-stat-work-time',
  },
] as const;

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
      {STAT_TILE_SKELETONS.map(({hasSparkline, label, testId}) => (
        <div key={label} className={statTileClassName} data-testid={testId}>
          <p className={twMerge(statLabelClassName, shimmer)}>{label}</p>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          {hasSparkline && (
            <>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </>
          )}
        </div>
      ))}
    </div>
    <div className="grid gap-8 md:grid-cols-2">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  </div>
);
