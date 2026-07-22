import type {FC} from 'react';
import ChartEmpty from '~/components/ChartEmpty';
import Gauge from '~/components/Charts/Gauge';
import type {AuditBlockModel} from '~/components/Sections/Work/EventDetail/detail-model';
import {auditFigures} from '~/components/Sections/Work/EventDetail/detail-model';
import MetricStrip from '~/components/Sections/Work/EventDetail/MetricStrip';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import {formatLabel} from '~/data/format/labels';
import {resolveLensName} from '~/data/format/lenses';
import {formatDollars} from '~/data/format/units';

/**
 * Carried forward verbatim from v1, where it was correct and load-bearing:
 * the audit is a strict subset of its phase and its figures are never summed
 * into any phase, entry, or grand total.
 */
const CAVEAT =
  'A subset of this phase, shown for detail and never added to any total.';

const EMPTY_TITLE = 'No adversarial audit';

/**
 * `Gauge`'s own default copy is close but not the DESIGN-SPEC 7.4 wording,
 * and it attributes a null audit cost to the enclosing phase. Both branches
 * are named here so each says the true thing.
 */
const gaugeEmptyReason = ({audit}: AuditBlockModel): string =>
  audit.dollars === null ?
    'This audit recorded no cost, so its share of the phase cannot be computed.'
  : `The enclosing phase recorded no cost, so the audit's share of it cannot be computed. The audit itself cost ${formatDollars(audit.dollars)}.`;

const AuditBlock: FC<{block: AuditBlockModel}> = ({block}) => {
  const phaseName = formatLabel(block.phaseKind);

  return (
    <PanelSection>
      <div className="flex flex-col gap-1">
        <h3 className="text-title text-fg">Adversarial audit</h3>
        <p className="text-label text-fg-dim">{phaseName} phase</p>
        <p className="text-label text-fg-mute max-w-prose">{CAVEAT}</p>
      </div>
      <MetricStrip figures={auditFigures(block.audit)} />
      <Gauge
        emptyReason={gaugeEmptyReason(block)}
        formatValue={formatDollars}
        max={block.phaseDollars}
        maxLabel={`${phaseName.toLowerCase()} phase`}
        value={block.audit.dollars}
      />
      {block.audit.lenses.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="lens-list">
          {block.audit.lenses.map((lens) => (
            <li
              key={lens}
              className="border-border-soft text-label text-fg-dim rounded-sm border px-2 py-0.5"
            >
              {resolveLensName(lens, block.phaseKind)}
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
};

type Props = {
  blocks: AuditBlockModel[];
  entryType: 'plan' | 'spec';
};

/**
 * The adversarial audit section (DESIGN-SPEC 5.5), present on spec and plan
 * events only.
 *
 * One block per audit-carrying phase, in phase order, each naming its own
 * phase so two blocks on one entry stay distinguishable, and each with its
 * own figures: two audits are never merged into one set of numbers.
 *
 * When no phase carries an audit the section renders the explicit "No
 * adversarial audit" state rather than disappearing. Audits cover roughly
 * half of all specs and plans, so silence on that many events reads as a bug;
 * this is the single most common path through this section.
 *
 * The v1 `border-l-2 pl-3` container is gone. Each block is a `PanelSection`
 * separated by hairlines like every other section; a side stripe is banned.
 */
const AuditSection: FC<Props> = ({blocks, entryType}) =>
  blocks.length === 0 ?
    <PanelSection>
      <ChartEmpty
        reason={`This ${entryType} ran without an adversarial audit pass. When one runs, its cost, elapsed time, and the lenses it applied appear here.`}
        title={EMPTY_TITLE}
      />
    </PanelSection>
  : <>
      {blocks.map((block) => (
        <AuditBlock key={block.phaseKind} block={block} />
      ))}
    </>;

export default AuditSection;
