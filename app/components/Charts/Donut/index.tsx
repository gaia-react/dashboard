import type {FC} from 'react';
import {useState} from 'react';
import {twJoin} from 'tailwind-merge';
import ChartEmpty from '~/components/ChartEmpty';
import {
  buildSeriesColorMap,
  groupTailSeries,
  OTHER_SERIES_KEY,
} from '~/components/Charts/chart-palette';
import type {TooltipContent} from '~/components/Charts/ChartTooltip';
import ChartTooltip from '~/components/Charts/ChartTooltip';
import {donutArcPath, donutSegments} from '~/components/Charts/donut-arc';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import {formatModelName} from '~/data/format/model-name';
import {chartFocusRing, opacityTransition} from '~/styles/class-names';

export type DonutProps = {
  /** Model id to token count for one event; null or empty means no breakdown. */
  data: null | Record<string, number>;
  emptyReason?: string;
  emptyTitle?: string;
  formatValue?: (value: number) => string;
  /** Accessible name for the chart. */
  label?: string;
  locale?: string;
  totalCaption?: string;
};

const OUTER_RADIUS = 70;
const INNER_RADIUS = 46;
const MID_RADIUS = (OUTER_RADIUS + INNER_RADIUS) / 2;
const VIEW_BOX_SIZE = 160;
const CENTER = VIEW_BOX_SIZE / 2;
/**
 * Five named models maximum plus "other", so the ring never exceeds six
 * segments (DESIGN-SPEC 6.1). `groupTailSeries`'s `limit` is the total
 * segment cap, named keys plus "other", not a named-only cap.
 */
const MAX_SEGMENTS = 6;
const PAD_ANGLE = 0.02;

type HoveredSegment = {
  content: TooltipContent;
  key: string;
  x: number;
  y: number;
};

const labelForKey = (key: string): string =>
  key === OTHER_SERIES_KEY ? 'Other' : formatModelName(key);

const formatShare = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * Model-mix donut for one event (DESIGN-SPEC 6.1): part-to-whole, the only
 * job a donut is allowed. Ring geometry lives in donut-arc.ts; this
 * component is presentational. The legend follows the kit's rule (two or
 * more series, none for one, the title names it), but the ring itself
 * renders correctly even at one segment (a full ring, not a hollow chart);
 * choosing SegmentedBar over Donut for an exactly-one-model event is a
 * composition-layer decision made by this chart's caller.
 */
const Donut: FC<DonutProps> = ({
  data,
  emptyReason = 'This event was reconstructed from the backfill, which records total cost but not which models did the work.',
  emptyTitle = 'No model breakdown',
  formatValue,
  label = 'Tokens by model',
  locale,
  totalCaption = 'tokens',
}) => {
  const [hovered, setHovered] = useState<HoveredSegment>();

  const formatNumber =
    formatValue ?? ((value: number) => formatCompactNumber(value, locale));

  const total =
    data === null ? 0 : (
      Object.values(data).reduce((sum, value) => sum + Math.max(0, value), 0)
    );

  if (data === null || total <= 0) {
    return <ChartEmpty reason={emptyReason} title={emptyTitle} />;
  }

  const grouped = groupTailSeries([data], MAX_SEGMENTS);
  const colorMap = buildSeriesColorMap(grouped.seriesKeys);
  const row = grouped.rows[0] ?? {};
  const arcs = donutSegments(
    grouped.seriesKeys.map((key) => ({key, value: row[key] ?? 0})),
    PAD_ANGLE
  );
  const hasLegend = grouped.seriesKeys.length >= 2;

  const showSegment = (key: string, midAngle: number): void => {
    const value = row[key] ?? 0;
    const share = value / total;

    setHovered({
      content: {
        rows: [
          {label: 'tokens', value: formatNumber(value)},
          {label: 'share', value: formatShare(share)},
        ],
        title: labelForKey(key),
      },
      key,
      x: CENTER + MID_RADIUS * Math.sin(midAngle),
      y: CENTER - MID_RADIUS * Math.cos(midAngle),
    });
  };

  const clearSegment = (): void => setHovered(undefined);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg
          aria-label={label}
          className="size-32 shrink-0 sm:size-40"
          role="img"
          viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
        >
          <g transform={`translate(${CENTER} ${CENTER})`}>
            {/* A zero-value key mixed with positive ones (distinct from the
                null/all-zero empty state above) produces a zero-sweep arc;
                skip it rather than rendering an invisible, still-focusable
                hit target. */}
            {arcs
              .filter((arc) => arc.share > 0)
              .map((arc) => {
                const value = row[arc.key] ?? 0;
                const midAngle = (arc.startAngle + arc.endAngle) / 2;

                return (
                  <path
                    key={arc.key}
                    aria-label={`${labelForKey(arc.key)}: ${formatNumber(value)}, ${formatShare(arc.share)}`}
                    className={twJoin(
                      colorMap[arc.key].fillClassName,
                      'focus:outline-none',
                      chartFocusRing,
                      opacityTransition,
                      hovered?.key === arc.key && 'opacity-80'
                    )}
                    d={donutArcPath({
                      endAngle: arc.endAngle,
                      innerRadius: INNER_RADIUS,
                      outerRadius: OUTER_RADIUS,
                      startAngle: arc.startAngle,
                    })}
                    onBlur={clearSegment}
                    onFocus={() => showSegment(arc.key, midAngle)}
                    onMouseEnter={() => showSegment(arc.key, midAngle)}
                    onMouseLeave={clearSegment}
                    role="graphics-symbol"
                    tabIndex={0}
                  />
                );
              })}
          </g>
          <text
            className="fill-fg text-metric-sm font-mono tabular-nums"
            textAnchor="middle"
            x={CENTER}
            y={CENTER - 2}
          >
            {formatNumber(total)}
          </text>
          <text
            className="fill-fg-mute text-label"
            textAnchor="middle"
            x={CENTER}
            y={CENTER + 18}
          >
            {totalCaption}
          </text>
        </svg>
        {hovered && (
          <ChartTooltip {...hovered.content} x={hovered.x} y={hovered.y} />
        )}
      </div>
      {hasLegend && (
        <ul className="flex flex-col gap-1.5">
          {grouped.seriesKeys.map((key) => {
            const value = row[key] ?? 0;
            const share = value / total;

            return (
              <li
                key={key}
                className="text-label text-fg-dim flex items-center gap-1.5"
              >
                <span
                  aria-hidden={true}
                  className={twJoin(
                    'size-2.5 rounded-xs',
                    colorMap[key].swatchClassName
                  )}
                />
                <span className="flex-1">{labelForKey(key)}</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(value)}
                </span>
                <span className="font-mono tabular-nums">
                  {formatShare(share)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="sr-only" data-testid="donut-accessible-summary">
        {grouped.seriesKeys.map((key) => {
          const value = row[key] ?? 0;
          const share = value / total;

          return (
            <li key={key}>
              {labelForKey(key)}: {formatNumber(value)} tokens,{' '}
              {formatShare(share)}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Donut;
