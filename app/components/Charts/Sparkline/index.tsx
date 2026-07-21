import type {FC} from 'react';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import {sparklinePath} from '~/components/Charts/sparkline-path';

export type SparklineProps = {
  formatValue?: (value: number) => string;
  /** Full override for the accessible name; defaults to the DESIGN-SPEC 6.3
   * "{n} points, low {min}, high {max}, latest {last}" summary. */
  label?: string;
  values: number[];
};

const VIEW_BOX_WIDTH = 120;
const VIEW_BOX_HEIGHT = 32;

/**
 * Trend shape inside a stat tile (DESIGN-SPEC 6.3): compact, axis-less, one
 * series, always the accent hue. Never a standalone chart, so it carries no
 * tooltip: the tile's own value is the current figure and the accessible
 * name carries the range. Fewer than two points renders nothing and
 * reserves no space, matching the component-level degenerate case; the
 * geometry module still handles a single point (a dot) directly, proven in
 * its own tests.
 */
const Sparkline: FC<SparklineProps> = ({
  formatValue = formatCompactNumber,
  label,
  values,
}) => {
  if (values.length < 2) {
    return undefined;
  }

  const path = sparklinePath(values, {
    height: VIEW_BOX_HEIGHT,
    width: VIEW_BOX_WIDTH,
  });
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const latestValue = values.at(-1) ?? 0;
  const summary = `${values.length} points, low ${formatValue(minValue)}, high ${formatValue(maxValue)}, latest ${formatValue(latestValue)}`;

  return (
    <svg
      aria-label={label ?? summary}
      className="h-8 w-full"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
    >
      <path
        className="stroke-accent"
        d={path}
        data-testid="sparkline-path"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export default Sparkline;
