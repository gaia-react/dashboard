import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import {verticalBarPath} from '~/components/Charts/bar-path';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {
  createBandScale,
  createLinearScale,
  niceTicks,
} from '~/components/Charts/scale-helpers';

export type PeriodBarDatum = {
  /** Local calendar day-key (YYYY-MM-DD) marking the period's start. */
  periodStart: string;
  value: number;
};

type HoveredBar = {
  content: TooltipContent;
  index: number;
  x: number;
  y: number;
};

type Props = {
  data: PeriodBarDatum[];
  /** The caller already knows the granularity (week/month), so it owns
   * period-label formatting rather than this chart re-deriving it. */
  formatPeriodLabel: (periodStart: string) => string;
  formatValue: (value: number) => string;
  height?: number;
  /** Accessible name for the chart. */
  label?: string;
  width?: number;
};

const TOP_MARGIN = 8;
const BOTTOM_MARGIN = 20;
// Wider than StackedWeeklyBars' 44: full dollar amounts run longer than
// compact numbers like "30M", and a right-anchored label that overruns x=0
// clips its leading character.
const LEFT_MARGIN = 64;
const RIGHT_MARGIN = 8;
const MAX_BAR_WIDTH = 24;

/**
 * Single-metric period-over-period bars (cost-trend redesign): one bar per
 * week or month of recorded spend, so "spent more this period than last"
 * reads directly instead of being decoded from a running total. One
 * accent-ramp series (SPEC section 7: single-metric encodings stay on the
 * accent ramp); every period in range gets a bar, including a $0 one, so
 * adjacent bars are always a fair comparison.
 */
const PeriodSpendBars: FC<Props> = ({
  data,
  formatPeriodLabel,
  formatValue,
  height = 180,
  label,
  width = 560,
}) => {
  const [hovered, setHovered] = useState<HoveredBar>();

  const plotBottom = height - BOTTOM_MARGIN;
  const plotTop = TOP_MARGIN;
  const ticks = niceTicks(Math.max(0, ...data.map((datum) => datum.value)));
  const axisMax = ticks.at(-1) ?? 0;
  const yScale = createLinearScale([0, axisMax], [plotBottom, plotTop]);
  const band = createBandScale(
    data.map((datum) => datum.periodStart),
    [LEFT_MARGIN, width - RIGHT_MARGIN],
    0.3
  );
  const barWidth = Math.min(MAX_BAR_WIDTH, band.bandwidth);

  const showBar = (index: number): void => {
    const datum = data[index];
    const barTop = yScale(datum.value);

    setHovered({
      content: {
        rows: [{label: 'Recorded', value: formatValue(datum.value)}],
        title: formatPeriodLabel(datum.periodStart),
      },
      index,
      x: band.position(datum.periodStart) + band.bandwidth / 2,
      y: barTop,
    });
  };

  const clearBar = (): void => {
    setHovered(undefined);
  };

  return (
    <div className="inline-flex flex-col gap-2">
      <div className="relative">
        <svg aria-label={label} height={height} role="img" width={width}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="stroke-border"
                strokeWidth={1}
                x1={LEFT_MARGIN}
                x2={width - RIGHT_MARGIN}
                y1={yScale(tick)}
                y2={yScale(tick)}
              />
              <text
                className="fill-fg-mute text-[0.625rem] tabular-nums"
                textAnchor="end"
                x={LEFT_MARGIN - 6}
                y={yScale(tick) + 3}
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const barTop = yScale(datum.value);
            const barHeight = plotBottom - barTop;
            const barX =
              band.position(datum.periodStart) +
              (band.bandwidth - barWidth) / 2;

            return (
              <g key={datum.periodStart}>
                <path
                  className={twJoin(
                    'fill-accent transition-opacity duration-150 motion-reduce:transition-none',
                    hovered?.index === index && 'opacity-80'
                  )}
                  d={verticalBarPath({
                    height: barHeight,
                    width: barWidth,
                    x: barX,
                    y: barTop,
                  })}
                  data-testid={`period-bar-${datum.periodStart}`}
                />
                <text
                  className="fill-fg-mute text-[0.625rem]"
                  textAnchor="middle"
                  x={barX + barWidth / 2}
                  y={height - 6}
                >
                  {formatPeriodLabel(datum.periodStart)}
                </text>
                <rect
                  aria-label={`${formatPeriodLabel(datum.periodStart)}: ${formatValue(datum.value)}`}
                  className="focus-visible:outline-accent fill-transparent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                  height={plotBottom - plotTop}
                  onBlur={clearBar}
                  onFocus={() => showBar(index)}
                  onMouseEnter={() => showBar(index)}
                  onMouseLeave={clearBar}
                  role="graphics-symbol"
                  tabIndex={0}
                  width={band.bandwidth}
                  x={band.position(datum.periodStart)}
                  y={plotTop}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <ChartTooltip {...hovered.content} x={hovered.x} y={hovered.y} />
        )}
      </div>
    </div>
  );
};

export default PeriodSpendBars;
