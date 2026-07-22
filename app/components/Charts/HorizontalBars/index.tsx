import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import {horizontalBarPath} from '~/components/Charts/bar-path';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {
  createLinearScale,
  formatCompactNumber,
} from '~/components/Charts/scale-helpers';
import {opacityTransition} from '~/styles/class-names';

export type HorizontalBarDatum = {
  label: string;
  /** Optional hover detail (e.g. token bucket split); values stay direct-labeled. */
  tooltip?: TooltipContent;
  value: number;
};

type HoveredBar = {
  content: TooltipContent;
  x: number;
  y: number;
};

type Props = {
  data: HorizontalBarDatum[];
  formatValue?: (value: number) => string;
  /** Accessible name for the chart. */
  label?: string;
  labelWidth?: number;
  width?: number;
};

/** 30 rather than 26, and the `labelWidth` default 148 rather than 128: all
 * chart text is `text-label` (13px) in v2, and the v1 sizes let 13px category
 * labels collide with each other and with the bars (DESIGN-SPEC 6.6). */
const ROW_HEIGHT = 30;
const BAR_THICKNESS = 16;
const VALUE_GAP = 6;
const VALUE_SPACE = 56;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Single-metric horizontal bars (model-mix totals, SPEC 6.5): one series on
 * the accent ramp, category labels left, values direct-labeled at the tip,
 * no legend (the title names the lone series).
 */
const HorizontalBars: FC<Props> = ({
  data,
  formatValue = formatCompactNumber,
  label,
  labelWidth = 148,
  width = 480,
}) => {
  const [hovered, setHovered] = useState<HoveredBar>();
  const [hoveredIndex, setHoveredIndex] = useState<number>();

  const maxValue = Math.max(0, ...data.map((datum) => datum.value));
  const plotWidth = width - labelWidth - VALUE_SPACE;
  const scale = createLinearScale([0, maxValue], [0, plotWidth]);
  const height = data.length * ROW_HEIGHT;

  const showBar = (index: number): void => {
    const datum = data[index];

    setHoveredIndex(index);

    if (datum.tooltip) {
      setHovered({
        content: datum.tooltip,
        x: labelWidth + scale(datum.value) / 2,
        y: index * ROW_HEIGHT + (ROW_HEIGHT - BAR_THICKNESS) / 2,
      });
    }
  };

  const clearBar = (): void => {
    setHovered(undefined);
    setHoveredIndex(undefined);
  };

  return (
    <div className="relative inline-block">
      <svg aria-label={label} height={height} role="img" width={width}>
        {data.map((datum, index) => {
          const rowTop = index * ROW_HEIGHT;
          const barLength = scale(datum.value);
          const centerY = rowTop + ROW_HEIGHT / 2;

          return (
            <g key={datum.label}>
              <text
                className="fill-fg-dim text-label"
                textAnchor="end"
                x={labelWidth - 8}
                y={centerY + 4}
              >
                {datum.label}
              </text>
              <path
                className={twJoin(
                  'fill-accent',
                  opacityTransition,
                  hoveredIndex === index && 'opacity-80'
                )}
                d={horizontalBarPath({
                  height: BAR_THICKNESS,
                  width: barLength,
                  x: labelWidth,
                  y: rowTop + (ROW_HEIGHT - BAR_THICKNESS) / 2,
                })}
                data-testid={`horizontal-bar-${datum.label}`}
              />
              <text
                className="fill-fg text-label"
                x={round(labelWidth + barLength + VALUE_GAP)}
                y={centerY + 4}
              >
                {formatValue(datum.value)}
              </text>
              <rect
                aria-label={`${datum.label}: ${formatValue(datum.value)}`}
                className="focus-visible:outline-accent fill-transparent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                height={ROW_HEIGHT}
                onBlur={clearBar}
                onFocus={() => showBar(index)}
                onMouseEnter={() => showBar(index)}
                onMouseLeave={clearBar}
                role="graphics-symbol"
                tabIndex={0}
                width={width}
                x={0}
                y={rowTop}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <ChartTooltip {...hovered.content} x={hovered.x} y={hovered.y} />
      )}
    </div>
  );
};

export default HorizontalBars;
