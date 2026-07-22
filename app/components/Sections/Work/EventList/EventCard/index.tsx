import type {FC, Ref} from 'react';
import {twMerge} from 'tailwind-merge';
import Icon from '~/components/Icon';
import {artifactLabel} from '~/components/Sections/Work/ArtifactLink';
import {EVENT_ICONS, EVENT_TONES} from '~/components/Sections/Work/event-meta';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import StatusText from '~/components/Sections/Work/StatusText';
import TypeChip from '~/components/Sections/Work/TypeChip';
import {
  formatDollarsCell,
  formatDuration,
  NO_DATA_LABEL,
} from '~/data/format/units';
import {colorTransition, focusRing} from '~/styles/class-names';

const DATE_SHORT_OPTIONS: Intl.DateTimeFormatOptions = {dateStyle: 'medium'};
const defaultDateShortFormat = new Intl.DateTimeFormat(
  undefined,
  DATE_SHORT_OPTIONS
);

/**
 * A date with no time, for row 4 (DESIGN-SPEC 7.6). The full `formatDateTime`
 * runs about 22 characters and does not fit a 20rem card.
 *
 * DESIGN-SPEC 7.6 assigns this formatter to `app/data/format/units.ts` and
 * names W6 as its owner. It did not land there, and `app/data/**` is closed
 * in P3, so it lives here for now. Moving it to `units.ts` verbatim and
 * repointing this import is an integrator change, not a rewrite.
 */
export const formatDateShort = (iso: string, locale?: string): string =>
  (locale === undefined ?
    defaultDateShortFormat
  : new Intl.DateTimeFormat(locale, DATE_SHORT_OPTIONS)
  ).format(new Date(iso));

/**
 * Exported so `EventListSkeleton` can mirror the card box exactly. `surface`
 * deliberately excludes the interactive states: a skeleton card is not
 * hoverable, focusable, or selectable.
 */
export const eventCardClasses = {
  figures:
    'text-label text-fg mt-3 grid grid-cols-[auto_auto_auto] justify-start gap-x-4 font-mono tabular-nums',
  handle: 'text-title text-fg mt-2 block truncate font-mono',
  identity: 'flex items-center gap-2',
  slot: 'text-label text-fg-dim whitespace-nowrap',
  subject: 'text-body text-fg-dim mt-0.5 line-clamp-2 block',
  surface:
    'border-border bg-bg-elev w-full rounded-md border px-4 py-3 text-left',
};

/**
 * `focusRing` carries `rounded-sm` for controls; a card is `rounded-md`, so
 * `twMerge` resolves the pair in favor of whichever comes last. The card
 * radius is declared after it on purpose.
 */
const interactiveCardClass = twMerge(
  focusRing,
  colorTransition,
  eventCardClasses.surface,
  'hover:bg-bg-elev-2 active:bg-bg-elev-2'
);

type Props = {
  event: GaiaEvent;
  /** Drives `aria-current` and the tone border. */
  isSelected: boolean;
  /** The single `tabIndex={0}` of the roving-focus list. Normally the
   * selected card; the first card when nothing is selected yet, so `Tab`
   * can still reach the list. */
  isTabStop: boolean;
  onSelect: (key: string) => void;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * One selectable event (DESIGN-SPEC C-12, section 4). Four rows: identity and
 * state, the handle, the subject, the figures.
 *
 * Three things here look like details and are not:
 *
 * - **Row 4 is a `grid`, not a `flex`.** A null cost and a null duration both
 *   render the dash, so column position is the only thing identifying which
 *   figure is missing, and only a fixed three-track template guarantees
 *   position. Each cell carries its own `sr-only` label so a screen reader
 *   never has to infer it.
 * - **No text on this card uses `fg-mute`.** The card raises to
 *   `bg-elev-2` on hover and when selected, where `fg-mute` measures 4.15:1
 *   and fails AA (DESIGN-SPEC 2.2). Captions use `fg-dim`, figures use `fg`.
 * - **Selection is a full 1px border in the event's tone plus `bg-elev-2`.**
 *   No stripe, no shadow, no scale. Hover deliberately does not move the
 *   border: the tone border is reserved for selection, and moving it on hover
 *   makes hover read as selection.
 *
 * The command row's artifact renders as **text, not a link**. DESIGN-SPEC 4.1
 * names it `ArtifactChip` while C-16 describes `ArtifactLink`; an `<a>` inside
 * a `<button>` is invalid HTML and a nested-interactive defect, so the card
 * names the artifact and the detail panel owns the clickable link. 4 of 33
 * `gaia-debt` rows carry no `github` at all, and those render the dash rather
 * than a disabled or broken link.
 */
const EventCard: FC<Props> = ({
  event,
  isSelected,
  isTabStop,
  onSelect,
  ref,
}) => {
  const tone = EVENT_TONES[event.type];

  const handleClick = (): void => {
    onSelect(event.key);
  };

  return (
    <li>
      <button
        ref={ref}
        aria-controls="event-detail"
        aria-current={isSelected ? 'true' : undefined}
        className={twMerge(
          interactiveCardClass,
          isSelected && tone.border,
          isSelected && 'bg-bg-elev-2'
        )}
        onClick={handleClick}
        tabIndex={isTabStop ? 0 : -1}
        type="button"
      >
        <span className={eventCardClasses.identity}>
          <Icon
            className={tone.icon}
            name={EVENT_ICONS[event.type]}
            size={16}
          />
          <TypeChip tone={tone} type={event.type} />
          <span className="flex-1" />
          {event.source.kind === 'command' ?
            <span
              className={eventCardClasses.slot}
              data-testid="event-artifact"
            >
              {event.artifact === null ?
                NO_DATA_LABEL
              : artifactLabel(event.artifact)}
            </span>
          : <StatusText status={event.status} />}
        </span>
        <span className={eventCardClasses.handle}>{event.label}</span>
        <span className={eventCardClasses.subject}>{event.title}</span>
        <span className={eventCardClasses.figures} data-testid="event-figures">
          <span data-testid="event-figure-started">
            <span className="sr-only">Started </span>
            {formatDateShort(event.at)}
          </span>
          <span data-testid="event-figure-cost">
            <span className="sr-only">Cost </span>
            {formatDollarsCell(event.recordedDollars)}
          </span>
          <span data-testid="event-figure-elapsed">
            <span className="sr-only">Elapsed </span>
            {formatDuration(event.durationSeconds)}
          </span>
        </span>
      </button>
    </li>
  );
};

export default EventCard;
