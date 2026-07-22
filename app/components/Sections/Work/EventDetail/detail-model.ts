import {
  groupTailSeries,
  OTHER_SERIES_KEY,
} from '~/components/Charts/chart-palette';
import type {HorizontalBarDatum} from '~/components/Charts/HorizontalBars';
import type {SegmentedBarValues} from '~/components/Charts/SegmentedBar';
import {mergeScalarMaps} from '~/components/Sections/Work/event-meta';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {formatLabel} from '~/data/format/labels';
import type {AdversarialAudit, PhaseRollup} from '~/data/schemas/api';

/**
 * Every derivation the detail panel needs, as pure functions with their own
 * tests (DESIGN-SPEC 5.4). The components in this folder stay presentational:
 * section membership, the merged scalar maps, the audit blocks, and the phase
 * measures are all decided here so each one can be asserted directly.
 */

export type DetailSections = {
  /** The adversarial audit block; spec and plan entries only. */
  auditBlock: boolean;
  /** Model-mix donut and agent-type bars; everything but an ad-hoc review. */
  modelAndAgentCharts: boolean;
  /** The two phase segmented bars; spec and plan entries only. */
  phaseBars: boolean;
  /** The run id row; command events only. */
  runIdRow: boolean;
};

/**
 * DESIGN-SPEC 5.4's table, decided by the source kind rather than by the
 * event type. The table's nine columns collapse exactly onto the three source
 * shapes, and the source shape is what decides whether a field exists at all:
 * `adHocReviewSchema` carries no `byModel` and no `byAgentType`, which is why
 * a review gets the reduced composition instead of two permanently empty
 * charts. If the contract ever gains those fields, this one predicate changes
 * and the reviews adopt both chart sections with no other edit.
 */
export const detailSections = (event: GaiaEvent): DetailSections => ({
  auditBlock: event.source.kind === 'entry',
  modelAndAgentCharts: event.source.kind !== 'review',
  phaseBars: event.source.kind === 'entry',
  runIdRow: event.source.kind === 'command',
});

/**
 * The three values the metric strip reports, and the only three (DESIGN-SPEC
 * 5.2, C-21). Bundling them in one record is what makes "exactly three, in
 * this order" structural rather than a convention the next edit can break.
 */
export type MetricFigures = {
  dollars: null | number;
  durationSeconds: null | number;
  totalTokens: number;
};

export const eventFigures = (event: GaiaEvent): MetricFigures => ({
  dollars: event.recordedDollars,
  durationSeconds: event.durationSeconds,
  totalTokens: event.totalTokens,
});

/** The audit's own three figures; `elapsedSeconds` is never null upstream. */
export const auditFigures = (audit: AdversarialAudit): MetricFigures => ({
  dollars: audit.dollars,
  durationSeconds: audit.elapsedSeconds,
  totalTokens: audit.totalTokens,
});

/** The phases of a cost entry; every other source shape has none. */
export const entryPhases = (event: GaiaEvent): PhaseRollup[] =>
  event.source.kind === 'entry' ? event.source.value.phases : [];

/**
 * `CostEntry` carries `byModel` per phase and `CommandEvent` carries one flat
 * map, so the two reach the donut through different paths. `null` means no
 * breakdown was recorded (the backfill's common path), which is distinct from
 * an empty map; the chart tells them apart in its own empty copy.
 */
export const modelMix = (event: GaiaEvent): null | Record<string, number> => {
  const {source} = event;

  if (source.kind === 'entry') {
    return mergeScalarMaps(source.value.phases, 'byModel');
  }

  return source.kind === 'command' ? source.value.byModel : null;
};

export const agentMix = (event: GaiaEvent): null | Record<string, number> => {
  const {source} = event;

  if (source.kind === 'entry') {
    return mergeScalarMaps(source.value.phases, 'byAgentType');
  }

  return source.kind === 'command' ? source.value.byAgentType : null;
};

export type SingleSeries = {key: string; value: number};

/**
 * The lone series when a breakdown names exactly one with a positive value
 * (DESIGN-SPEC 6.1, degenerate cases). A one-slice donut is a filled circle
 * that encodes nothing, so the caller renders a single bar instead.
 *
 * Zero-valued keys are ignored: a map of one real model plus a recorded zero
 * still describes one model.
 */
export const singleSeries = (
  data: null | Record<string, number>
): null | SingleSeries => {
  if (data === null) {
    return null;
  }

  const positive = Object.entries(data).filter(([, value]) => value > 0);
  const [first] = positive;

  return positive.length === 1 ? {key: first[0], value: first[1]} : null;
};

/**
 * Agent-type rows for `HorizontalBars`, ordered by total descending with ties
 * alphabetical and the tail folded into "other" (DESIGN-SPEC 6.5), which is
 * what `groupTailSeries` already produces.
 *
 * The per-key totals are read through a `Map`, never `row[key]`: the keys are
 * agent-type names read straight from `../gaia`, so a key colliding with an
 * `Object.prototype` member would otherwise resolve to an inherited function
 * that `?? 0` does not catch.
 */
export const agentBarRows = (
  data: Record<string, number>
): HorizontalBarDatum[] => {
  const grouped = groupTailSeries([data]);
  const totals = new Map(Object.entries(grouped.rows[0] ?? {}));

  return grouped.seriesKeys.map((key) => ({
    label: key === OTHER_SERIES_KEY ? 'Other' : formatLabel(key),
    value: totals.get(key) ?? 0,
  }));
};

export type AuditBlockModel = {
  audit: AdversarialAudit;
  /** The enclosing phase's dollars: the whole the audit share is taken of. */
  phaseDollars: null | number;
  /** Named in every block, so two blocks on one entry stay distinguishable. */
  phaseKind: string;
};

/**
 * One block per audit-carrying phase, in phase order (task 5). An entry can
 * carry an audit on more than one phase and their figures are never merged:
 * each audit is a subset of its own phase and of no other.
 */
export const auditBlocks = (event: GaiaEvent): AuditBlockModel[] =>
  entryPhases(event).flatMap((phase) =>
    phase.audit === undefined ?
      []
    : [
        {
          audit: phase.audit,
          phaseDollars: phase.recordedDollars,
          phaseKind: phase.kind,
        },
      ]
  );

/**
 * The header's intensity badge (DESIGN-SPEC 5.4 row 6a): spec events only,
 * and only when a phase carries an audit that recorded one. Plan audits carry
 * `intensity: null` and render no badge.
 */
export const auditIntensity = (event: GaiaEvent): null | string => {
  if (event.type !== 'spec') {
    return null;
  }

  const withIntensity = auditBlocks(event).find(
    (block) => block.audit.intensity !== null
  );

  return withIntensity?.audit.intensity ?? null;
};

type PhaseKey = keyof SegmentedBarValues;

/**
 * Matches `phase.kind` against a literal rather than indexing an object by
 * it. `kind` is `z.string()` upstream ("unknown kinds pass through
 * verbatim"), so it is untrusted; a comparison has no prototype chain to
 * walk. The cost of that safety is that a phase whose kind is none of the
 * three named ones is not plotted, which matches `SegmentedBar`'s own fixed
 * three-phase contract (DESIGN-SPEC 6.4).
 */
const findPhase = (
  phases: PhaseRollup[],
  kind: PhaseKey
): PhaseRollup | undefined => phases.find((phase) => phase.kind === kind);

export const phaseCostValues = (phases: PhaseRollup[]): SegmentedBarValues => ({
  execute: findPhase(phases, 'execute')?.recordedDollars ?? null,
  plan: findPhase(phases, 'plan')?.recordedDollars ?? null,
  spec: findPhase(phases, 'spec')?.recordedDollars ?? null,
});

export const phaseElapsedValues = (
  phases: PhaseRollup[]
): SegmentedBarValues => ({
  execute: findPhase(phases, 'execute')?.durationSeconds ?? null,
  plan: findPhase(phases, 'plan')?.durationSeconds ?? null,
  spec: findPhase(phases, 'spec')?.durationSeconds ?? null,
});

export type SessionRef = {logFound: boolean; sessionId: string};

/**
 * One row per `entry.sessions[]`, or the single session a command or review
 * ran in (DESIGN-SPEC 5.4 row 9). Neither `commandEventSchema` nor
 * `adHocReviewSchema` carries a `logFound` flag, so their one row is treated
 * as found: it renders the skeleton while `/api/activity` is in flight and
 * falls back to the raw id if the join misses, which is exactly the
 * degradation those two shapes need.
 */
export const linkedSessionRefs = (event: GaiaEvent): SessionRef[] => {
  const {source} = event;

  if (source.kind === 'entry') {
    return source.value.sessions.map(({logFound, sessionId}) => ({
      logFound,
      sessionId,
    }));
  }

  return [{logFound: true, sessionId: source.value.sessionId}];
};

/** Command events only (DESIGN-SPEC C-28); null when the row omitted it. */
export const runIdOf = (event: GaiaEvent): null | string =>
  event.source.kind === 'command' ? event.source.value.runId : null;
