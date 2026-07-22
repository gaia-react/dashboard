import {
  DEFAULT_FILTER,
  filterEvents,
  resolveFilterId,
} from '~/components/Sections/Work/EventFilters/filters';
import type {EventFilterId} from '~/components/Sections/Work/EventFilters/filters';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {DEFAULT_SORT, sortEvents} from '~/components/Sections/Work/sort';

/**
 * What, if anything, the URL needs correcting to once the render has already
 * resolved (DESIGN-SPEC 7.2): a stale `?entry=` that names nothing in the
 * list drops the param; a live `?entry=` the current `?filter=` hides widens
 * the filter back to "All events" rather than hiding the thing being
 * navigated to. `null` means the URL already matches the resolved selection.
 */
export type SelectionCorrection = 'drop-entry' | 'reset-filter' | null;

export type WorkSelection = {
  correction: SelectionCorrection;
  event: GaiaEvent | null;
  filter: EventFilterId;
};

/**
 * The most recent event by the fixed `Date (newest first)` order, independent
 * of whichever sort the list is currently displayed in (DESIGN-SPEC 7.2 rule
 * 1: the default selection is always "most recent", never "first under the
 * active sort"). `null` when there is nothing left after filtering.
 */
const mostRecent = (events: GaiaEvent[]): GaiaEvent | null =>
  sortEvents(events, DEFAULT_SORT)[0] ?? null;

/**
 * Resolves which event the detail panel shows and which filter the list pane
 * displays, from the full (unfiltered) event list and the raw `?entry=` /
 * `?filter=` query values (DESIGN-SPEC 7.2, four rules):
 *
 * 1. No `?entry=`: the most recent event within the current filter (`null`
 *    only when the filtered list itself is empty).
 * 2. `?entry=` names an event the current filter hides: widen the filter to
 *    "All events" rather than hiding the target.
 * 3. `?entry=` names nothing in the list: fall back to the most recent event
 *    within the current filter and drop the param.
 * 4. `?entry=` names an event the current filter already shows: select it,
 *    filter unchanged.
 *
 * `correction` reports which of these needs a URL patch; the caller applies
 * it in an effect. Rendering itself never waits on that patch landing: every
 * branch above already computes the right `event` / `filter` pair for this
 * render, so a correction is a shareability fix for the address bar, not a
 * precondition for a correct paint.
 *
 * Deliberately NOT invoked on every filter change from the UI: the caller
 * clears `?entry=` itself when the user picks a new filter (mirroring v1's
 * `CostTable` view toggle), so this function only ever sees the
 * filter-hides-a-live-deep-link case on a stale or hand-edited URL.
 */
export const resolveWorkSelection = (
  events: GaiaEvent[],
  entryParam: null | string,
  filterParam: null | string
): WorkSelection => {
  const filter = resolveFilterId(filterParam);

  if (entryParam === null) {
    return {
      correction: null,
      event: mostRecent(filterEvents(events, filter)),
      filter,
    };
  }

  const target = events.find((event) => event.key === entryParam) ?? null;

  if (target === null) {
    return {
      correction: 'drop-entry',
      event: mostRecent(filterEvents(events, filter)),
      filter,
    };
  }

  if (filter !== DEFAULT_FILTER && target.type !== filter) {
    return {correction: 'reset-filter', event: target, filter: DEFAULT_FILTER};
  }

  return {correction: null, event: target, filter};
};
