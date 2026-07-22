import type {FC} from 'react';
import ChartEmpty from '~/components/ChartEmpty';
import Donut from '~/components/Charts/Donut';
import HorizontalBars from '~/components/Charts/HorizontalBars';
import {
  agentBarRows,
  singleSeries,
} from '~/components/Sections/Work/EventDetail/detail-model';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import {formatModelName} from '~/data/format/model-name';
import {formatTokens} from '~/data/format/units';

/**
 * `HorizontalBars` renders a fixed-size SVG with no `viewBox`, so it cannot
 * shrink to its container. This is sized for the narrower of the two layouts
 * (the `xl:` two-up column) and scrolls inside its own box at anything
 * narrower. A chart that pushes the page sideways is a layout bug; a chart
 * that scrolls inside its own box is not.
 */
const AGENT_CHART_WIDTH = 420;

/**
 * Stacked at base through `lg`, two-up at `xl:` where the detail pane is wide
 * enough that stacking wastes it (DESIGN-SPEC 5.3). Exported so
 * `EventDetailSkeleton` reserves the identical box.
 */
export const chartGridClass = 'gap-8 xl:grid xl:grid-cols-2 xl:gap-8';

const AGENT_EMPTY_TITLE = 'No agent-type breakdown';
const AGENT_EMPTY_REASON =
  'This event was reconstructed from the backfill, which records total cost but not which agents did the work.';

type SingleSeriesBarProps = {
  label: string;
  value: string;
};

/**
 * The exactly-one-model case (DESIGN-SPEC 6.1, degenerate cases): one segment
 * plus the series name, never a donut, because a one-slice donut is a filled
 * circle that encodes nothing.
 *
 * Rendered here rather than through `SegmentedBar` because that component's
 * contract is the three ordered phases (fixed keys, fixed labels, fixed
 * ordinal ramp, DESIGN-SPEC 6.4) and it takes no arbitrary series. It is not
 * this workstream's to widen, so the bar borrows its visual vocabulary
 * verbatim instead: same height, same radius, same 2px surface gap allowance,
 * same legend row shape.
 */
const SingleSeriesBar: FC<SingleSeriesBarProps> = ({label, value}) => (
  <div className="flex flex-col gap-2" data-testid="single-series-bar">
    <div
      aria-label={`${label}: ${value}, 100%`}
      className="flex h-3 w-full gap-0.5"
      role="img"
    >
      <div
        aria-hidden={true}
        className="bg-accent min-w-1 flex-1 rounded-full"
      />
    </div>
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
      <li className="text-label text-fg-dim flex items-center gap-1.5">
        <span aria-hidden={true} className="bg-accent size-2.5 rounded-xs" />
        <span>{label}</span>
        <span className="font-mono tabular-nums">100%</span>
        <span className="font-mono tabular-nums">{value}</span>
      </li>
    </ul>
  </div>
);

type Props = {
  agentMix: null | Record<string, number>;
  modelMix: null | Record<string, number>;
};

/**
 * The model-mix and agent-type sections (DESIGN-SPEC 5.3). They stack at base
 * through `lg` and share one section as a two-column grid at `xl:`, where the
 * detail pane is wide enough that stacking wastes it.
 *
 * Both render `ChartEmpty` when their source is null or empty rather than
 * disappearing: backfill rows carry no breakdown at all, so an explicit
 * "nothing was recorded" is a statement about this event, where a vanished
 * section would read as a bug. `Donut` owns that branch itself, so its value
 * passes straight through.
 */
const ChartSections: FC<Props> = ({agentMix, modelMix}) => {
  const soleModel = singleSeries(modelMix);
  const agentRows = agentMix === null ? [] : agentBarRows(agentMix);

  return (
    <PanelSection className={chartGridClass}>
      <div className="flex flex-col gap-4" data-testid="model-mix-section">
        <h3 className="text-title text-fg">Model mix</h3>
        {soleModel === null ?
          <Donut data={modelMix} label="Tokens by model" />
        : <SingleSeriesBar
            label={formatModelName(soleModel.key)}
            value={formatTokens(soleModel.value)}
          />
        }
      </div>
      <div className="flex flex-col gap-4" data-testid="agent-type-section">
        <h3 className="text-title text-fg">Agent types</h3>
        {agentRows.length === 0 ?
          <ChartEmpty reason={AGENT_EMPTY_REASON} title={AGENT_EMPTY_TITLE} />
        : <div
            className="w-full overflow-x-auto"
            data-testid="agent-type-scroll"
          >
            <HorizontalBars
              data={agentRows}
              formatValue={formatTokens}
              label="Tokens by agent type"
              width={AGENT_CHART_WIDTH}
            />
          </div>
        }
      </div>
    </PanelSection>
  );
};

export default ChartSections;
