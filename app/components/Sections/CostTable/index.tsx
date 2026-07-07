import type {FC, ReactNode} from 'react';
import {useState} from 'react';
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
import type {CostEntry, SessionSummary} from '~/data/schemas/api';

const COLUMN_COUNT = 9;

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
 * row has no id, no status). Distinct from `NO_DATA_LABEL`: this marks a
 * structural non-applicability, not a data gap that needs explaining. */
const NOT_APPLICABLE = '-';

const badgeClass =
  'inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase';

const SOURCE_BADGE_LABEL: Record<CostEntry['source'], string> = {
  backfill: 'Backfill',
  mixed: 'Mixed',
  native: 'Native',
  none: 'None',
};

const SOURCE_BADGE_CLASS: Record<CostEntry['source'], string> = {
  backfill: 'border-border text-fg-dim',
  mixed: 'border-accent-2 text-accent-soft',
  native: 'border-secondary-2 text-secondary-soft',
  none: 'border-border-soft text-fg-mute',
};

const Badge: FC<{children: ReactNode; className: string}> = ({
  children,
  className,
}) => <span className={twJoin(badgeClass, className)}>{children}</span>;

export type CostTableProps = {
  /** Section 6.3 rows; already chronological by `sortAt` (aggregation
   * layer contract), never re-sorted here. */
  entries: CostEntry[];
  /** SPEC 6.3 / PLAN section 3 client-side join target: `SessionSummary[]`
   * from `/api/activity`. Undefined while that resource has not resolved
   * yet; the expanded-row session detail shows a skeleton until then. */
  sessions?: SessionSummary[];
};

const headerCellClass =
  'text-fg-mute px-3 py-2 text-left font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const cellClass = 'text-fg-dim px-3 py-2 text-sm';

const CostRow: FC<{
  entry: CostEntry;
  isExpanded: boolean;
  onToggle: () => void;
  sessions?: SessionSummary[];
}> = ({entry, isExpanded, onToggle, sessions}) => {
  const rowLabel = entry.id ?? entry.title;
  const detailId = `cost-row-detail-${entry.key}`;

  return (
    <>
      <tr
        className="border-border-soft border-t"
        id={costEntryAnchorId(entry.key)}
      >
        <td className={cellClass}>
          <button
            aria-controls={detailId}
            aria-expanded={isExpanded}
            className="text-fg-mute hover:text-fg focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={onToggle}
            type="button"
          >
            <ExpandIcon expanded={isExpanded} />
            <span className="sr-only">
              {isExpanded ? 'Collapse' : 'Expand'} {rowLabel}
            </span>
          </button>
        </td>
        <td className={cellClass}>{entry.id ?? NOT_APPLICABLE}</td>
        <td className={cellClass}>{entry.title}</td>
        <td className={cellClass}>{entry.status ?? NOT_APPLICABLE}</td>
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
        <td className={cellClass}>
          <div className="flex flex-wrap items-center gap-1">
            <Badge className={SOURCE_BADGE_CLASS[entry.source]}>
              {SOURCE_BADGE_LABEL[entry.source]}
            </Badge>
            {entry.partial && (
              <Badge className="border-warn-2 text-warn-soft">Partial</Badge>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr
          className="border-border-soft border-t"
          data-testid={detailId}
          id={detailId}
        >
          <td className="bg-bg-elev p-3" colSpan={COLUMN_COUNT}>
            <ExpandedDetail entry={entry} sessions={sessions} />
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * SPEC 6.3: the specs & plans cost table. Presentational only, receives its
 * already-fetched data as props (no fetch, no `useDashboardData`).
 */
const CostTable: FC<CostTableProps> = ({entries, sessions}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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

  const hasMissingCost = entries.some(
    (entry) => entry.totals.recordedDollars === null
  );

  return (
    <div className="flex flex-col gap-3">
      {hasMissingCost && (
        <p className="text-fg-mute text-xs">
          Recorded cost reflects only rows the ledger priced; a row with no
          ledger dollar figure shows &quot;{NO_DATA_LABEL}&quot; rather than
          zero.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
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
              <th className={headerCellClass}>Recorded $</th>
              <th className={twJoin(headerCellClass, 'hidden md:table-cell')}>
                Elapsed
              </th>
              <th className={headerCellClass}>Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <CostRow
                key={entry.key}
                entry={entry}
                isExpanded={expandedKeys.has(entry.key)}
                onToggle={() => toggleKey(entry.key)}
                sessions={sessions}
              />
            ))}
          </tbody>
        </table>
      </div>
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
    <Skeleton className="h-4 w-80" />
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
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
            <th className={headerCellClass}>Recorded $</th>
            <th className={twJoin(headerCellClass, 'hidden md:table-cell')}>
              Elapsed
            </th>
            <th className={headerCellClass}>Source</th>
          </tr>
        </thead>
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
              <td className={cellClass}>
                <Skeleton className="inline-block h-4 w-16" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
