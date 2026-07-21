import type {FC} from 'react';
import {
  clampShare,
  meterWidthPercent,
} from '~/components/Charts/gauge-geometry';

export type GaugeProps = {
  emptyReason?: string;
  emptyTitle?: string;
  formatValue: (value: number) => string;
  /** Accessible label above the track, e.g. "Audit share of phase cost". */
  label?: string;
  /** The whole this value is a share of (the enclosing phase's cost). null
   * or 0 means no share can be computed. */
  max: null | number;
  /** What `max` is, for the below-track sentence, e.g. "execute phase". */
  maxLabel: string;
  /** The measured figure (the audit's cost). */
  value: null | number;
};

/**
 * Linear meter (DESIGN-SPEC 6.2, 11.6): the adversarial audit's share of its
 * phase cost, as a single ratio against a limit. Renders a **linear meter**,
 * not an arc: the dataviz form heuristic sends a single ratio to a meter,
 * its anti-patterns reject a two-slice radial, and no token in this palette
 * is quiet enough to serve as a visible unfilled arc track above 3:1. Plain
 * HTML, not SVG. Every value is direct-labeled; the track color never
 * carries the number alone, and an over-max value clamps the fill while
 * still labeling the true, unclamped figure.
 */
const Gauge: FC<GaugeProps> = ({
  emptyReason,
  emptyTitle = 'Audit share not available',
  formatValue,
  label = 'Audit share of phase cost',
  max,
  maxLabel,
  value,
}) => {
  if (value === null || max === null || max <= 0) {
    const reason =
      emptyReason ??
      (value === null ?
        'The enclosing phase recorded no cost, so the audit share of it cannot be computed.'
      : `The enclosing phase recorded no cost, so the audit share of it cannot be computed. The audit itself cost ${formatValue(value)}.`);

    return (
      <div className="flex min-h-24 flex-col justify-center gap-1">
        <p className="text-label text-fg-dim">{emptyTitle}</p>
        <p className="text-label text-fg-mute max-w-prose">{reason}</p>
      </div>
    );
  }

  const share = clampShare(value, max);
  const widthPercent = meterWidthPercent(share);
  const truePercent = Math.round((value / max) * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-label text-fg-dim">{label}</p>
        <p className="text-metric-sm text-fg font-mono tabular-nums">
          {truePercent}%
        </p>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(share * 100)}
        aria-valuetext={`${truePercent} percent of phase cost`}
        className="bg-border h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-secondary h-full rounded-full"
          data-testid="gauge-fill"
          style={{width: `${widthPercent}%`}}
        />
      </div>
      <p className="text-label text-fg-mute">
        {formatValue(value)} of {formatValue(max)}, {maxLabel}
      </p>
    </div>
  );
};

export default Gauge;
