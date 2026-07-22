import type {FC} from 'react';
import ChartEmpty from '~/components/ChartEmpty';
import SegmentedBar from '~/components/Charts/SegmentedBar';
import {
  phaseCostValues,
  phaseElapsedValues,
} from '~/components/Sections/Work/EventDetail/detail-model';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import {formatDollars, formatDuration} from '~/data/format/units';
import type {PhaseRollup} from '~/data/schemas/api';

const NO_PHASES_TITLE = 'No phase breakdown';
const NO_PHASES_REASON =
  'This entry has no recorded phases. Cost and elapsed time are reported at the entry level only.';

type Props = {
  phases: PhaseRollup[];
};

/**
 * Phase composition for a spec or plan entry (DESIGN-SPEC 5.4 row 5).
 *
 * **Two bars, never one.** Cost share and elapsed share are different scales;
 * one bar carrying both would be a dual-axis chart, which is prohibited
 * without exception. Each gets its own bar and its own legend.
 *
 * A phase with a null figure is skipped by `segmentShares` and named in the
 * footnote rather than plotted as zero: a missing figure is not a zero.
 */
const PhaseSection: FC<Props> = ({phases}) => (
  <PanelSection heading="Phase breakdown">
    {phases.length === 0 ?
      <ChartEmpty reason={NO_PHASES_REASON} title={NO_PHASES_TITLE} />
    : <>
        <div className="flex flex-col gap-2" data-testid="phase-cost-bar">
          <p className="text-label text-fg-dim">Cost share</p>
          <SegmentedBar
            emptyReason="No phase on this entry recorded a cost. A missing figure is not a zero."
            emptyTitle="No recorded cost"
            formatValue={formatDollars}
            label="Cost by phase"
            values={phaseCostValues(phases)}
          />
        </div>
        <div className="flex flex-col gap-2" data-testid="phase-elapsed-bar">
          <p className="text-label text-fg-dim">Elapsed share</p>
          <SegmentedBar
            emptyMeasureLabel="elapsed time"
            emptyReason="No phase on this entry recorded an elapsed time. A missing figure is not a zero."
            emptyTitle="No recorded elapsed"
            formatValue={formatDuration}
            label="Elapsed by phase"
            values={phaseElapsedValues(phases)}
          />
        </div>
      </>
    }
  </PanelSection>
);

export default PhaseSection;
