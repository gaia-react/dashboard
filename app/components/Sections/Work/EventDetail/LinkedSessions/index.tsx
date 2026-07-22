import type {FC, MouseEvent} from 'react';
import {twJoin} from 'tailwind-merge';
import ChartEmpty from '~/components/ChartEmpty';
import {sessionsTabHref} from '~/components/Sections/anchor-ids';
import type {SessionRef} from '~/components/Sections/Work/EventDetail/detail-model';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import Skeleton from '~/components/Skeleton';
import {
  formatDateTime,
  formatDuration,
  NO_DATA_LABEL,
} from '~/data/format/units';
import type {SessionSummary} from '~/data/schemas/api';
import {colorTransition, focusRing} from '~/styles/class-names';

const rowClass =
  'border-border-soft flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-b-0';
const stampClass = 'text-label text-fg-mute font-mono tabular-nums';
const titleClass = 'text-body text-fg-dim min-w-0 flex-1 truncate';

/** C-25: C-16's link vocabulary minus the external-link icon, because this is
 * in-app navigation rather than an outbound jump. */
const jumpLinkClass = twJoin(
  'text-accent text-label hover:text-accent-soft active:text-accent-soft rounded-sm underline-offset-2 hover:underline',
  colorTransition,
  focusRing
);

/** C-24. `border-warn-2` is a border and never text: no `-2` variant may
 * carry text on any surface. */
const LogMissingBadge: FC = () => (
  <span className="border-warn-2 text-warn-soft text-label ml-2 inline-block rounded-sm border px-1.5 py-0.5">
    Log missing
  </span>
);

/**
 * Holds the row's exact height while `/api/activity` is still in flight, so
 * the panel paints the moment `/api/costs` lands instead of blocking on the
 * slower resource (DESIGN-SPEC C-23, state L). `aria-hidden` because the
 * placeholders carry no meaning; the enclosing `AsyncSection` announces.
 */
const SessionSkeletonRow: FC = () => (
  <li
    aria-hidden={true}
    className={rowClass}
    data-testid="linked-session-skeleton"
  >
    <Skeleton className="h-4 w-36" />
    <Skeleton className="h-4 w-48" />
  </li>
);

type RowProps = {
  onViewSession?: (sessionId: string) => void;
  reference: SessionRef;
  session: SessionSummary | undefined;
};

const SessionRow: FC<RowProps> = ({onViewSession, reference, session}) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onViewSession) {
      event.preventDefault();
      onViewSession(reference.sessionId);
    }
  };

  // No resolved activity row: either the log is missing, or the join dropped
  // the id. Fall back to the raw session id with no jump link and no error
  // text; the session list simply cannot be joined, which is a degradation
  // rather than a failure of this panel (DESIGN-SPEC C-23, state E).
  if (session === undefined) {
    return (
      <li className={rowClass} data-testid="linked-session-row">
        <span className={stampClass}>{NO_DATA_LABEL}</span>
        <span className={titleClass}>{reference.sessionId}</span>
        {!reference.logFound && <LogMissingBadge />}
      </li>
    );
  }

  return (
    <li className={rowClass} data-testid="linked-session-row">
      <span className={stampClass}>{formatDateTime(session.startedAt)}</span>
      <span className={titleClass}>{session.title ?? session.sessionId}</span>
      <span className={stampClass}>
        {formatDuration(session.durationSeconds)}
      </span>
      <a
        className={jumpLinkClass}
        href={sessionsTabHref(session.sessionId)}
        onClick={handleClick}
      >
        View in sessions
      </a>
      {!reference.logFound && <LogMissingBadge />}
    </li>
  );
};

type Props = {
  onViewSession?: (sessionId: string) => void;
  references: SessionRef[];
  /** Command events only; the artifact link lives in the header instead,
   * because it is identity rather than detail (DESIGN-SPEC 5.6). */
  runId?: null | string;
  sessionsById?: Map<string, SessionSummary>;
};

/**
 * Linked sessions and, for a command event, the run id (DESIGN-SPEC 5.6,
 * C-23 to C-25, C-28).
 *
 * `sessionsById` being `undefined` means `/api/activity` has not resolved
 * yet, which is deliberately distinct from it having resolved without this
 * id: the first renders a skeleton row, the second renders the raw id. That
 * seam is v1's and it is what lets the panel paint on `/api/costs` alone.
 */
const LinkedSessions: FC<Props> = ({
  onViewSession,
  references,
  runId,
  sessionsById,
}) => (
  <PanelSection heading="Linked sessions">
    {runId !== undefined && (
      <dl
        className="flex flex-wrap items-baseline gap-x-3"
        data-testid="run-id-row"
      >
        <dt className="text-label text-fg-dim">Run id</dt>
        <dd className="text-label text-fg-dim font-mono break-all">
          {runId ?? NO_DATA_LABEL}
        </dd>
      </dl>
    )}
    {references.length === 0 ?
      <ChartEmpty
        reason="The ledger recorded this event without a session id, so there is no transcript to link."
        title="No linked sessions"
      />
    : <ul>
        {references.map((reference) =>
          reference.logFound && sessionsById === undefined ?
            <SessionSkeletonRow key={reference.sessionId} />
          : <SessionRow
              key={reference.sessionId}
              onViewSession={onViewSession}
              reference={reference}
              session={sessionsById?.get(reference.sessionId)}
            />
        )}
      </ul>
    }
  </PanelSection>
);

export default LinkedSessions;
