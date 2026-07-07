import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import type {LegendItem} from '~/components/Charts/ChartLegend';
import ChartLegend from '~/components/Charts/ChartLegend';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {
  buildMonthLabels,
  buildWeekdayLabels,
  buildWeekGrid,
  formatDayLabel,
} from '~/components/Charts/date-helpers';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';

export type HeatmapDay = {
  /** Local-timezone day key, YYYY-MM-DD. */
  day: string;
  /** Optional richer hover readout (all buckets + session count). */
  tooltip?: TooltipContent;
  value: number;
};

type HoveredCell = {
  content: TooltipContent;
  x: number;
  y: number;
};

type Props = {
  data: HeatmapDay[];
  /** Defaults to the latest day in data. */
  endDay?: string;
  /** Accessible name for the chart. */
  label?: string;
  locale?: string;
  /** Defaults to the earliest day in data. */
  startDay?: string;
  /** Metric name for cell labels and the default tooltip. */
  valueLabel?: string;
};

const CELL_SIZE = 12;
const CELL_PITCH = 14; // 12px cell + 2px surface gap
const TOP_MARGIN = 20;
const LEFT_MARGIN = 32;
const DAYS_PER_WEEK = 7;
const WEEKDAY_ROWS_TO_LABEL = [1, 3, 5];
/** Opacity steps for buckets 1-4 of the transparent-to-accent ramp. */
const RAMP_OPACITIES = [0.3, 0.5, 0.75, 1];

const bucketForValue = (value: number, maxValue: number): number => {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  const quarter = maxValue / 4;

  return Math.min(4, Math.max(1, Math.ceil(value / quarter)));
};

/**
 * GitHub-style calendar heatmap (SPEC 6.4): one cell per local day, weeks as
 * columns, months labeled, single-hue transparent-to-accent ramp, legend with
 * the bucket thresholds.
 */
const CalendarHeatmap: FC<Props> = ({
  data,
  endDay,
  label,
  locale,
  startDay,
  valueLabel = 'value',
}) => {
  const [hovered, setHovered] = useState<HoveredCell>();

  // ISO day keys compare correctly as strings, so the extent needs no sort.
  const [earliestDay, latestDay] = data.reduce<
    [string | undefined, string | undefined]
  >(
    ([minimum, maximum], datum) => [
      minimum === undefined || datum.day < minimum ? datum.day : minimum,
      maximum === undefined || datum.day > maximum ? datum.day : maximum,
    ],
    [undefined, undefined]
  );
  const rangeStart = startDay ?? earliestDay;
  const rangeEnd = endDay ?? latestDay;

  if (rangeStart === undefined || rangeEnd === undefined) {
    return undefined;
  }

  const dayMap = new Map(data.map((datum) => [datum.day, datum]));
  const weeks = buildWeekGrid(rangeStart, rangeEnd);
  const monthLabels = buildMonthLabels(weeks, locale);
  const weekdayLabels = buildWeekdayLabels(locale);
  const maxValue = Math.max(0, ...data.map((datum) => datum.value));
  const thresholds = [1, 2, 3].map((step) => (maxValue * step) / 4);
  const width = LEFT_MARGIN + weeks.length * CELL_PITCH;
  const height = TOP_MARGIN + DAYS_PER_WEEK * CELL_PITCH;

  const formatThreshold = (threshold: number): string =>
    formatCompactNumber(threshold, locale);

  const legendItems: LegendItem[] = [
    {label: '0', swatchClassName: 'bg-bg-elev'},
    ...RAMP_OPACITIES.map((opacity, index) => ({
      label:
        index < RAMP_OPACITIES.length - 1 ?
          `up to ${formatThreshold(thresholds.at(index) ?? 0)}`
        : `over ${formatThreshold(thresholds.at(-1) ?? 0)}`,
      swatchClassName: 'bg-accent',
      swatchOpacity: opacity,
    })),
  ];

  const showCell = (day: string, x: number, y: number): void => {
    const datum = dayMap.get(day);
    const value = datum?.value ?? 0;
    const content: TooltipContent = datum?.tooltip ?? {
      rows: [{label: valueLabel, value: formatCompactNumber(value, locale)}],
      title: formatDayLabel(day, locale),
    };

    setHovered({content, x: x + CELL_SIZE / 2, y});
  };

  const clearCell = (): void => {
    setHovered(undefined);
  };

  return (
    <div className="inline-flex flex-col gap-2">
      <div className="relative">
        <svg aria-label={label} height={height} role="img" width={width}>
          {monthLabels.map((month) => (
            <text
              key={`${month.label}-${month.weekIndex}`}
              className="fill-fg-mute text-[0.625rem]"
              x={LEFT_MARGIN + month.weekIndex * CELL_PITCH}
              y={12}
            >
              {month.label}
            </text>
          ))}
          {WEEKDAY_ROWS_TO_LABEL.map((row) => (
            <text
              key={row}
              className="fill-fg-mute text-[0.625rem]"
              x={0}
              y={TOP_MARGIN + row * CELL_PITCH + 9}
            >
              {weekdayLabels[row]}
            </text>
          ))}
          {weeks.map((week, weekIndex) =>
            week.days.map((day, slot) => {
              if (day === undefined) {
                return undefined;
              }

              const value = dayMap.get(day)?.value ?? 0;
              const bucket = bucketForValue(value, maxValue);
              const x = LEFT_MARGIN + weekIndex * CELL_PITCH;
              const y = TOP_MARGIN + slot * CELL_PITCH;

              return (
                <rect
                  key={day}
                  aria-label={`${formatDayLabel(day, locale)}: ${formatCompactNumber(value, locale)} ${valueLabel}`}
                  className={twJoin(
                    'focus-visible:outline-accent transition-opacity duration-150 hover:opacity-75 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 motion-reduce:transition-none',
                    bucket === 0 ? 'fill-bg-elev' : 'fill-accent'
                  )}
                  fillOpacity={
                    bucket === 0 ? undefined : RAMP_OPACITIES[bucket - 1]
                  }
                  height={CELL_SIZE}
                  onBlur={clearCell}
                  onFocus={() => showCell(day, x, y)}
                  onMouseEnter={() => showCell(day, x, y)}
                  onMouseLeave={clearCell}
                  role="graphics-symbol"
                  rx={2}
                  tabIndex={0}
                  width={CELL_SIZE}
                  x={x}
                  y={y}
                />
              );
            })
          )}
        </svg>
        {hovered && (
          <ChartTooltip {...hovered.content} x={hovered.x} y={hovered.y} />
        )}
      </div>
      <ChartLegend items={legendItems} />
    </div>
  );
};

export default CalendarHeatmap;
