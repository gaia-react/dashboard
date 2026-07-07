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

/** Fixed widths (feedback) so tokens/cost/elapsed line up across every phase
 * row, not just within one. */
const phaseTokensClass = twJoin(numericCellClass, 'inline-block w-20 shrink-0');
const phaseCostClass = twJoin(numericCellClass, 'inline-block w-16 shrink-0');
const phaseElapsedClass = twJoin(
  numericCellClass,
  'inline-block w-16 shrink-0'
);

const PhaseRow: FC<{phase: CostEntry['phases'][number]}> = ({phase}) => (
  <div className="border-border-soft border-t py-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="text-fg font-medium">{formatLabel(phase.kind)}</span>
      <span className="text-fg-dim">
        <span className={phaseTokensClass}>
          {formatTokens(phase.buckets.output)}
        </span>{' '}
        output tokens
      </span>
      <span className={twJoin('text-fg-dim', phaseCostClass)}>
        {formatDollarsCell(phase.recordedDollars)}
      </span>
      <span className={twJoin('text-fg-dim', phaseElapsedClass)}>
        {formatDuration(phase.durationSeconds)}
      </span>
    </div>
    {/* Native rows carry model and/or agent-type breakdowns; backfill rows
        carry neither (SPEC 4.1). Each renders independently of the other. */}
    {(phase.byModel !== null || phase.byAgentType !== null) && (
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
  </div>
);

const logMissingBadgeClass =
  'border-warn-2 text-warn-soft ml-2 inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-widest uppercase';
const jumpLinkClass =
  'text-secondary-soft hover:text-secondary focus-visible:outline-accent ml-2 rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2';

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
        {entry.phases.map((phase) => (
          <PhaseRow key={`${phase.kind}-${phase.source}`} phase={phase} />
        ))}
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
