import type {FC} from 'react';

type Props = {
  /** What would fill the chart, and why this event has none. Never "No data". */
  reason: string;
  title: string;
};

/**
 * The empty state for a chart whose source is null or empty (DESIGN-SPEC
 * C-30). Deliberately NOT `EmptyState`: an empty chart inside a flat panel
 * section must not grow a bordered box around itself, because a bordered box
 * inside a bordered box is a nested card, which is banned outright.
 *
 * `min-h-24` matches the smallest chart it replaces, so switching between an
 * event with a donut and one without does not jump the panel.
 *
 * Null source data is the common path here, not an edge case: backfill rows
 * carry no `byModel` at all, and roughly half of all spec and plan events
 * carry no adversarial audit (DESIGN-SPEC 7.4).
 */
const ChartEmpty: FC<Props> = ({reason, title}) => (
  <div
    className="flex min-h-24 flex-col justify-center gap-1"
    data-testid="chart-empty"
  >
    <p className="text-label text-fg-dim">{title}</p>
    <p className="text-label text-fg-mute max-w-prose">{reason}</p>
  </div>
);

export default ChartEmpty;
