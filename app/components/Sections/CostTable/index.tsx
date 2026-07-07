import type {FC, KeyboardEvent, MouseEvent, ReactNode} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {twJoin} from 'tailwind-merge';
import EmptyState from '~/components/EmptyState';
import ExpandedDetail from '~/components/Sections/CostTable/ExpandedDetail';
import {
  costEntryAnchorId,
  costViewForEntryType,
  formatDollarsCell,
  formatDuration,
  formatTokens,
  NO_DATA_LABEL,
  sumBuckets,
  sumDurationSeconds,
  sumRecordedDollars,
} from '~/components/Sections/CostTable/format';
import type {
  SortColumn,
  SortDirection,
  SortState,
} from '~/components/Sections/CostTable/sort';
import {
  DEFAULT_SORT,
  nextSortState,
  sortEntries,
} from '~/components/Sections/CostTable/sort';
import Skeleton from '~/components/Skeleton';
import {formatLabel} from '~/data/format/labels';
import type {CostEntry, SessionSummary} from '~/data/schemas/api';
import {useCollapse} from '~/hooks/useCollapse';
import {useQueryParams} from '~/hooks/useQueryParams';

const COLUMN_COUNT = 7;

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

const sortButtonClass =
  'text-fg-mute hover:text-fg focus-visible:outline-accent flex items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2';

const ariaSortFor = (
  sortState: SortState,
  column: SortColumn
): 'ascending' | 'descending' | 'none' => {
  if (sortState.column !== column) {
    return 'none';
  }

  return sortState.direction === 'asc' ? 'ascending' : 'descending';
};

const SortIndicator: FC<{direction: SortDirection}> = ({direction}) => (
  <span aria-hidden={true}>{direction === 'asc' ? '▲' : '▼'}</span>
);

/** One clickable, keyboard-operable column header (feedback: click to sort,
 * toggling ascending/descending). `aria-sort` lives on the `<th>` per the
 * WAI-ARIA sortable-table pattern; the button inside is the actual control. */
const SortableHeaderCell: FC<{
  children: ReactNode;
  className?: string;
  column: SortColumn;
  onSort: (column: SortColumn) => void;
  sortState: SortState;
}> = ({children, className, column, onSort, sortState}) => (
  <th
    aria-sort={ariaSortFor(sortState, column)}
    className={twJoin(headerCellClass, className)}
  >
    <button
      className={sortButtonClass}
      onClick={() => onSort(column)}
      type="button"
    >
      {children}
      {sortState.column === column && (
        <SortIndicator direction={sortState.direction} />
      )}
    </button>
  </th>
);

const TableHead: FC<{
  onSort: (column: SortColumn) => void;
  sortState: SortState;
}> = ({onSort, sortState}) => (
  <thead>
    <tr className="bg-bg-elev-2">
      <th className={headerCellClass}>
        <span className="sr-only">Expand</span>
      </th>
      <SortableHeaderCell column="id" onSort={onSort} sortState={sortState}>
        ID
      </SortableHeaderCell>
      <SortableHeaderCell
        className="w-48"
        column="title"
        onSort={onSort}
        sortState={sortState}
      >
        Title
      </SortableHeaderCell>
      <SortableHeaderCell column="status" onSort={onSort} sortState={sortState}>
        Status
      </SortableHeaderCell>
      <SortableHeaderCell column="tokens" onSort={onSort} sortState={sortState}>
        Total tokens
      </SortableHeaderCell>
      <SortableHeaderCell column="cost" onSort={onSort} sortState={sortState}>
        Cost $
      </SortableHeaderCell>
      <SortableHeaderCell
        className="hidden md:table-cell"
        column="time"
        onSort={onSort}
        sortState={sortState}
      >
        Time
      </SortableHeaderCell>
    </tr>
  </thead>
);

/** Same content check `ExpandedDetail` renders from: a row with neither
 * phases nor sessions has nothing to show, so it should not invite a click. */
const hasExpandableContent = (entry: CostEntry): boolean =>
  entry.phases.length > 0 || entry.sessions.length > 0;

const targetRowClass = 'bg-accent/5 ring-accent/40 ring-1 ring-inset';

const CostRow: FC<{
  entry: CostEntry;
  isExpanded: boolean;
  isTarget: boolean;
  onToggle: () => void;
  onViewSession?: (sessionId: string) => void;
  sessionsById?: Map<string, SessionSummary>;
}> = ({entry, isExpanded, isTarget, onToggle, onViewSession, sessionsById}) => {
  const rowLabel = entry.id ?? entry.title;
  const detailId = `cost-row-detail-${entry.key}`;
  const canExpand = hasExpandableContent(entry);
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
        className={twJoin(
          'border-border-soft border-t',
          canExpand ?
            'hover:bg-bg-elev/60 cursor-pointer'
          : 'cursor-not-allowed',
          isTarget && targetRowClass
        )}
        id={costEntryAnchorId(entry.key)}
        onClick={canExpand ? onToggle : undefined}
        onKeyDown={canExpand ? handleRowKeyDown : undefined}
      >
        <td className={cellClass}>
          {canExpand && (
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
          )}
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
        <td
          className={twJoin(cellClass, 'whitespace-nowrap')}
          data-testid={`recorded-dollars-${entry.key}`}
        >
          {formatDollarsCell(entry.totals.recordedDollars)}
        </td>
        <td
          className={twJoin(
            cellClass,
            'hidden whitespace-nowrap md:table-cell'
          )}
        >
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

const totalsLabelClass =
  'text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase';

/** Cumulative Cost/Time for the currently shown table (feedback), on the same
 * row as the specs/plans toggle. Same formatters as the table cells: a
 * missing figure on every row still reads as a dash, not a misleading $0. */
const TotalsSummary: FC<{cost: null | number; time: null | number}> = ({
  cost,
  time,
}) => (
  <div
    className="text-fg flex items-center gap-4 text-sm"
    data-testid="cost-table-totals"
  >
    <span className="flex items-baseline gap-1.5">
      <span className={totalsLabelClass}>Cost</span>
      {formatDollarsCell(cost)}
    </span>
    <span className="flex items-baseline gap-1.5">
      <span className={totalsLabelClass}>Time</span>
      {formatDuration(time)}
    </span>
  </div>
);

/**
 * SPEC 6.3: the specs & plans cost table, split into two tables with an
 * in-place toggle (feedback). Presentational only, receives its already-fetched
 * data as props; both tables share one column sort and one lifted session
 * lookup (the expanded-row join is built once, not per row). The toggle and
 * a deep-link target both live in the URL (`?work=`, `?entry=`, feedback) so
 * the view is shareable; `?entry=` wins when it names a row in the other
 * table.
 */
const CostTable: FC<CostTableProps> = ({entries, onViewSession, sessions}) => {
  const [params, setQueryParams] = useQueryParams();
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const scrolledForEntryRef = useRef<null | string>(null);

  const workParam = params.get('work');
  const entryParam = params.get('entry');

  const specs = useMemo(
    () => sortEntries(entries.filter(isSpec), sortState),
    [entries, sortState]
  );
  const plans = useMemo(
    () => sortEntries(entries.filter(isPlan), sortState),
    [entries, sortState]
  );
  const sessionsById = useMemo(
    () =>
      sessions &&
      new Map(sessions.map((session) => [session.sessionId, session])),
    [sessions]
  );

  // Search specs first, then plans (feedback): whichever table actually
  // contains the deep-linked entry wins, overriding `?work=` if they differ.
  const targetEntry =
    entryParam === null ? null : (
      (specs.find((entry) => entry.key === entryParam) ??
      plans.find((entry) => entry.key === entryParam) ??
      null)
    );

  const view: CostView =
    targetEntry ? costViewForEntryType(targetEntry.entryType)
    : workParam === 'plans' ? 'plans'
    : 'specs';

  useEffect(() => {
    if (
      targetEntry === null ||
      scrolledForEntryRef.current === targetEntry.key
    ) {
      return;
    }

    const element = document.querySelector(
      `[id="${CSS.escape(costEntryAnchorId(targetEntry.key))}"]`
    );

    if (element) {
      scrolledForEntryRef.current = targetEntry.key;
      element.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }, [targetEntry]);

  if (entries.length === 0) {
    return (
      <EmptyState
        description="Cost accrues once a spec or plan phase completes with recorded telemetry. A fresh GAIA project has none yet."
        title="No spec or plan cost yet"
      />
    );
  }

  const handleSelectView = (nextView: CostView): void => {
    setQueryParams({
      entry: null,
      work: nextView === 'specs' ? null : nextView,
    });
  };

  const handleSortColumn = (column: SortColumn): void => {
    setSortState((current) => nextSortState(current, column));
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle
          onSelect={handleSelectView}
          planCount={plans.length}
          specCount={specs.length}
          view={view}
        />
        <TotalsSummary
          cost={sumRecordedDollars(activeEntries)}
          time={sumDurationSeconds(activeEntries)}
        />
      </div>
      {activeEntries.length === 0 ?
        <EmptyState
          description={`No ${view} with recorded cost yet.`}
          title={`No ${view} yet`}
        />
      : <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <TableHead onSort={handleSortColumn} sortState={sortState} />
              <tbody>
                {activeEntries.map((entry) => (
                  <CostRow
                    key={entry.key}
                    entry={entry}
                    isExpanded={
                      expandedKeys.has(entry.key) ||
                      entry.key === targetEntry?.key
                    }
                    isTarget={entry.key === targetEntry?.key}
                    onToggle={() => toggleKey(entry.key)}
                    onViewSession={onViewSession}
                    sessionsById={sessionsById}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {hasMissingCost && (
            <p className="text-fg-mute text-xs">
              A &quot;{NO_DATA_LABEL}&quot; under Cost or Time means the ledger
              recorded no figure for that row, never a zero.
            </p>
          )}
        </>
      }
    </div>
  );
};

export default CostTable;

const SKELETON_ROW_KEYS = ['row-1', 'row-2', 'row-3'];

/** No-op sort handler for the skeleton's (aria-hidden) header row; sorting
 * data that has not loaded yet is meaningless. */
const noopSort = (): void => {};

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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-5 w-40" />
    </div>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <TableHead onSort={noopSort} sortState={DEFAULT_SORT} />
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
