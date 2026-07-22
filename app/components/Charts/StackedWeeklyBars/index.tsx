import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import {verticalBarPath} from '~/components/Charts/bar-path';
import {
  buildSeriesColorMap,
  groupTailSeries,
  OTHER_SERIES_KEY,
} from '~/components/Charts/chart-palette';
import ChartLegend from '~/components/Charts/ChartLegend';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {formatWeekLabel} from '~/components/Charts/date-helpers';
import {
  createBandScale,
  createLinearScale,
  formatCompactNumber,
  niceTicks,
} from '~/components/Charts/scale-helpers';
import {opacityTransition} from '~/styles/class-names';

export type WeeklyStackDatum = {
  /** Per-series values for this week, keyed by series id. */
  values: Record<string, number>;
  /** Week-start day key, YYYY-MM-DD. */
  week: string;
};

type HoveredWeek = {
  content: TooltipContent;
  index: number;
  x: number;
  y: number;
};

type Props = {
  data: WeeklyStackDatum[];
  formatValue?: (value: number) => string;
  height?: number;
  /** Accessible name for the chart. */
  label?: string;
  locale?: string;
  /** Display names per series id; "other" is always labeled "Other". */
  seriesLabels?: Record<string, string>;
  width?: number;
};

const TOP_MARGIN = 8;
const BOTTOM_MARGIN = 20;
/** 56 rather than 44: all chart text is `text-label` (13px) in v2, and 13px
 * tick labels need more room than the v1 10px size gave them (DESIGN-SPEC
 * 6.6). */
const LEFT_MARGIN = 56;
const RIGHT_MARGIN = 8;
const SEGMENT_GAP = 2;
const MAX_BAR_WIDTH = 24;
/** 6 rather than 8: fewer, wider-spaced week labels at 13px avoid collision
 * (DESIGN-SPEC 6.6). */
const MAX_WEEK_LABELS = 6;

/**
 * Stacked vertical bars on a week band scale (model mix over time, SPEC 6.5).
 * Series colors follow the SPEC section 7 palette order; past six concurrent
 * series the tail folds into "Other" (neutral hue). Hovering a week shows one
 * tooltip listing every series at that x.
 */
const StackedWeeklyBars: FC<Props> = ({
  data,
  formatValue,
  height = 200,
  label,
  locale,
  seriesLabels,
  width = 560,
}) => {
  const [hovered, setHovered] = useState<HoveredWeek>();

  const formatNumber =
    formatValue ?? ((value: number) => formatCompactNumber(value, locale));
  const labelForSeries = (key: string): string =>
    key === OTHER_SERIES_KEY ? 'Other' : (seriesLabels?.[key] ?? key);

  const grouped = groupTailSeries(data.map((datum) => datum.values));
  const colorMap = buildSeriesColorMap(grouped.seriesKeys);
  const weekKeys = data.map((datum) => datum.week);
  // Maps make absent series read as undefined (a values record may omit a
  // series in some weeks), so lookups degrade to 0 explicitly.
  const rowMaps = grouped.rows.map((row) => new Map(Object.entries(row)));
  const totals = grouped.rows.map((row) =>
    Object.values(row).reduce((sum, value) => sum + value, 0)
  );
  const ticks = niceTicks(Math.max(0, ...totals));
  const axisMax = ticks.at(-1) ?? 0;

  const plotBottom = height - BOTTOM_MARGIN;
  const yScale = createLinearScale([0, axisMax], [plotBottom, TOP_MARGIN]);
  const band = createBandScale(
    weekKeys,
    [LEFT_MARGIN, width - RIGHT_MARGIN],
    0.3
  );
  const barWidth = Math.min(MAX_BAR_WIDTH, band.bandwidth);
  const weekLabelStep = Math.ceil(weekKeys.length / MAX_WEEK_LABELS);

  const showWeek = (index: number): void => {
    const weekKey = weekKeys[index];
    const row = rowMaps[index];

    setHovered({
      content: {
        rows: grouped.seriesKeys.map((key) => ({
          label: labelForSeries(key),
          swatchClassName: colorMap[key].swatchClassName,
          value: formatNumber(row.get(key) ?? 0),
        })),
        title: `Week of ${formatWeekLabel(weekKey, locale)}`,
      },
      index,
      x: band.position(weekKey) + band.bandwidth / 2,
      y: yScale(totals[index]),
    });
  };

  const clearWeek = (): void => {
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
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const row = rowMaps[index];
            const barX =
              band.position(datum.week) + (band.bandwidth - barWidth) / 2;
            const segments: {key: string; pixelHeight: number; top: number}[] =
              [];
            let cumulative = 0;

            for (const key of grouped.seriesKeys) {
              const value = row.get(key) ?? 0;

              if (value > 0) {
                const bottom = yScale(cumulative);
                const top = yScale(cumulative + value);
                const pixelHeight =
                  bottom - top - (segments.length === 0 ? 0 : SEGMENT_GAP);

                cumulative += value;

                if (pixelHeight > 0) {
                  segments.push({key, pixelHeight, top});
                }
              }
            }

            return (
              <g key={datum.week}>
                {segments.map((segment, segmentIndex) => {
                  const segmentClass = twJoin(
                    opacityTransition,
                    colorMap[segment.key].fillClassName,
                    hovered?.index === index && 'opacity-80'
                  );

                  return segmentIndex === segments.length - 1 ?
                      <path
                        key={segment.key}
                        className={segmentClass}
                        d={verticalBarPath({
                          height: segment.pixelHeight,
                          width: barWidth,
                          x: barX,
                          y: segment.top,
                        })}
                        data-testid={`stack-segment-${datum.week}-${segment.key}`}
                      />
                    : <rect
                        key={segment.key}
                        className={segmentClass}
                        data-testid={`stack-segment-${datum.week}-${segment.key}`}
                        height={segment.pixelHeight}
                        width={barWidth}
                        x={barX}
                        y={segment.top}
                      />;
                })}
                {index % weekLabelStep === 0 && (
                  <text
                    className="fill-fg-mute text-label"
                    textAnchor="middle"
                    x={barX + barWidth / 2}
                    y={height - 6}
                  >
                    {formatWeekLabel(datum.week, locale)}
                  </text>
                )}
                <rect
                  aria-label={`Week of ${formatWeekLabel(datum.week, locale)}: ${formatNumber(totals[index])} total`}
                  className="focus-visible:outline-accent fill-transparent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                  height={plotBottom - TOP_MARGIN}
                  onBlur={clearWeek}
                  onFocus={() => showWeek(index)}
                  onMouseEnter={() => showWeek(index)}
                  onMouseLeave={clearWeek}
                  role="graphics-symbol"
                  tabIndex={0}
                  width={band.bandwidth}
                  x={band.position(datum.week)}
                  y={TOP_MARGIN}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <ChartTooltip {...hovered.content} x={hovered.x} y={hovered.y} />
        )}
      </div>
      <ChartLegend
        items={grouped.seriesKeys.map((key) => ({
          label: labelForSeries(key),
          swatchClassName: colorMap[key].swatchClassName,
        }))}
      />
    </div>
  );
};

export default StackedWeeklyBars;
