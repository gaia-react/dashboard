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
  formatCompactNumber,
} from '~/components/Charts/scale-helpers';

export type TrendBarDatum = {
  id: string;
  /** Which encoding this bar carries: recorded dollars or token volume. */
  kind: 'dollars' | 'tokens';
  label: string;
  tooltip?: TooltipContent;
  value: number;
};

type HoveredBar = {
  content: TooltipContent;
  index: number;
  x: number;
  y: number;
};

type Props = {
  data: TrendBarDatum[];
  formatDollars?: (value: number) => string;
  formatTokens?: (value: number) => string;
  height?: number;
  /** Accessible name for the chart. */
  label?: string;
  locale?: string;
  width?: number;
};

const TOP_MARGIN = 8;
const BOTTOM_MARGIN = 20;
const SIDE_MARGIN = 8;
const MAX_BAR_WIDTH = 24;
const TOKEN_BAR_OPACITY = 0.55;

/**
 * Cost-per-spec trend (SPEC 6.7): one bar per spec/plan, chronological.
 * Dollar-priced entries and token-only entries are two visually distinct
 * encodings, each normalized against its own max; there is deliberately no
 * shared y axis, so token bars are never read against a $-scale. Values live
 * in the tooltip and the legend names both encodings.
 */
const TrendBars: FC<Props> = ({
  data,
  formatDollars,
  formatTokens,
  height = 180,
  label,
  locale,
  width = 560,
}) => {
  const [hovered, setHovered] = useState<HoveredBar>();

  const formatDollarsValue =
    formatDollars ??
    ((value: number) =>
      new Intl.NumberFormat(locale, {
        currency: 'USD',
        style: 'currency',
      }).format(value));
  const formatTokensValue =
    formatTokens ??
    ((value: number) => `${formatCompactNumber(value, locale)} tokens`);
  const formatByKind = (datum: TrendBarDatum): string =>
    datum.kind === 'dollars' ?
      formatDollarsValue(datum.value)
    : formatTokensValue(datum.value);

  const plotBottom = height - BOTTOM_MARGIN;
  const plotHeight = plotBottom - TOP_MARGIN;
  const maxByKind = (kind: TrendBarDatum['kind']): number =>
    Math.max(
      0,
      ...data.filter((datum) => datum.kind === kind).map((datum) => datum.value)
    );
  const scales = {
    dollars: createLinearScale([0, maxByKind('dollars')], [0, plotHeight]),
    tokens: createLinearScale([0, maxByKind('tokens')], [0, plotHeight]),
  };
  const band = createBandScale(
    data.map((datum) => datum.id),
    [SIDE_MARGIN, width - SIDE_MARGIN],
    0.3
  );
  const barWidth = Math.min(MAX_BAR_WIDTH, band.bandwidth);

  const kindsPresent = new Set(data.map((datum) => datum.kind));
  const legendItems: LegendItem[] = [
    ...(kindsPresent.has('dollars') ?
      [{label: 'Recorded $', swatchClassName: 'bg-accent'}]
    : []),
    ...(kindsPresent.has('tokens') ?
      [
        {
          label: 'Tokens (no recorded $)',
          swatchClassName: 'bg-secondary',
          swatchOpacity: TOKEN_BAR_OPACITY,
        },
      ]
    : []),
  ];

  const showBar = (index: number): void => {
    const datum = data[index];
    const barHeight = scales[datum.kind](datum.value);

    setHovered({
      content: datum.tooltip ?? {
        rows: [
          {
            label: datum.kind === 'dollars' ? 'recorded' : 'tokens',
            value: formatByKind(datum),
          },
        ],
        title: datum.label,
      },
      index,
      x: band.position(datum.id) + band.bandwidth / 2,
      y: plotBottom - barHeight,
    });
  };

  const clearBar = (): void => {
    setHovered(undefined);
  };

  return (
    <div className="inline-flex flex-col gap-2">
      <div className="relative">
        <svg aria-label={label} height={height} role="img" width={width}>
          <line
            className="stroke-border"
            strokeWidth={1}
            x1={SIDE_MARGIN}
            x2={width - SIDE_MARGIN}
            y1={plotBottom}
            y2={plotBottom}
          />
          {data.map((datum, index) => {
            const barHeight = scales[datum.kind](datum.value);
            const barX =
              band.position(datum.id) + (band.bandwidth - barWidth) / 2;
            const isEdge = index === 0 || index === data.length - 1;

            return (
              <g key={datum.id}>
                <path
                  className={twJoin(
                    'transition-opacity duration-150 motion-reduce:transition-none',
                    datum.kind === 'dollars' ? 'fill-accent' : 'fill-secondary',
                    hovered?.index === index && 'opacity-80'
                  )}
                  d={verticalBarPath({
                    height: barHeight,
                    width: barWidth,
                    x: barX,
                    y: plotBottom - barHeight,
                  })}
                  data-testid={`trend-bar-${datum.id}`}
                  fillOpacity={
                    datum.kind === 'tokens' ? TOKEN_BAR_OPACITY : undefined
                  }
                />
                {isEdge && (
                  <text
                    className="fill-fg-mute text-[0.625rem]"
                    textAnchor="middle"
                    x={barX + barWidth / 2}
                    y={height - 6}
                  >
                    {datum.id}
                  </text>
                )}
                <rect
                  aria-label={`${datum.label}: ${formatByKind(datum)}`}
                  className="focus-visible:outline-accent fill-transparent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                  height={plotHeight}
                  onBlur={clearBar}
                  onFocus={() => showBar(index)}
                  onMouseEnter={() => showBar(index)}
                  onMouseLeave={clearBar}
                  role="graphics-symbol"
                  tabIndex={0}
                  width={band.bandwidth}
                  x={band.position(datum.id)}
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
      <ChartLegend items={legendItems} />
    </div>
  );
};

export default TrendBars;
