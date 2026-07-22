import type {FC} from 'react';
import {useEffect, useMemo} from 'react';
import AsyncSection from '~/components/AsyncSection';
import EmptyState from '~/components/EmptyState';
import EventDetail, {
  EventDetailSkeleton,
} from '~/components/Sections/Work/EventDetail';
import EventFilters from '~/components/Sections/Work/EventFilters';
import type {EventFilterId} from '~/components/Sections/Work/EventFilters/filters';
import {
  countEventsByType,
  DEFAULT_FILTER,
  filterEvents,
  filterLabelFor,
} from '~/components/Sections/Work/EventFilters/filters';
import EventList, {
  EventListSkeleton,
} from '~/components/Sections/Work/EventList';
import {buildEvents} from '~/components/Sections/Work/events';
import {resolveWorkSelection} from '~/components/Sections/Work/selection';
import type {EventSortId} from '~/components/Sections/Work/sort';
import {
  DEFAULT_SORT,
  resolveSortId,
  sortEvents,
} from '~/components/Sections/Work/sort';
import type {
  ActivityResponse,
  CostsResponse,
  SessionSummary,
} from '~/data/schemas/api';
import type {ApiResourceState} from '~/hooks/useApiResource';
import {useQueryParams} from '~/hooks/useQueryParams';

const gridClass =
  'grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(20rem,26rem)_1fr] lg:gap-6 xl:gap-8';
/** C-09: caps the list below `lg` so the detail panel is reachable without
 * scrolling past a 145-card list; the cap drops once the panes scroll
 * independently. */
const listPaneClass =
  'min-h-0 max-h-[60vh] overflow-y-auto lg:max-h-none lg:overflow-y-auto lg:pb-8';
const detailPaneClass = 'min-h-0 lg:overflow-y-auto lg:pb-8';

export type WorkProps = {
  /** Built into `sessionsById` here, once, when it resolves (v1's seam): the
   * Work tab must not block on `/api/activity`. */
  activityState: ApiResourceState<ActivityResponse>;
  costsState: ApiResourceState<CostsResponse>;
  onViewSession?: (sessionId: string) => void;
  refresh: () => void;
};

/**
 * The Work tab (DESIGN-SPEC 1.4, 7.1, 7.2): the two-pane console composed
 * from W8's `EventFilters` / `EventList` and W9's `EventDetail` over K3's
 * event model. Owns every piece of Work state that lives in the URL
 * (`?entry=`, `?filter=`, `?sort=`) and the selection rules
 * (`selection.ts`) that keep a stale or filtered-out deep link from ever
 * showing an empty panel.
 *
 * Loading and error both key off `costsState` alone: the list pane goes
 * through `AsyncSection` (its skeleton and its `ErrorState` with retry); the
 * detail pane cannot reuse that generic error branch because a failed list
 * has no selection to describe, so it renders nothing on error rather than a
 * second copy of the same failure (DESIGN-SPEC 7.1 / 7.2).
 */
const Work: FC<WorkProps> = ({
  activityState,
  costsState,
  onViewSession,
  refresh,
}) => {
  const [params, setQueryParams] = useQueryParams();
  const entryParam = params.get('entry');
  const filterParam = params.get('filter');
  const sort = resolveSortId(params.get('sort'));

  const events = useMemo(
    () => (costsState.status === 'success' ? buildEvents(costsState.data) : []),
    [costsState]
  );

  const selection = useMemo(
    () => resolveWorkSelection(events, entryParam, filterParam),
    [entryParam, events, filterParam]
  );

  // A stale or hand-edited URL corrects itself once, after the paint that
  // already rendered the right thing (selection.ts's own doc comment):
  // dropping an entry that names nothing, or widening a filter that hides a
  // live deep-link target back to "All events".
  useEffect(() => {
    if (selection.correction === 'drop-entry') {
      setQueryParams({entry: null});
    } else if (selection.correction === 'reset-filter') {
      setQueryParams({filter: null});
    }
  }, [selection.correction, setQueryParams]);

  const sessionsById = useMemo(
    () =>
      activityState.status === 'success' ?
        new Map<string, SessionSummary>(
          activityState.data.sessions.map((session) => [
            session.sessionId,
            session,
          ])
        )
      : undefined,
    [activityState]
  );

  const handleSelect = (key: string): void => {
    setQueryParams({entry: key});
  };

  // A filter change always drops the current selection rather than letting
  // selection.ts's "hides the target" correction fight it back to "All
  // events": the user just chose a category on purpose, so the default
  // pick is the most recent event WITHIN it (mirrors v1 CostTable's view
  // toggle, which cleared `?entry=` on the same interaction).
  const handleFilterChange = (next: EventFilterId): void => {
    setQueryParams({
      entry: null,
      filter: next === DEFAULT_FILTER ? null : next,
    });
  };

  const handleSortChange = (next: EventSortId): void => {
    setQueryParams({sort: next === DEFAULT_SORT ? null : next});
  };

  const filtered = filterEvents(events, selection.filter);
  const displayEvents = sortEvents(filtered, sort);

  return (
    <div className={gridClass}>
      <div className={listPaneClass}>
        <AsyncSection
          label="Events"
          onRetry={refresh}
          skeleton={<EventListSkeleton />}
          state={costsState}
        >
          {() => (
            <>
              <EventFilters
                counts={countEventsByType(events)}
                filter={selection.filter}
                onFilterChange={handleFilterChange}
                onSortChange={handleSortChange}
                sort={sort}
                visibleCount={filtered.length}
              />
              <EventList
                events={displayEvents}
                filterLabel={filterLabelFor(selection.filter)}
                onSelect={handleSelect}
                selectedKey={selection.event?.key ?? null}
              />
            </>
          )}
        </AsyncSection>
      </div>
      <div className={detailPaneClass}>
        {costsState.status === 'loading' && <EventDetailSkeleton />}
        {costsState.status === 'success' &&
          (selection.event === null ?
            <EmptyState
              description="Choose an event on the left to see what it cost, how long it took, and how many tokens it used."
              title="Select an event"
            />
          : <EventDetail
              event={selection.event}
              onViewSession={onViewSession}
              sessionsById={sessionsById}
            />)}
        {/* costsState.status === 'error': nothing to describe, so nothing
            renders here. The list pane's ErrorState above already carries
            the retry (DESIGN-SPEC 7.2). */}
      </div>
    </div>
  );
};

export default Work;
