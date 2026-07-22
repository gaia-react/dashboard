import type {GaiaEvent} from '~/components/Sections/Work/events';

/**
 * The Work tab's sort vocabulary (DESIGN-SPEC C-10). Each option carries its
 * own fixed direction, so v2 has no direction toggle: "Cost (highest first)"
 * is one option, not a column plus an arrow.
 */
export type EventSortId = 'cost' | 'date' | 'status' | 'time';

export const DEFAULT_SORT: EventSortId = 'date';

/** Labels exactly as DESIGN-SPEC C-10 gives them, in its order. */
export const EVENT_SORT_OPTIONS: {id: EventSortId; label: string}[] = [
  {id: 'date', label: 'Date (newest first)'},
  {id: 'cost', label: 'Cost (highest first)'},
  {id: 'time', label: 'Time (longest first)'},
  {id: 'status', label: 'Status'},
];

/**
 * A `Map`, not an object literal, because the value being looked up is a URL
 * query string: `?sort=constructor` must fall back to the default, not
 * resolve to an inherited `Object.prototype` member.
 */
const SORT_IDS = new Map<string, EventSortId>(
  EVENT_SORT_OPTIONS.map((option) => [option.id, option.id])
);

/** Silently falls back to the default on anything unrecognized: a stale deep
 * link is not a failure and must never surface an error (DESIGN-SPEC C-10). */
export const resolveSortId = (value: null | string): EventSortId =>
  value === null ? DEFAULT_SORT : (SORT_IDS.get(value) ?? DEFAULT_SORT);

/**
 * The spec/plan ledger lifecycle (Phase 8 README, "Ledger statuses"). A `Map`
 * again: `status` is an unconstrained ledger pass-through
 * (`costEntrySchema.status` is `z.string().nullable()`).
 */
const STATUS_RANKS = new Map<string, number>([
  ['abandoned', 4],
  ['archived', 3],
  ['draft', 0],
  ['merged', 2],
  ['ready', 1],
]);

const UNRECOGNIZED_STATUS_RANK = STATUS_RANKS.size;
const NULL_STATUS_RANK = STATUS_RANKS.size + 1;

/** An unrecognized status ranks after all five known stages; `null` ranks
 * last of all, because "no status recorded" is weaker information than "a
 * status this dashboard does not know about". */
const statusRank = (status: null | string): number =>
  status === null ? NULL_STATUS_RANK : (
    (STATUS_RANKS.get(status) ?? UNRECOGNIZED_STATUS_RANK)
  );

/**
 * Descending by value with **nulls last**, in every ordering, always.
 *
 * Not `value ?? 0` and not `value ?? -Infinity`. A `$0.00` event ranks ABOVE
 * a null-cost event under "Cost (highest first)" because zero is a
 * measurement and null is the absence of one; coercing to zero makes them
 * tie, and the tie-break then hands the top slot to whichever is more recent.
 * A missing figure must never read as "cheapest" or "fastest"
 * (DESIGN-SPEC 7.5, PRODUCT.md principle 1).
 */
const compareValueDescending = (a: null | number, b: null | number): number => {
  if (a === null || b === null) {
    if (a === b) {
      return 0;
    }

    return a === null ? 1 : -1;
  }

  return b - a;
};

const compareBySort = (
  a: GaiaEvent,
  b: GaiaEvent,
  sort: EventSortId
): number => {
  if (sort === 'cost') {
    return compareValueDescending(a.recordedDollars, b.recordedDollars);
  }

  if (sort === 'time') {
    return compareValueDescending(a.durationSeconds, b.durationSeconds);
  }

  if (sort === 'status') {
    return statusRank(a.status) - statusRank(b.status);
  }

  return Date.parse(b.at) - Date.parse(a.at);
};

/**
 * Sorts the event list for display. Ties break by `at` descending so equal
 * values keep a recency-first order, then by `key` ascending so the result is
 * fully deterministic and a re-render never reshuffles equal rows.
 */
export const sortEvents = (
  events: GaiaEvent[],
  sort: EventSortId
): GaiaEvent[] =>
  events.toSorted((a, b) => {
    const primary = compareBySort(a, b, sort);

    if (primary !== 0) {
      return primary;
    }

    const byDate = Date.parse(b.at) - Date.parse(a.at);

    return byDate === 0 ? a.key.localeCompare(b.key) : byDate;
  });
