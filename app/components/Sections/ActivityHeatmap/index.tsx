import type {FC} from 'react';
import {twMerge} from 'tailwind-merge';
import CalendarHeatmap from '~/components/Charts/CalendarHeatmap';
import type {HeatmapDay} from '~/components/Charts/CalendarHeatmap';
import {formatDayLabel} from '~/components/Charts/date-helpers';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import EmptyState from '~/components/EmptyState';
import Skeleton, {shimmer} from '~/components/Skeleton';
import type {ActivityResponse} from '~/data/schemas/api';

export type ActivityHeatmapProps = {
  /** `ActivityResponse.heatmap`, one entry per local-tz day. */
  heatmap: ActivityResponse['heatmap'];
  /** Overrides the viewer's browser locale; mainly for deterministic tests. */
  locale?: string;
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-4 rounded-md border p-6';

export const eyebrowClassName =
  'text-accent-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'text-fg text-title font-medium';

export const captionClassName = 'text-fg-mute text-sm';

/**
 * Screen-reader-only fallback table (accessibility rule: keyboard/AT users
 * must reach the same information sighted mouse users get from the chart's
 * hover tooltip). The kit's per-cell `aria-label` carries only the date and
 * the primary output-token metric; this list carries every bucket plus the
 * session count for every day, without depending on a kit change.
 */
const HeatmapAccessibleSummary: FC<{
  heatmap: ActivityResponse['heatmap'];
  locale: string | undefined;
}> = ({heatmap, locale}) => (
  <ul className="sr-only" data-testid="activity-heatmap-accessible-summary">
    {heatmap.map((day) => (
      <li key={day.date}>
        {formatDayLabel(day.date, locale)}:{' '}
        {formatCompactNumber(day.buckets.output, locale)} output tokens,{' '}
        {formatCompactNumber(day.buckets.freshInput, locale)} fresh input,{' '}
        {formatCompactNumber(day.buckets.cacheWrite, locale)} cache write,{' '}
        {formatCompactNumber(day.buckets.cacheRead, locale)} cache read,{' '}
        {day.sessionCount} {day.sessionCount === 1 ? 'session' : 'sessions'}.
      </li>
    ))}
  </ul>
);

const toHeatmapDay = (
  day: ActivityResponse['heatmap'][number],
  locale: string | undefined
): HeatmapDay => ({
  day: day.date,
  tooltip: {
    rows: [
      {
        label: 'Output',
        value: formatCompactNumber(day.buckets.output, locale),
      },
      {
        label: 'Fresh input',
        value: formatCompactNumber(day.buckets.freshInput, locale),
      },
      {
        label: 'Cache write',
        value: formatCompactNumber(day.buckets.cacheWrite, locale),
      },
      {
        label: 'Cache read',
        value: formatCompactNumber(day.buckets.cacheRead, locale),
      },
      {
        label: day.sessionCount === 1 ? 'Session' : 'Sessions',
        value: String(day.sessionCount),
      },
    ],
    title: formatDayLabel(day.date, locale),
  },
  value: day.buckets.output,
});

/**
 * SPEC 6.4: GitHub-style calendar over the full session-log history. Wraps
 * the W8 CalendarHeatmap kit; owns the section chrome and maps
 * ActivityResponse.heatmap into the kit's props. Primary metric is output
 * tokens (model work performed); the tooltip surfaces every bucket plus the
 * day's session count.
 *
 * All-zero (or empty) heatmap data collapses the kit's own legend into
 * duplicate "over 0" labels (a known kit limitation this section does not
 * re-fix), so that case renders an intentional empty state instead of the
 * chart.
 */
const ActivityHeatmap: FC<ActivityHeatmapProps> = ({heatmap, locale}) => {
  const hasOutputActivity = heatmap.some((day) => day.buckets.output > 0);

  return (
    <div className={sectionChromeClassName}>
      <header>
        <p className={eyebrowClassName}>Activity</p>
        <h2 className={headingClassName}>Daily output tokens</h2>
        <p className={captionClassName}>
          Full session-log history, one cell per local day. This history often
          reaches back further than recorded cost data, that is expected, not a
          gap.
        </p>
      </header>
      {hasOutputActivity ?
        <>
          <CalendarHeatmap
            data={heatmap.map((day) => toHeatmapDay(day, locale))}
            label="Daily output tokens"
            locale={locale}
            valueLabel="output tokens"
          />
          <HeatmapAccessibleSummary heatmap={heatmap} locale={locale} />
        </>
      : <EmptyState
          description="No output tokens recorded for any session-log day yet. Once GAIA sees model work, this calendar fills in from the earliest session forward."
          title="No activity recorded yet"
        />
      }
    </div>
  );
};

export default ActivityHeatmap;

/**
 * Pixel-matching skeleton (skeleton-loaders skill): same chrome, transparent
 * shimmer text over the real eyebrow/heading/caption strings so reveal
 * causes zero layout shift, plus a block placeholder standing in for the
 * calendar grid. Hidden from assistive tech; AsyncSection's `role="status"`
 * announcement covers the loading state.
 */
export const ActivityHeatmapSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={sectionChromeClassName}
    data-testid="activity-heatmap-skeleton"
  >
    <header>
      <p className={twMerge(eyebrowClassName, shimmer)}>Activity</p>
      <h2 className={twMerge(headingClassName, shimmer)}>
        Daily output tokens
      </h2>
      <p className={twMerge(captionClassName, shimmer)}>
        Full session-log history, one cell per local day. This history often
        reaches back further than recorded cost data, that is expected, not a
        gap.
      </p>
    </header>
    <Skeleton className="h-36 w-full max-w-160" />
  </div>
);
