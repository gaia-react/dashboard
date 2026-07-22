import {
  EVENT_GROUPS,
  EVENT_LABELS,
} from '~/components/Sections/Work/event-meta';
import type {GaiaEvent, GaiaEventType} from '~/components/Sections/Work/events';

/**
 * The Work tab's filter vocabulary: "All events" plus one option per event
 * type that has a filter option. `unknown` is a member of `GaiaEventType`, so
 * it is structurally a member of this union too, but it has no option in the
 * select (see `FILTER_GROUPS`) and no query value resolves to it.
 */
export type EventFilterId = 'all' | GaiaEventType;

export const DEFAULT_FILTER: EventFilterId = 'all';

/** The default filter's own display name, and the sentinel `EventList` reads
 * to tell "this project has no events" from "this filter has none". */
export const ALL_EVENTS_LABEL = 'All events';

/**
 * The `<optgroup>` order, Work before Maintenance (DESIGN-SPEC C-10).
 * Membership comes from K3's `EVENT_GROUPS`; only the display order of the
 * two groups is declared here, because `EVENT_GROUPS`'s own key order is
 * alphabetical and `Object.entries` would put Maintenance first.
 */
export const FILTER_GROUPS: {label: string; types: GaiaEventType[]}[] = [
  {label: 'Work', types: EVENT_GROUPS.work},
  {label: 'Maintenance', types: EVENT_GROUPS.maintenance},
];

/**
 * A `Map`, not an object literal, because the value being looked up comes
 * straight off the URL: `?filter=constructor` must fall back to "All events",
 * not resolve to an inherited `Object.prototype` member. This bug class has
 * shipped twice in this build already (`Icon/icon-map.ts`, `format/lenses.ts`)
 * and K3 fixed a third instance in `events.ts`.
 *
 * Only the ids that have an option are keys. `?filter=unknown` therefore
 * falls back to "All events" rather than putting the select into a state it
 * cannot display: an unrecognized event is reachable only from All events.
 */
const FILTER_IDS = new Map<string, EventFilterId>([
  [DEFAULT_FILTER, DEFAULT_FILTER],
  ...FILTER_GROUPS.flatMap((group) =>
    group.types.map((type): [string, EventFilterId] => [type, type])
  ),
]);

/** Silently falls back to the default on anything unrecognized: a stale deep
 * link is not a failure and must never surface an error (DESIGN-SPEC C-10,
 * state E). */
export const resolveFilterId = (value: null | string): EventFilterId =>
  value === null ? DEFAULT_FILTER : (FILTER_IDS.get(value) ?? DEFAULT_FILTER);

/** The category name for the filtered-empty copy; "All events" when nothing
 * is filtered. */
export const filterLabelFor = (filter: EventFilterId): string =>
  filter === DEFAULT_FILTER ? ALL_EVENTS_LABEL : EVENT_LABELS[filter];

/**
 * Live per-type counts for the option labels. Every type is present, zero
 * included: a zero count is what renders its option `disabled`, so a missing
 * key would silently re-enable a guaranteed-empty category.
 *
 * Tallied in a `Map` and read out explicitly rather than incremented through
 * `counts[event.type]`, so no runtime string ever indexes an object literal.
 */
export const countEventsByType = (
  events: GaiaEvent[]
): Record<GaiaEventType, number> => {
  const tally = new Map<string, number>();

  for (const event of events) {
    tally.set(event.type, (tally.get(event.type) ?? 0) + 1);
  }

  const count = (type: GaiaEventType): number => tally.get(type) ?? 0;

  return {
    audit: count('audit'),
    debt: count('debt'),
    fitness: count('fitness'),
    forensics: count('forensics'),
    harden: count('harden'),
    plan: count('plan'),
    review: count('review'),
    spec: count('spec'),
    unknown: count('unknown'),
    wiki: count('wiki'),
  };
};

/** Narrows the list to one category, preserving the caller's order. */
export const filterEvents = (
  events: GaiaEvent[],
  filter: EventFilterId
): GaiaEvent[] =>
  filter === DEFAULT_FILTER ? events : (
    events.filter((event) => event.type === filter)
  );
