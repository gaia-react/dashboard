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
  NO_DATA_LABEL,
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

const COLUMN_COUNT = 6;

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

/** Column widths (feedback: Title is the widest/flexible column, everything
 * else is content-sized so its values never wrap). Under `table-fixed`, every
 * column but Title carries an explicit width; Title (no width class) absorbs
 * whatever space is left. `TotalsSummary` reuses the cost/time widths so its
 * totals sit directly above the columns they summarize. */
const EXPAND_COLUMN_WIDTH = 'w-12';
const ID_COLUMN_WIDTH = 'w-24';
const STATUS_COLUMN_WIDTH = 'w-40';
/** Wide enough for a summed "$442.91" / "23h 51m" total (runs longer than any
 * one row's value), not just a single row's figure. */
const COST_COLUMN_WIDTH = 'w-36';
const TIME_COLUMN_WIDTH = 'w-32';

const headerCellClass = 'text-fg-mute text-left';
const cellClass = 'text-fg-dim px-3 py-2 text-sm';

/** Typography (eyebrow convention, matching `ExpandedDetail`'s headings) plus
 * the padding the `<th>` used to carry. Lives on the button/span itself, not
 * the `<th>`: a `<button>` resets its own `text-transform` to `none`
 * (Preflight's form-element normalize), so `uppercase` on an ancestor never
 * reaches the label text, it has to sit on the element rendering the text. */
const headerLabelClass =
  'flex h-full w-full items-center gap-1 px-3 py-2 text-left font-mono text-[0.65rem] tracking-[0.15em] uppercase';

const sortButtonClass = twJoin(
  headerLabelClass,
  'text-fg-mute hover:text-fg focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2'
);

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

/** One clickable, keyboard-operable column header (feedback: the whole cell
 * toggles sort, not just the label). `aria-sort` lives on the `<th>` per the
 * WAI-ARIA sortable-table pattern; the button fills the cell (`h-full
 * w-full`) so there is no dead padding a click misses. `disabled` renders a
 * static, non-focusable label instead (the loading skeleton, feedback: real
 * sort controls should not be tabbable while nothing has loaded yet). */
const SortableHeaderCell: FC<{
  children: ReactNode;
  className?: string;
  column: SortColumn;
  disabled?: boolean;
  onSort: (column: SortColumn) => void;
  sortState: SortState;
}> = ({children, className, column, disabled = false, onSort, sortState}) => (
  <th
    aria-sort={disabled ? undefined : ariaSortFor(sortState, column)}
    className={twJoin(headerCellClass, className)}
  >
    {disabled ?
      <span className={twJoin(headerLabelClass, 'text-fg-mute')}>
        {children}
      </span>
    : <button
        className={sortButtonClass}
        onClick={() => onSort(column)}
        type="button"
      >
        {children}
        {sortState.column === column && (
          <SortIndicator direction={sortState.direction} />
        )}
      </button>
    }
  </th>
);

const TableHead: FC<{
  disabled?: boolean;
  onSort: (column: SortColumn) => void;
  sortState: SortState;
}> = ({disabled = false, onSort, sortState}) => (
  <thead>
    <tr className="bg-bg-elev-2">
      <th className={twJoin(headerCellClass, EXPAND_COLUMN_WIDTH, 'px-3 py-2')}>
        <span className="sr-only">Expand</span>
      </th>
      <SortableHeaderCell
        className={ID_COLUMN_WIDTH}
        column="id"
        disabled={disabled}
        onSort={onSort}
        sortState={sortState}
      >
        ID
      </SortableHeaderCell>
      <SortableHeaderCell
        column="title"
        disabled={disabled}
        onSort={onSort}
        sortState={sortState}
      >
        Title
      </SortableHeaderCell>
      <SortableHeaderCell
        className={STATUS_COLUMN_WIDTH}
        column="status"
        disabled={disabled}
        onSort={onSort}
        sortState={sortState}
      >
        Status
      </SortableHeaderCell>
      <SortableHeaderCell
        className={COST_COLUMN_WIDTH}
        column="cost"
        disabled={disabled}
        onSort={onSort}
        sortState={sortState}
      >
        Cost
      </SortableHeaderCell>
      <SortableHeaderCell
        className={twJoin('hidden md:table-cell', TIME_COLUMN_WIDTH)}
        column="time"
        disabled={disabled}
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
        <td className={twJoin(cellClass, 'whitespace-nowrap')}>
          {entry.status === null ? NOT_APPLICABLE : formatLabel(entry.status)}
          {entry.partial && <span className={partialBadgeClass}>Partial</span>}
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

/** Cumulative Cost/Time for the currently shown table (feedback), stacked
 * label-over-value and left-aligned so each cell's left edge lines up with
 * the COST/TIME column header below it (same column width constants, same
 * left `px-3` inset the header labels carry). Same formatters as the table
 * cells: a missing figure on every row still reads as a dash, not a
 * misleading $0. */
const TotalsSummary: FC<{cost: null | number; time: null | number}> = ({
  cost,
  time,
}) => (
  <div
    className="flex flex-1 items-center justify-end text-sm"
    data-testid="cost-table-totals"
  >
    <span
      className={twJoin(
        'flex flex-col items-start gap-0.5 px-3 whitespace-nowrap',
        COST_COLUMN_WIDTH
      )}
      data-testid="cost-table-total-cost"
    >
      <span className={totalsLabelClass}>Total cost</span>
      <span className="text-fg">{formatDollarsCell(cost)}</span>
    </span>
    <span
      className={twJoin(
        'hidden flex-col items-start gap-0.5 px-3 whitespace-nowrap md:flex',
        TIME_COLUMN_WIDTH
      )}
      data-testid="cost-table-total-time"
    >
      <span className={totalsLabelClass}>Total time</span>
      <span className="text-fg">{formatDuration(time)}</span>
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
    setSortState(DEFAULT_SORT);
    setQueryParams({
      entry: null,
      work: nextView === 'specs' ? null : nextView,
    });
  };

  // Sorting reshuffles every row, so any expanded row (including a deep-link
  // target) closes rather than jumping to wherever its now-sorted position is.
  const handleSortColumn = (column: SortColumn): void => {
    setSortState((current) => nextSortState(current, column));
    setExpandedKeys(new Set());
    setQueryParams({entry: null});
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
      <div className="flex flex-wrap items-center gap-3">
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
            <table className="w-full table-fixed border-collapse">
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
 * (dynamic). `disabled` renders the header labels as plain, non-focusable
 * spans (KNOWN-ISSUES: a real sort `<button>` inside this `aria-hidden`
 * wrapper was still reachable by Tab, announced to nobody). */
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
      <table className="w-full table-fixed border-collapse">
        <TableHead disabled={true} onSort={noopSort} sortState={DEFAULT_SORT} />
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
