import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import {verticalBarPath} from '~/components/Charts/bar-path';
import type {LegendItem} from '~/components/Charts/ChartLegend';
import ChartLegend from '~/components/Charts/ChartLegend';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {
  createBandScale,
  createLinearScale,
  niceTicks,
} from '~/components/Charts/scale-helpers';
import {opacityTransition} from '~/styles/class-names';

export type PeriodBarDatum = {
  /** Estimated ad-hoc dollars for this period. */
  adHocValue: number;
  /** Local calendar day-key (YYYY-MM-DD) marking the period's start. */
  periodStart: string;
  /** Recorded spec/plan dollars for this period. */
  recordedValue: number;
};

type HoveredPeriod = {
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
/** 24 rather than 20, for the same reason TrendBars gets it: a 13px baseline
 * label does not fit under a 20px margin (DESIGN-SPEC 6.6). */
const BOTTOM_MARGIN = 24;
// Wider than StackedWeeklyBars' 44: full dollar amounts run longer than
// compact numbers like "30M", and a right-anchored label that overruns x=0
// clips its leading character.
const LEFT_MARGIN = 64;
const RIGHT_MARGIN = 8;
const MAX_BAR_WIDTH = 20;
const GROUP_GAP = 3;
/** Estimated-basis bars read as less certain than recorded ones: same
 * translucent-secondary treatment TrendBars used for its own "not actually
 * priced" encoding, reused here for the same reason (never let an estimate
 * read as measured). */
const AD_HOC_BAR_OPACITY = 0.55;

/**
 * Period-over-period bars (cost-trend redesign, ad-hoc overlay): two series
 * grouped per week or month, recorded spec/plan spend next to estimated
 * ad-hoc spend, so "ad hoc costs more than spec/plan work" or "spent more
 * this period than last" both read directly instead of being decoded from a
 * running total. Recorded rides the confident accent; ad-hoc rides a
 * distinct, translucent secondary hue so an estimate never reads as
 * measured (SPEC section 7 / SPEC section 5 rule 3). Every period in range
 * gets both bars, including $0 ones, so adjacent groups are always a fair
 * comparison.
 */
const PeriodSpendBars: FC<Props> = ({
  data,
  formatPeriodLabel,
  formatValue,
  height = 180,
  label,
  width = 560,
}) => {
  const [hovered, setHovered] = useState<HoveredPeriod>();

  const plotBottom = height - BOTTOM_MARGIN;
  const plotTop = TOP_MARGIN;
  const maxValue = Math.max(
    0,
    ...data.flatMap((datum) => [datum.recordedValue, datum.adHocValue])
  );
  const ticks = niceTicks(maxValue);
  const axisMax = ticks.at(-1) ?? 0;
  const yScale = createLinearScale([0, axisMax], [plotBottom, plotTop]);
  const band = createBandScale(
    data.map((datum) => datum.periodStart),
    [LEFT_MARGIN, width - RIGHT_MARGIN],
    0.3
  );
  const barWidth = Math.max(
    0,
    Math.min(MAX_BAR_WIDTH, (band.bandwidth - GROUP_GAP) / 2)
  );
  const groupOffset = (band.bandwidth - (barWidth * 2 + GROUP_GAP)) / 2;

  const legendItems: LegendItem[] = [
    {label: 'Spec & plan (recorded)', swatchClassName: 'bg-accent'},
    {
      label: 'Ad hoc (estimated)',
      swatchClassName: 'bg-secondary',
      swatchOpacity: AD_HOC_BAR_OPACITY,
    },
  ];

  const showPeriod = (index: number): void => {
    const datum = data[index];

    setHovered({
      content: {
        rows: [
          {label: 'Spec & plan', value: formatValue(datum.recordedValue)},
          {label: 'Ad hoc (est.)', value: formatValue(datum.adHocValue)},
        ],
        title: formatPeriodLabel(datum.periodStart),
      },
      index,
      x: band.position(datum.periodStart) + band.bandwidth / 2,
      y: yScale(Math.max(datum.recordedValue, datum.adHocValue)),
    });
  };

  const clearPeriod = (): void => {
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
                className="fill-fg-mute text-label tabular-nums"
                textAnchor="end"
                x={LEFT_MARGIN - 6}
                y={yScale(tick) + 3}
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const groupX = band.position(datum.periodStart) + groupOffset;
            const recordedTop = yScale(datum.recordedValue);
            const adHocTop = yScale(datum.adHocValue);
            const isHovered = hovered?.index === index;

            return (
              <g key={datum.periodStart}>
                <path
                  className={twJoin(
                    'fill-accent',
                    opacityTransition,
                    isHovered && 'opacity-80'
                  )}
                  d={verticalBarPath({
                    height: plotBottom - recordedTop,
                    width: barWidth,
                    x: groupX,
                    y: recordedTop,
                  })}
                  data-testid={`period-bar-recorded-${datum.periodStart}`}
                />
                <path
                  className={twJoin(
                    'fill-secondary',
                    opacityTransition,
                    isHovered && 'opacity-80'
                  )}
                  d={verticalBarPath({
                    height: plotBottom - adHocTop,
                    width: barWidth,
                    x: groupX + barWidth + GROUP_GAP,
                    y: adHocTop,
                  })}
                  data-testid={`period-bar-adhoc-${datum.periodStart}`}
                  fillOpacity={AD_HOC_BAR_OPACITY}
                />
                <text
                  className="fill-fg-mute text-label"
                  textAnchor="middle"
                  x={band.position(datum.periodStart) + band.bandwidth / 2}
                  y={height - 6}
                >
                  {formatPeriodLabel(datum.periodStart)}
                </text>
                <rect
                  aria-label={`${formatPeriodLabel(datum.periodStart)}: spec & plan (recorded) ${formatValue(datum.recordedValue)}, ad hoc (estimated) ${formatValue(datum.adHocValue)}`}
                  className="focus-visible:outline-accent fill-transparent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                  height={plotBottom - plotTop}
                  onBlur={clearPeriod}
                  onFocus={() => showPeriod(index)}
                  onMouseEnter={() => showPeriod(index)}
                  onMouseLeave={clearPeriod}
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
      <ChartLegend items={legendItems} />
    </div>
  );
};

export default PeriodSpendBars;
