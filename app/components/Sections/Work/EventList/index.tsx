import type {FC, KeyboardEvent} from 'react';
import {useRef} from 'react';
import {twJoin} from 'tailwind-merge';
import EmptyState from '~/components/EmptyState';
import {eventFiltersClasses} from '~/components/Sections/Work/EventFilters';
import {ALL_EVENTS_LABEL} from '~/components/Sections/Work/EventFilters/filters';
import EventCard, {
  eventCardClasses,
} from '~/components/Sections/Work/EventList/EventCard';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {
  DEFAULT_SORT,
  EVENT_SORT_OPTIONS,
} from '~/components/Sections/Work/sort';
import {shimmer} from '~/components/Skeleton';

const LIST_CLASS = 'flex flex-col gap-2';

const EMPTY_LIST_DESCRIPTION =
  "Events appear here as GAIA records specs, plans, reviews, and command runs to this project's cost ledger. A fresh project has none.";

/**
 * Which card the keypress moves to, or `null` when the key is not ours or the
 * move would run off an end.
 *
 * **The list does not wrap.** Wrapping a 145-item list is disorienting;
 * `Home` / `End` is the intended jump (DESIGN-SPEC C-11). At the last card
 * `ArrowDown` is a genuine no-op: it does not claim the keypress either, so
 * the pane scrolls as it normally would.
 */
const resolveNextIndex = (
  key: string,
  selectedIndex: number,
  count: number
): null | number => {
  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return count - 1;
  }

  if (key === 'ArrowDown') {
    if (selectedIndex === -1) {
      return 0;
    }

    return selectedIndex < count - 1 ? selectedIndex + 1 : null;
  }

  if (key === 'ArrowUp') {
    if (selectedIndex === -1) {
      return 0;
    }

    return selectedIndex > 0 ? selectedIndex - 1 : null;
  }

  return null;
};

type Props = {
  /** Already filtered and sorted by the caller. */
  events: GaiaEvent[];
  /** The current category's display name, `All events` when nothing is
   * filtered. Decides which of the two empty states renders. */
  filterLabel: string;
  onSelect: (key: string) => void;
  selectedKey: null | string;
};

/**
 * The event list (DESIGN-SPEC C-11): a `<ul>` of `<li>` of `<button>`.
 *
 * Deliberately **not** `role="listbox"` / `role="option"`: a `<button>` inside
 * a listbox is invalid ARIA. Arrow-key handling lives on the `<ul>` in a
 * single `onKeyDown` rather than on each button.
 *
 * **Selection follows focus** (DESIGN-SPEC 11.12). Arrows move the selection,
 * the DOM focus, and the detail panel together, with no separate activate
 * step, which is what makes arrow-key browsing worth having. Moving focus is
 * this component's job: the parent only re-renders `selectedKey`, so the card
 * refs are kept here and the next card is focused directly.
 */
const EventList: FC<Props> = ({events, filterLabel, onSelect, selectedKey}) => {
  const cardRefs = useRef(new Map<string, HTMLButtonElement | null>());

  if (events.length === 0) {
    return filterLabel === ALL_EVENTS_LABEL ?
        <EmptyState
          description={EMPTY_LIST_DESCRIPTION}
          icon="unknown"
          title="No GAIA events yet"
        />
      : <EmptyState
          description={`This project has no ${filterLabel} events yet. Choose "All events" to see everything.`}
          title={`No ${filterLabel} events`}
        />;
  }

  const selectedIndex = events.findIndex((event) => event.key === selectedKey);
  // With nothing selected the list would have no tab stop at all, so the
  // first card takes it. Exactly one card is always tabbable.
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLUListElement>): void => {
    const nextIndex = resolveNextIndex(
      keyEvent.key,
      selectedIndex,
      events.length
    );

    if (nextIndex === null) {
      return;
    }

    // Enter and Space are left alone: the card is a `<button>`, activation is
    // native, and selection already followed focus.
    keyEvent.preventDefault();

    const next = events[nextIndex];

    onSelect(next.key);
    cardRefs.current.get(next.key)?.focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- roving-tabindex list (DESIGN-SPEC C-11): role="listbox" is invalid here since children are <button>s
    <ul className={LIST_CLASS} onKeyDown={handleKeyDown}>
      {events.map((event, index) => (
        <EventCard
          key={event.key}
          ref={(node) => {
            const registry = cardRefs.current;

            registry.set(event.key, node);

            return () => {
              registry.delete(event.key);
            };
          }}
          event={event}
          isSelected={event.key === selectedKey}
          isTabStop={index === tabStopIndex}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
};

export default EventList;

const SKELETON_CARDS = 5;

/**
 * The two selects reduced to one placeholder option each (DESIGN-SPEC C-10,
 * state L). The placeholders are the two defaults, read from the same
 * vocabularies the live control uses, so the skeleton never shows a category
 * or an ordering that does not exist.
 */
const SKELETON_FIELDS = [
  {
    id: 'work-event-filter-skeleton',
    label: 'Filter',
    placeholder: ALL_EVENTS_LABEL,
  },
  {
    id: 'work-event-sort-skeleton',
    label: 'Sort',
    placeholder:
      EVENT_SORT_OPTIONS.find((option) => option.id === DEFAULT_SORT)?.label ??
      '',
  },
];

/**
 * The loading list (DESIGN-SPEC 7.1): the filter row with both selects
 * disabled, then five cards at the real card's exact box, shimmering over
 * real placeholder strings. `aria-hidden`, because `AsyncSection`'s
 * `role="status"` already carries the announcement, and this row's count line
 * deliberately carries no `aria-live`: the Work tab has exactly one live
 * region and it belongs to the loaded control.
 */
export const EventListSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className="flex flex-col gap-2"
    data-testid="event-list-skeleton"
  >
    <div className={eventFiltersClasses.container}>
      <div className={eventFiltersClasses.grid}>
        {SKELETON_FIELDS.map((field) => (
          <label
            key={field.label}
            className={eventFiltersClasses.field}
            htmlFor={field.id}
          >
            <span className={eventFiltersClasses.fieldLabel}>
              {field.label}
            </span>
            <select
              className={eventFiltersClasses.select}
              data-testid="event-skeleton-select"
              disabled={true}
              id={field.id}
            >
              <option>{field.placeholder}</option>
            </select>
          </label>
        ))}
      </div>
      <p
        className={twJoin(eventFiltersClasses.count, shimmer)}
        data-testid="event-skeleton-count"
      >
        0 events
      </p>
    </div>
    <ul className={LIST_CLASS}>
      {Array.from({length: SKELETON_CARDS}, (unused, index) => (
        <li key={index}>
          <div
            className={eventCardClasses.surface}
            data-testid="event-skeleton-card"
          >
            <span className={eventCardClasses.identity}>
              <span className={twJoin('text-label', shimmer)}>Spec</span>
              <span className="flex-1" />
              <span className={twJoin(eventCardClasses.slot, shimmer)}>
                Merged
              </span>
            </span>
            <span className={twJoin(eventCardClasses.handle, shimmer)}>
              SPEC-000
            </span>
            <span className={twJoin(eventCardClasses.subject, shimmer)}>
              Loading the recorded cost, elapsed time, and tokens for this
              event.
            </span>
            <span className={twJoin(eventCardClasses.figures, shimmer)}>
              <span>Jan 1, 2026</span>
              <span>$0.00</span>
              <span>0m</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  </div>
);
