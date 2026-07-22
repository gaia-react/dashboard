import type {FC} from 'react';
import {formatLabel} from '~/data/format/labels';
import {NO_DATA_LABEL} from '~/data/format/units';

type Props = {
  status: null | string;
};

/**
 * The ledger status on a card or panel header (DESIGN-SPEC C-14).
 *
 * **Status is never colored.** `merged`, `ready`, `archived`, and `abandoned`
 * all render in `fg-dim`. Color in this system is the categorical event
 * encoding; a second semantic color axis on the same card would make both
 * harder to read. The one exception is `PartialBadge`, which flags a
 * data-quality caveat rather than a status.
 *
 * A `null` status renders the dash in the SAME `fg-dim`, not `fg-mute`: a
 * card raises to `bg-elev-2` on hover and when selected, where `fg-mute`
 * measures 4.15:1 and fails AA, and a color that changes with card state
 * would read as a state signal this component does not have.
 */
const StatusText: FC<Props> = ({status}) => (
  <span className="text-label text-fg-dim whitespace-nowrap">
    {status === null ? NO_DATA_LABEL : formatLabel(status)}
  </span>
);

export default StatusText;
