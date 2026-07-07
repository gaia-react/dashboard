import type {FC, MouseEvent} from 'react';
import {twJoin} from 'tailwind-merge';
import {
  formatDateTime,
  formatDollarsCell,
  formatDuration,
  formatTokens,
  sessionsTabHref,
} from '~/components/Sections/CostTable/format';
import Skeleton from '~/components/Skeleton';
import {formatLabel} from '~/data/format/labels';
import {formatModelName} from '~/data/format/model-name';
import type {CostEntry, ModelBuckets, SessionSummary} from '~/data/schemas/api';

type Props = {
  entry: CostEntry;
  /** Navigates to the Sessions tab, targeting one session (feedback). */
  onViewSession?: (sessionId: string) => void;
  /** Lifted session lookup (built once in CostTable). Undefined while
   * `/api/activity` has not resolved yet (SPEC 6.3): the session rows below
   * show a skeleton instead of blocking the row expand on it. */
  sessionsById?: Map<string, SessionSummary>;
};

const headingClass =
  'text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const subCellClass = 'text-fg-dim px-2 py-1 text-xs align-top';
/** Fixed-width timestamp column so the commands to its right line up. */
const timestampCellClass =
  'text-fg-mute w-44 shrink-0 px-2 py-1 text-xs align-top font-mono tabular-nums whitespace-nowrap';

const modelTotal = (buckets: ModelBuckets): number =>
  buckets.freshInput +
  buckets.cacheWrite5m +
  buckets.cacheWrite1h +
  buckets.cacheRead +
  buckets.output;

/** Right-aligned numeric cell (feedback): so token/cost/duration figures line
 * up vertically down a column instead of ragging on their text length. */
const numericCellClass = 'text-right font-mono tabular-nums';

/**
 * One CSS grid shared by every phase row (feedback): a fixed 4-track
 * template so the phase-name column is one consistent width and the
 * tokens/cost/elapsed columns occupy identical tracks down every phase,
 * regardless of phase-name length (Spec/Plan/Execute). `max-content` sizes
 * each track to its widest cell across ALL phases, not just its own row,
 * which independent per-row flex containers can't do. `PhaseRow` returns a
 * fragment of grid items rather than its own container, so its children
 * become direct children of this grid (fragments add no DOM wrapper).
 *
 * A 5th `minmax(0,1fr)` track soaks up whatever width the 4 `max-content`
 * columns don't use. The summary row never places anything there, so it
 * stays exactly as compact as before; the divider/breakdown below span all
 * 5 columns (feedback), so THEY reach the panel's actual right edge instead
 * of being squeezed to the summary row's (much narrower) intrinsic width,
 * which is what "span 4" over pure `max-content` tracks did: a spanning
 * item's width is the sum of the tracks it spans, not the container's.
 */
const phasesGridClass =
  'grid grid-cols-[max-content_repeat(3,max-content)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-xs';
/** Full-width divider opening each phase row; a border on the 4 individual
 * cells would show gaps where `gap-x-4` falls, this spans them instead. */
const phaseDividerClass = 'border-border-soft col-span-5 border-t';

/** One breakdown mini-table shared by the per-model and per-agent-type
 * sections (identical shape, different key formatter). */
const BreakdownTable: FC<{
  entries: [string, ModelBuckets][];
  formatKey: (key: string) => string;
  label: string;
}> = ({entries, formatKey, label}) => (
  <table className="w-full border-collapse">
    <caption className={twJoin(headingClass, 'text-left')}>{label}</caption>
    <tbody>
      {entries.map(([key, buckets]) => (
        <tr key={key} className="border-border-soft border-t">
          <td className={subCellClass}>{formatKey(key)}</td>
          <td className={twJoin(subCellClass, numericCellClass)}>
            {formatTokens(modelTotal(buckets))}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * One phase's grid cells (feedback: phase-name/tokens/cost/elapsed line up
 * across every phase). Returns a fragment, not its own container, so its
 * cells land as direct children of the shared `phasesGridClass` grid in
 * `ExpandedDetail` and share that grid's column tracks.
 */
const PhaseRow: FC<{phase: CostEntry['phases'][number]}> = ({phase}) => (
  <>
    <div className={phaseDividerClass} />
    <span className="text-fg font-medium">{formatLabel(phase.kind)}</span>
    <span className={twJoin('text-fg-dim', numericCellClass)}>
      {formatTokens(phase.buckets.output)} output tokens
    </span>
    <span className={twJoin('text-fg-dim', numericCellClass)}>
      {formatDollarsCell(phase.recordedDollars)}
    </span>
    <span className={twJoin('text-fg-dim', numericCellClass)}>
      {formatDuration(phase.durationSeconds)}
    </span>
    {/* Native rows carry model and/or agent-type breakdowns; backfill rows
        carry neither (SPEC 4.1). Each renders independently of the other. */}
    {(phase.byModel !== null || phase.byAgentType !== null) && (
      <div className="col-span-5 grid gap-3 sm:grid-cols-2">
        {phase.byModel !== null && (
          <BreakdownTable
            entries={Object.entries(phase.byModel)}
            formatKey={formatModelName}
            label="By model"
          />
        )}
        {phase.byAgentType !== null && (
          <BreakdownTable
            entries={Object.entries(phase.byAgentType)}
            formatKey={formatLabel}
            label="By agent type"
          />
        )}
      </div>
    )}
  </>
);

const logMissingBadgeClass =
  'border-warn-2 text-warn-soft ml-2 inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-widest uppercase';
const jumpLinkClass =
  'text-secondary-soft hover:text-secondary focus-visible:outline-accent ml-2 rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2';

/* react-doctor false positive (no-aria-hidden-on-focusable): the rule flags
 * this `<tr>` as if it hid a focusable node, but neither the row nor its
 * `Skeleton` children (plain `aria-hidden` divs, no tabIndex/interactive
 * role) are focusable, so there is nothing for a keyboard user to land on. */
const SessionSkeletonRow: FC = () => (
  <tr aria-hidden={true} data-testid="session-detail-skeleton">
    <td className={timestampCellClass}>
      <Skeleton className="inline-block h-4 w-32" />
    </td>
    <td className={subCellClass}>
      <Skeleton className="inline-block h-4 w-40" />
    </td>
  </tr>
);

const SessionRow: FC<{
  linked: CostEntry['sessions'][number];
  onViewSession?: (sessionId: string) => void;
  session: SessionSummary | undefined;
}> = ({linked, onViewSession, session}) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onViewSession) {
      event.preventDefault();
      onViewSession(linked.sessionId);
    }
  };

  if (!session) {
    // No resolved activity row: either the log is missing, or the join has
    // not landed yet / dropped the id. Fall back to the raw session id.
    return (
      <tr className="border-border-soft border-t">
        <td className={timestampCellClass}>-</td>
        <td className={subCellClass}>
          {linked.sessionId}
          {!linked.logFound && (
            <span className={logMissingBadgeClass}>Log missing</span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-border-soft border-t">
      <td className={timestampCellClass}>
        {formatDateTime(session.startedAt)}
      </td>
      <td className={subCellClass}>
        <span className="text-fg-dim">
          {session.title ?? session.sessionId}
        </span>
        <span className="text-fg-mute ml-2">
          {formatDuration(session.durationSeconds)}
        </span>
        <a
          className={jumpLinkClass}
          href={sessionsTabHref(session.sessionId)}
          onClick={handleClick}
        >
          View in sessions
        </a>
      </td>
    </tr>
  );
};

/**
 * Expanded-row detail (SPEC 6.3): per-phase table (native phases carry
 * model + agent-type breakdowns, backfill phases carry neither) and linked
 * sessions, client-side joined to `SessionSummary` (PLAN section 3). Labels
 * are display-formatted (phase kinds and agent types sentence-cased, model
 * ids humanized).
 */
const ExpandedDetail: FC<Props> = ({entry, onViewSession, sessionsById}) => (
  <div className="flex flex-col gap-4">
    {entry.phases.length > 0 && (
      <div>
        <p className={headingClass}>Phases</p>
        <div className={phasesGridClass}>
          {entry.phases.map((phase) => (
            <PhaseRow key={`${phase.kind}-${phase.source}`} phase={phase} />
          ))}
        </div>
      </div>
    )}
    {entry.sessions.length > 0 && (
      <div>
        <p className={headingClass}>Sessions</p>
        <table className="w-full border-collapse">
          <tbody>
            {entry.sessions.map((linked) =>
              linked.logFound && !sessionsById ?
                <SessionSkeletonRow key={linked.sessionId} />
              : <SessionRow
                  key={linked.sessionId}
                  linked={linked}
                  onViewSession={onViewSession}
                  session={sessionsById?.get(linked.sessionId)}
                />
            )}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default ExpandedDetail;
