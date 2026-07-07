import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import {
  formatDateTime,
  formatDollarsCell,
  formatDuration,
  formatTokens,
  sessionAnchorId,
} from '~/components/Sections/CostTable/format';
import Skeleton from '~/components/Skeleton';
import type {CostEntry, ModelBuckets, SessionSummary} from '~/data/schemas/api';

type Props = {
  entry: CostEntry;
  /** Undefined while `/api/activity` has not resolved yet (SPEC 6.3): the
   * session rows below show a skeleton instead of blocking the row expand
   * on it. */
  sessions?: SessionSummary[];
};

const headingClass =
  'text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const subCellClass = 'text-fg-dim px-2 py-1 text-xs';

const modelTotal = (buckets: ModelBuckets): number =>
  buckets.freshInput +
  buckets.cacheWrite5m +
  buckets.cacheWrite1h +
  buckets.cacheRead +
  buckets.output;

/** One breakdown mini-table shared by the per-model and per-agent-type
 * sections (identical shape, different key label). */
const BreakdownTable: FC<{
  entries: [string, ModelBuckets][];
  label: string;
}> = ({entries, label}) => (
  <table className="w-full border-collapse">
    <caption className={twJoin(headingClass, 'text-left')}>{label}</caption>
    <tbody>
      {entries.map(([key, buckets]) => (
        <tr key={key} className="border-border-soft border-t">
          <td className={subCellClass}>{key}</td>
          <td className={subCellClass}>{formatTokens(modelTotal(buckets))}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const PhaseRow: FC<{phase: CostEntry['phases'][number]}> = ({phase}) => (
  <div className="border-border-soft border-t py-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="text-fg font-medium">{phase.kind}</span>
      <span className="text-fg-mute">{phase.source}</span>
      <span className="text-fg-dim">
        {formatTokens(phase.buckets.output)} output tokens
      </span>
      <span className="text-fg-dim">
        {formatDollarsCell(phase.recordedDollars)}
      </span>
      <span className="text-fg-dim">
        {formatDuration(phase.durationSeconds)}
      </span>
    </div>
    {/* Native rows show both breakdowns; backfill rows have none, by
        design (SPEC 4.1), so nothing renders rather than an empty note. */}
    {phase.byModel && (
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <BreakdownTable
          entries={Object.entries(phase.byModel)}
          label="By model"
        />
        {phase.byAgentType && (
          <BreakdownTable
            entries={Object.entries(phase.byAgentType)}
            label="By agent type"
          />
        )}
      </div>
    )}
  </div>
);

const SessionSkeletonRow: FC = () => (
  <tr aria-hidden={true} data-testid="session-detail-skeleton">
    <td className={subCellClass}>
      <Skeleton className="inline-block h-4 w-32" />
    </td>
    <td className={subCellClass}>
      <Skeleton className="inline-block h-4 w-20" />
    </td>
  </tr>
);

const SessionRow: FC<{
  linked: CostEntry['sessions'][number];
  session: SessionSummary | undefined;
}> = ({linked, session}) => {
  if (!linked.logFound) {
    return (
      <tr className="border-border-soft border-t">
        <td className={subCellClass}>{linked.sessionId}</td>
        <td className={subCellClass}>
          <span className="border-warn-2 text-warn-soft inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-widest uppercase">
            Log missing
          </span>
        </td>
      </tr>
    );
  }

  if (!session) {
    return (
      <tr className="border-border-soft border-t">
        <td className={subCellClass}>{linked.sessionId}</td>
        <td className={subCellClass} />
      </tr>
    );
  }

  return (
    <tr className="border-border-soft border-t">
      <td className={subCellClass}>
        {session.title ?? session.sessionId}
        <span className="text-fg-mute ml-2">
          {formatDateTime(session.startedAt)}
        </span>
      </td>
      <td className={subCellClass}>
        {formatDuration(session.durationSeconds)}{' '}
        <a
          className="focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          href={`#${sessionAnchorId(session.sessionId)}`}
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
 * sessions, client-side joined to `SessionSummary` (PLAN section 3).
 */
const ExpandedDetail: FC<Props> = ({entry, sessions}) => {
  const sessionsById =
    sessions &&
    new Map(sessions.map((session) => [session.sessionId, session]));

  return (
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
                    session={sessionsById?.get(linked.sessionId)}
                  />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpandedDetail;
