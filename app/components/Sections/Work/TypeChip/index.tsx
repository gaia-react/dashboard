import type {FC} from 'react';
import Icon from '~/components/Icon';
import type {EventTone} from '~/components/Sections/Work/event-meta';
import {
  EVENT_ICONS,
  EVENT_LABELS,
  EVENT_TONES,
} from '~/components/Sections/Work/event-meta';
import type {GaiaEventType} from '~/components/Sections/Work/events';

type Props = {
  /** Defaults to the type's own tone; the card passes the tone it already
   * resolved rather than looking it up twice. */
  tone?: EventTone;
  type: GaiaEventType;
};

/**
 * The event type marker (DESIGN-SPEC C-13): icon plus word, in the type's
 * tone. Read-only and never clickable; if something needs to be actionable it
 * is a `<button>`, not a chip.
 *
 * The 1px `border-border-soft` is required, not decoration. A selected card
 * sits at `bg-elev-2` and so does this chip, so without the hairline the chip
 * vanishes the moment its card is selected.
 *
 * The label is what makes the tone redundant rather than load-bearing: colour
 * never carries meaning alone (PRODUCT.md principle 4).
 */
const TypeChip: FC<Props> = ({tone, type}) => {
  const resolved = tone ?? EVENT_TONES[type];

  return (
    <span
      className="border-border-soft bg-bg-elev-2 text-label inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5"
      data-testid="type-chip"
    >
      <Icon className={resolved.icon} name={EVENT_ICONS[type]} size={14} />
      <span className={resolved.chipText}>{EVENT_LABELS[type]}</span>
    </span>
  );
};

export default TypeChip;
