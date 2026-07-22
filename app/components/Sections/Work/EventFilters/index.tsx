import type {ChangeEvent, FC} from 'react';
import {twJoin} from 'tailwind-merge';
import {EVENT_LABELS} from '~/components/Sections/Work/event-meta';
import type {EventFilterId} from '~/components/Sections/Work/EventFilters/filters';
import {
  ALL_EVENTS_LABEL,
  FILTER_GROUPS,
  filterLabelFor,
  resolveFilterId,
} from '~/components/Sections/Work/EventFilters/filters';
import type {GaiaEventType} from '~/components/Sections/Work/events';
import type {EventSortId} from '~/components/Sections/Work/sort';
import {
  EVENT_SORT_OPTIONS,
  resolveSortId,
} from '~/components/Sections/Work/sort';
import {colorTransition, focusRing} from '~/styles/class-names';

/**
 * Exported so `EventListSkeleton` can mirror the filter row exactly rather
 * than re-typing its classes (skeleton-loaders skill, same pattern as
 * `emptyStateClasses`). A drifted copy is a layout shift on every load.
 *
 * `select` is DESIGN-SPEC C-10's `selectClass` plus its H and X states from
 * the same table. The hover is gated on `enabled:` so a disabled control
 * never raises to `bg-elev-2`, where its `fg-mute` label would sit at 4.15:1.
 */
export const eventFiltersClasses = {
  container: 'bg-bg sticky top-0 z-10 flex flex-col gap-3 pb-3',
  count: 'text-label text-fg-mute',
  field: 'flex min-w-0 flex-col gap-1',
  fieldLabel: 'text-label text-fg-dim',
  grid: 'grid grid-cols-2 gap-3',
  select: twJoin(
    'border-border bg-bg-elev text-fg text-label w-full rounded-sm border px-3 py-1.5',
    'enabled:hover:bg-bg-elev-2 disabled:text-fg-mute disabled:cursor-default',
    colorTransition,
    focusRing
  ),
};

type Props = {
  /** Live per-type totals for the option labels, from `countEventsByType`. */
  counts: Record<GaiaEventType, number>;
  /** Loading (DESIGN-SPEC C-10, state L). Never render an enabled sort
   * control over data that has not loaded. */
  disabled?: boolean;
  filter: EventFilterId;
  onFilterChange: (next: EventFilterId) => void;
  onSortChange: (next: EventSortId) => void;
  sort: EventSortId;
  /** How many events survive the current filter; the count line's figure. */
  visibleCount: number;
};

const sortLabelFor = (sort: EventSortId): string =>
  EVENT_SORT_OPTIONS.find((option) => option.id === sort)?.label ?? '';

/**
 * The Work tab's filter and sort controls (DESIGN-SPEC C-10): two native
 * `<select>` elements and a count line, in a sticky header.
 *
 * Native selects with `<optgroup>`, never a custom popover. `color-scheme:
 * dark` on `:root` is what makes the native popup match the console, and the
 * native element already carries the keyboard and screen-reader behavior a
 * rebuild would have to re-earn (PRODUCT.md principle 3).
 *
 * The count line is the Work tab's **only** live region (DESIGN-SPEC 11.13):
 * a filter change is otherwise imperceptible to a screen-reader user, while
 * selection changes are user-initiated and the detail panel's heading labels
 * that region. Do not add a second one.
 */
const EventFilters: FC<Props> = ({
  counts,
  disabled = false,
  filter,
  onFilterChange,
  onSortChange,
  sort,
  visibleCount,
}) => {
  // Read through a `Map`: `counts` is built at runtime by the caller, and a
  // `Map` cannot resolve a key to an inherited `Object.prototype` member.
  const tally = new Map<string, number>(Object.entries(counts));
  const countFor = (type: GaiaEventType): number => tally.get(type) ?? 0;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onFilterChange(resolveFilterId(event.target.value));
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onSortChange(resolveSortId(event.target.value));
  };

  return (
    <div className={eventFiltersClasses.container}>
      <div className={eventFiltersClasses.grid}>
        <label
          className={eventFiltersClasses.field}
          htmlFor="work-event-filter"
        >
          <span className={eventFiltersClasses.fieldLabel}>Filter</span>
          <select
            className={eventFiltersClasses.select}
            disabled={disabled}
            id="work-event-filter"
            onChange={handleFilterChange}
            value={filter}
          >
            {disabled ?
              <option value={filter}>{filterLabelFor(filter)}</option>
            : <>
                <option value="all">
                  {ALL_EVENTS_LABEL} ({total})
                </option>
                {FILTER_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.types.map((type) => (
                      <option
                        key={type}
                        disabled={countFor(type) === 0}
                        value={type}
                      >
                        {EVENT_LABELS[type]} ({countFor(type)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </>
            }
          </select>
        </label>
        <label className={eventFiltersClasses.field} htmlFor="work-event-sort">
          <span className={eventFiltersClasses.fieldLabel}>Sort</span>
          <select
            className={eventFiltersClasses.select}
            disabled={disabled}
            id="work-event-sort"
            onChange={handleSortChange}
            value={sort}
          >
            {disabled ?
              <option value={sort}>{sortLabelFor(sort)}</option>
            : EVENT_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))
            }
          </select>
        </label>
      </div>
      <p aria-live="polite" className={eventFiltersClasses.count}>
        {visibleCount} events
      </p>
    </div>
  );
};

export default EventFilters;
