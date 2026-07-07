import type {FC, KeyboardEvent, MouseEvent} from 'react';
import {useMemo, useState} from 'react';
import {twJoin} from 'tailwind-merge';
import EmptyState from '~/components/EmptyState';
import ExpandedDetail from '~/components/Sections/CostTable/ExpandedDetail';
import {
  costEntryAnchorId,
  formatDollarsCell,
  formatDuration,
  formatTokens,
  NO_DATA_LABEL,
  sumBuckets,
} from '~/components/Sections/CostTable/format';
import Skeleton from '~/components/Skeleton';
import {formatLabel} from '~/data/format/labels';
import type {CostEntry, SessionSummary} from '~/data/schemas/api';
import {useCollapse} from '~/hooks/useCollapse';

const COLUMN_COUNT = 8;

/** Hand-coded chevron (DESIGN.md: stroke-based, 1.5px, round caps), rotates
 * to point down when the row is expanded. */
const ExpandIcon: FC<{expanded: boolean}> = ({expanded}) => (
  <svg
    aria-hidden={true}
    className={twJoin(
      'transition-transform duration-150 motion-reduce:transition-none',
      expanded && 'rotate-90'
    )}
    fill="none"
    height={14}
    viewBox="0 0 24 24"
    width={14}
  >
    <path
      d="M9 6l6 6-6 6"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
    />
  </svg>
);

/** Neutral placeholder for a column that does not apply to this row (a slug
 * row has no id, no status). */
const NOT_APPLICABLE = '-';

const partialBadgeClass =
  'border-warn-2 text-warn-soft ml-2 inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase';

type CostView = 'plans' | 'specs';

const isSpec = (entry: CostEntry): boolean => entry.entryType === 'spec';

/** Slug (pre-ledger) plans and ledger plans both count as plans. */
const isPlan = (entry: CostEntry): boolean =>
  entry.entryType === 'plan' || entry.entryType === 'plan-slug';

/** Newest first (feedback): sortAt is an ISO instant, so a lexical compare is
 * chronological; reversed for descending. */
const byNewestFirst = (entries: CostEntry[]): CostEntry[] =>
  entries.toSorted((a, b) => b.sortAt.localeCompare(a.sortAt));

export type CostTableProps = {
  /** Section 6.3 rows across both specs and plans; split and sorted here. */
  entries: CostEntry[];
  /** Navigates to the Sessions tab, targeting one session (feedback). */
  onViewSession?: (sessionId: string) => void;
  /** SPEC 6.3 / PLAN section 3 client-side join target: `SessionSummary[]`
   * from `/api/activity`. Undefined while that resource has not resolved
   * yet; the expanded-row session detail shows a skeleton until then. */
  sessions?: SessionSummary[];
};

const headerCellClass =
  'text-fg-mute px-3 py-2 text-left font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const cellClass = 'text-fg-dim px-3 py-2 text-sm';

const TableHead: FC = () => (
  <thead>
    <tr className="bg-bg-elev-2">
      <th className={headerCellClass}>
        <span className="sr-only">Expand</span>
      </th>
      <th className={headerCellClass}>ID</th>
      <th className={headerCellClass}>Title</th>
      <th className={headerCellClass}>Status</th>
      <th className={headerCellClass}>Total tokens</th>
      <th className={twJoin(headerCellClass, 'hidden md:table-cell')}>
        Output tokens
      </th>
      <th className={headerCellClass}>Cost $</th>
      <th className={twJoin(headerCellClass, 'hidden md:table-cell')}>Time</th>
    </tr>
  </thead>
);

const CostRow: FC<{
  entry: CostEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onViewSession?: (sessionId: string) => void;
  sessionsById?: Map<string, SessionSummary>;
}> = ({entry, isExpanded, onToggle, onViewSession, sessionsById}) => {
  const rowLabel = entry.id ?? entry.title;
  const detailId = `cost-row-detail-${entry.key}`;
  const {expanded, mounted} = useCollapse(isExpanded);

  // The whole row toggles for mouse users; the chevron is the accessible
  // control keyboard/AT users operate. The chevron stops propagation so a
  // click on it does not also fire the row handler (a double toggle).
  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onToggle();
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <>
      <tr
        className="border-border-soft hover:bg-bg-elev/60 cursor-pointer border-t"
        id={costEntryAnchorId(entry.key)}
        onClick={onToggle}
        onKeyDown={handleRowKeyDown}
      >
        <td className={cellClass}>
          <button
            aria-controls={detailId}
            aria-expanded={isExpanded}
            className="text-fg-mute hover:text-fg focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={handleButtonClick}
            type="button"
          >
            <ExpandIcon expanded={isExpanded} />
            <span className="sr-only">
              {isExpanded ? 'Collapse' : 'Expand'} {rowLabel}
            </span>
          </button>
        </td>
        <td className={twJoin(cellClass, 'whitespace-nowrap')}>
          {entry.id ?? NOT_APPLICABLE}
        </td>
        <td className={cellClass}>{entry.title}</td>
        <td className={cellClass}>
          {entry.status === null ? NOT_APPLICABLE : formatLabel(entry.status)}
          {entry.partial && <span className={partialBadgeClass}>Partial</span>}
        </td>
        <td className={cellClass}>
          {formatTokens(sumBuckets(entry.totals.buckets))}
        </td>
        <td className={twJoin(cellClass, 'hidden md:table-cell')}>
          {formatTokens(entry.totals.buckets.output)}
        </td>
        <td className={cellClass} data-testid={`recorded-dollars-${entry.key}`}>
          {formatDollarsCell(entry.totals.recordedDollars)}
        </td>
        <td className={twJoin(cellClass, 'hidden md:table-cell')}>
          {formatDuration(entry.totals.durationSeconds)}
        </td>
      </tr>
      {mounted && (
        <tr className="border-border-soft border-t" id={detailId}>
          <td className="p-0" colSpan={COLUMN_COUNT} data-testid={detailId}>
            <div
              className={twJoin(
                'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}
            >
              <div className="overflow-hidden">
                <div className="bg-bg-elev p-3">
                  <ExpandedDetail
                    entry={entry}
                    onViewSession={onViewSession}
                    sessionsById={sessionsById}
                  />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const toggleButtonClass = (active: boolean): string =>
  twJoin(
    'focus-visible:outline-accent rounded-sm px-3 py-1.5 font-mono text-xs tracking-[0.15em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none',
    active ?
      'bg-accent/15 text-accent border-accent-2 border'
    : 'text-fg-dim hover:text-fg border border-transparent'
  );

const ViewToggle: FC<{
  onSelect: (view: CostView) => void;
  planCount: number;
  specCount: number;
  view: CostView;
}> = ({onSelect, planCount, specCount, view}) => (
  <div
    aria-label="Show specs or plans"
    className="border-border bg-bg-elev-2 inline-flex gap-1 self-start rounded-md border p-1"
    role="group"
  >
    <button
      aria-pressed={view === 'specs'}
      className={toggleButtonClass(view === 'specs')}
      onClick={() => onSelect('specs')}
      type="button"
    >
      Specs ({specCount})
    </button>
    <button
      aria-pressed={view === 'plans'}
      className={toggleButtonClass(view === 'plans')}
      onClick={() => onSelect('plans')}
      type="button"
    >
      Plans ({planCount})
    </button>
  </div>
);

/**
 * SPEC 6.3: the specs & plans cost table, split into two tables with an
 * in-place toggle (feedback). Presentational only, receives its already-fetched
 * data as props; both tables sort newest-first and share one lifted session
 * lookup (the expanded-row join is built once, not per row).
 */
const CostTable: FC<CostTableProps> = ({entries, onViewSession, sessions}) => {
  const [view, setView] = useState<CostView>('specs');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const specs = useMemo(() => byNewestFirst(entries.filter(isSpec)), [entries]);
  const plans = useMemo(() => byNewestFirst(entries.filter(isPlan)), [entries]);
  const sessionsById = useMemo(
    () =>
      sessions &&
      new Map(sessions.map((session) => [session.sessionId, session])),
    [sessions]
  );

  if (entries.length === 0) {
    return (
      <EmptyState
        description="Cost accrues once a spec or plan phase completes with recorded telemetry. A fresh GAIA project has none yet."
        title="No spec or plan cost yet"
      />
    );
  }

  const toggleKey = (key: string): void => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const activeEntries = view === 'specs' ? specs : plans;
  const hasMissingCost = activeEntries.some(
    (entry) => entry.totals.recordedDollars === null
  );

  return (
    <div className="flex flex-col gap-3">
      <ViewToggle
        onSelect={setView}
        planCount={plans.length}
        specCount={specs.length}
        view={view}
      />
      {hasMissingCost && (
        <p className="text-fg-mute text-xs">
          A &quot;{NO_DATA_LABEL}&quot; under Cost or Time means the ledger
          recorded no figure for that row, never a zero.
        </p>
      )}
      {activeEntries.length === 0 ?
        <EmptyState
          description={`No ${view} with recorded cost yet.`}
          title={`No ${view} yet`}
        />
      : <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <TableHead />
            <tbody>
              {activeEntries.map((entry) => (
                <CostRow
                  key={entry.key}
                  entry={entry}
                  isExpanded={expandedKeys.has(entry.key)}
                  onToggle={() => toggleKey(entry.key)}
                  onViewSession={onViewSession}
                  sessionsById={sessionsById}
                />
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
};

export default CostTable;

const SKELETON_ROW_KEYS = ['row-1', 'row-2', 'row-3'];

/** Pixel-matching loading placeholder for AsyncSection's `skeleton` prop
 * (skeleton-loaders skill): same chrome and column widths as the real
 * table, header labels reused verbatim (static text), row values shimmered
 * (dynamic). */
export const CostTableSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className="flex flex-col gap-3"
    data-testid="cost-table-skeleton"
  >
    <Skeleton className="h-9 w-48" />
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <TableHead />
        <tbody>
          {SKELETON_ROW_KEYS.map((key) => (
            <tr key={key} className="border-border-soft border-t">
              <td className={cellClass}>
                <Skeleton className="inline-block size-3.5" />
              </td>
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-16" />
              </td>
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-48" />
              </td>
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-16" />
              </td>
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-12" />
              </td>
              <td className={twJoin(cellClass, 'hidden md:table-cell')}>
                <Skeleton className="inline-block h-4 w-12" />
              </td>
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-14" />
              </td>
              <td className={twJoin(cellClass, 'hidden md:table-cell')}>
                <Skeleton className="inline-block h-4 w-10" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
