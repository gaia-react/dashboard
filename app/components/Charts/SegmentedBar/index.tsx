import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import ChartEmpty from '~/components/ChartEmpty';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {PhaseAmount} from '~/components/Charts/segment-shares';
import {segmentShares} from '~/components/Charts/segment-shares';
import {colorTransition, opacityTransition} from '~/styles/class-names';

export type SegmentedBarProps = {
  /**
   * The measure noun named in the null-phase footnote ("{phase} phase
   * recorded no {emptyMeasureLabel}"). Defaults to "cost"; a caller plotting
   * a different measure (e.g. elapsed time) on this same component must pass
   * its own noun, or the footnote reports the wrong measure.
   */
  emptyMeasureLabel?: string;
  emptyReason?: string;
  emptyTitle?: string;
  formatValue?: (value: number) => string;
  /** Accessible name for the bar, e.g. "Cost by phase" or "Elapsed by phase". */
  label?: string;
  values: SegmentedBarValues;
};

export type SegmentedBarValues = {
  execute: null | number;
  plan: null | number;
  spec: null | number;
};

type PhaseConfig = {
  fillClassName: string;
  key: PhaseKey;
  label: string;
};

type PhaseKey = keyof SegmentedBarValues;

/**
 * Phase segments take an ordinal ramp fixed by phase order, never
 * categorical slots (DESIGN-SPEC 6.4, 11.6): the three brand-hue slots stay
 * reserved for model and agent-type series, so "plan phase" never wears the
 * Audit event's tone.
 */
const PHASES: PhaseConfig[] = [
  {fillClassName: 'bg-accent-2', key: 'spec', label: 'Spec'},
  {fillClassName: 'bg-accent', key: 'plan', label: 'Plan'},
  {fillClassName: 'bg-accent-soft', key: 'execute', label: 'Execute'},
];

/**
 * Phase composition bar (DESIGN-SPEC 6.4): spec, then plan, then execute, as
 * proportional segments of one horizontal bar, for one measure at a time
 * (cost or elapsed; the caller renders two instances, never a dual-axis
 * combination). Plain HTML flex, not SVG: a rounded-full SVG rect under
 * preserveAspectRatio="none" distorts its corners. Every value is
 * direct-labeled in the legend, so the bar itself carries no tooltip.
 */
const SegmentedBar: FC<SegmentedBarProps> = ({
  emptyMeasureLabel = 'cost',
  emptyReason = 'This entry has no recorded phases. Cost and elapsed time are reported at the entry level only.',
  emptyTitle = 'No phase breakdown',
  formatValue = formatCompactNumber,
  label,
  values,
}) => {
  const [hoveredKey, setHoveredKey] = useState<PhaseKey>();

  const amounts: PhaseAmount[] = PHASES.map(({key}) => ({
    key,
    value: values[key],
  }));
  const {nullKeys, segments} = segmentShares(amounts);
  const configByKey = new Map(PHASES.map((phase) => [phase.key, phase]));

  if (segments.length === 0) {
    return <ChartEmpty reason={emptyReason} title={emptyTitle} />;
  }

  const clearHover = (): void => setHoveredKey(undefined);

  return (
    <div className="flex flex-col gap-2">
      <div aria-label={label} className="flex h-3 w-full gap-0.5" role="img">
        {segments.map((segment) => {
          const key = segment.key as PhaseKey;
          const phase = configByKey.get(key);

          return (
            <div
              key={key}
              aria-hidden={true}
              className={twJoin(
                'min-w-1 rounded-full',
                phase?.fillClassName,
                opacityTransition,
                hoveredKey === key && 'opacity-80'
              )}
              data-testid={`segmented-bar-fill-${key}`}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={clearHover}
              style={{flexGrow: segment.value}}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {segments.map((segment) => {
          const key = segment.key as PhaseKey;
          const phase = configByKey.get(key);

          return (
            <li key={key}>
              <button
                className={twJoin(
                  'focus-visible:outline-accent flex w-full items-center gap-1.5 text-left focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1',
                  'text-label',
                  colorTransition,
                  hoveredKey === key ? 'text-fg' : 'text-fg-dim'
                )}
                data-testid={`segmented-bar-legend-${key}`}
                onBlur={clearHover}
                onFocus={() => setHoveredKey(key)}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={clearHover}
                type="button"
              >
                <span
                  aria-hidden={true}
                  className={twJoin(
                    'size-2.5 rounded-xs',
                    phase?.fillClassName
                  )}
                />
                <span>{phase?.label}</span>
                <span className="font-mono tabular-nums">
                  {segment.percent}%
                </span>
                <span className="font-mono tabular-nums">
                  {formatValue(segment.value)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {nullKeys.length > 0 && (
        <p className="text-label text-fg-mute">
          {nullKeys
            .map(
              (key) =>
                `${configByKey.get(key as PhaseKey)?.label} phase recorded no ${emptyMeasureLabel}`
            )
            .join('. ')}
        </p>
      )}
      <ul className="sr-only" data-testid="segmented-bar-accessible-summary">
        {segments.map((segment) => {
          const key = segment.key as PhaseKey;
          const phase = configByKey.get(key);

          return (
            <li key={key}>
              {phase?.label}: {formatValue(segment.value)}, {segment.percent}%
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SegmentedBar;
