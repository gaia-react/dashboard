import {sumBuckets} from '~/components/Sections/CostTable/format';
import type {Buckets} from '~/data/schemas/api';

/**
 * Minimal shape `sortEntries` reads; every `CostEntry` satisfies this
 * structurally, so callers pass `CostEntry[]` directly and tests can build
 * lightweight fixtures without the full schema.
 */
export type SortableCostEntry = {
  id: null | string;
  sortAt: string;
  status: null | string;
  title: string;
  totals: {
    buckets: Buckets;
    durationSeconds: null | number;
    recordedDollars: null | number;
  };
};

export type SortColumn = 'cost' | 'id' | 'status' | 'time' | 'title' | 'tokens';

export type SortDirection = 'asc' | 'desc';

export type SortState = {column: SortColumn; direction: SortDirection};

/** ID starts descending (newest ids read highest, feedback); every other
 * column defaults to ascending on the first click that activates it. */
const DEFAULT_DIRECTION: Record<SortColumn, SortDirection> = {
  cost: 'asc',
  id: 'desc',
  status: 'asc',
  time: 'asc',
  title: 'asc',
  tokens: 'asc',
};

export const DEFAULT_SORT: SortState = {
  column: 'id',
  direction: DEFAULT_DIRECTION.id,
};

/** Clicking the active column toggles its direction; clicking a different
 * column resets to that column's default direction. */
export const nextSortState = (
  current: SortState,
  column: SortColumn
): SortState =>
  current.column === column ?
    {column, direction: current.direction === 'asc' ? 'desc' : 'asc'}
  : {column, direction: DEFAULT_DIRECTION[column]};

/** Lifecycle order for the Status column (feedback). `null` and any
 * unrecognized status (the real ledger's `completed` / `specified` /
 * `allocated`, or a missing status on a slug row) rank just after the known
 * stages; `abandoned` is handled separately, always pinned last. */
const STATUS_LIFECYCLE_ORDER = ['draft', 'ready', 'merged', 'archived'];
const ABANDONED_STATUS = 'abandoned';

const statusRank = (status: null | string): number => {
  if (status === null) {
    return STATUS_LIFECYCLE_ORDER.length;
  }

  const index = STATUS_LIFECYCLE_ORDER.indexOf(status);

  return index === -1 ? STATUS_LIFECYCLE_ORDER.length : index;
};

/** A missing recorded dollar/duration figure sorts as the lowest value: first
 * ascending, last descending, so a table sorted "highest cost first" never
 * puts an unpriced row above a priced one. */
const missingAsLowest = (value: null | number): number => value ?? -Infinity;

const compareByColumn = (
  a: SortableCostEntry,
  b: SortableCostEntry,
  column: SortColumn
): number => {
  if (column === 'id') {
    return (a.id ?? '').localeCompare(b.id ?? '');
  }

  if (column === 'title') {
    return a.title.localeCompare(b.title);
  }

  if (column === 'status') {
    return statusRank(a.status) - statusRank(b.status);
  }

  if (column === 'tokens') {
    return sumBuckets(a.totals.buckets) - sumBuckets(b.totals.buckets);
  }

  if (column === 'cost') {
    return (
      missingAsLowest(a.totals.recordedDollars) -
      missingAsLowest(b.totals.recordedDollars)
    );
  }

  return (
    missingAsLowest(a.totals.durationSeconds) -
    missingAsLowest(b.totals.durationSeconds)
  );
};

/**
 * Sorts a table's rows for the active column/direction (feedback). Ties fall
 * back to `sortAt` descending so equal-value rows keep a deterministic,
 * recency-first order. Status is the one column direction can't fully invert:
 * `abandoned` sinks to the very bottom regardless of ascending/descending.
 */
export const sortEntries = <TEntry extends SortableCostEntry>(
  entries: TEntry[],
  sort: SortState
): TEntry[] =>
  entries.toSorted((a, b) => {
    if (sort.column === 'status') {
      const aAbandoned = a.status === ABANDONED_STATUS;
      const bAbandoned = b.status === ABANDONED_STATUS;

      if (aAbandoned !== bAbandoned) {
        return aAbandoned ? 1 : -1;
      }
    }

    const primary = compareByColumn(a, b, sort.column);
    const directed = sort.direction === 'asc' ? primary : -primary;

    return directed === 0 ? b.sortAt.localeCompare(a.sortAt) : directed;
  });
