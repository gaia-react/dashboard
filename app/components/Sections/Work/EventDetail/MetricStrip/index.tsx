import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import type {MetricFigures} from '~/components/Sections/Work/EventDetail/detail-model';
import {
  formatDollarsCell,
  formatDuration,
  formatTokens,
  NO_DATA_LABEL,
} from '~/data/format/units';

/**
 * Shared with `EventDetailSkeleton` so the loading strip occupies the real
 * strip's exact box (DESIGN-SPEC 7.3). Hand-copying these into the skeleton
 * is what makes a swap jump.
 */
export const metricStripClass =
  'sm:divide-border-soft grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x';

export const metricItemClass =
  'flex flex-col gap-1 sm:px-6 sm:first:pl-0 sm:last:pr-0';

export const metricLabelClass = 'text-label text-fg-dim';

export const metricValueClass = 'text-metric-sm font-mono tabular-nums';

/** The three labels, in the one order this strip ever renders them. */
export const METRIC_LABELS = ['Cost', 'Elapsed', 'Total tokens'] as const;

type ItemProps = {
  label: string;
  value: string;
};

/**
 * A missing figure steps down to `fg-mute` rather than reading as a real
 * number in `fg` (DESIGN-SPEC 7.5). The panel sits on `bg-elev`, where
 * `fg-mute` measures 4.55:1 and clears AA; it would not on `bg-elev-2`, which
 * is why no event card may use it.
 */
const MetricItem: FC<ItemProps> = ({label, value}) => (
  <div className={metricItemClass}>
    <dt className={metricLabelClass}>{label}</dt>
    <dd
      className={twJoin(
        metricValueClass,
        value === NO_DATA_LABEL ? 'text-fg-mute' : 'text-fg'
      )}
    >
      {value}
    </dd>
  </div>
);

type Props = {
  figures: MetricFigures;
};

/**
 * Exactly three values, in this order: Cost, Elapsed, Total tokens
 * (DESIGN-SPEC C-21). Not four, and no token-bucket vocabulary anywhere near
 * it. Taking one `MetricFigures` record rather than three props is what keeps
 * the count and the order structural.
 *
 * A missing value renders `NO_DATA_LABEL` from the shared formatters, never
 * `$0.00`, never `0m`, and never a literal dash typed in here.
 */
const MetricStrip: FC<Props> = ({figures}) => (
  <dl className={metricStripClass} data-testid="metric-strip">
    <MetricItem
      label={METRIC_LABELS[0]}
      value={formatDollarsCell(figures.dollars)}
    />
    <MetricItem
      label={METRIC_LABELS[1]}
      value={formatDuration(figures.durationSeconds)}
    />
    <MetricItem
      label={METRIC_LABELS[2]}
      value={formatTokens(figures.totalTokens)}
    />
  </dl>
);

export default MetricStrip;
