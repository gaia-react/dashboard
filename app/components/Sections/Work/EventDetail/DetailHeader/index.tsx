import type {FC} from 'react';
import Icon from '~/components/Icon';
import ArtifactLink from '~/components/Sections/Work/ArtifactLink';
import {EVENT_ICONS, EVENT_TONES} from '~/components/Sections/Work/event-meta';
import {auditIntensity} from '~/components/Sections/Work/EventDetail/detail-model';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import PartialBadge from '~/components/Sections/Work/PartialBadge';
import StatusText from '~/components/Sections/Work/StatusText';
import TypeChip from '~/components/Sections/Work/TypeChip';
import {formatLabel} from '~/data/format/labels';
import {formatDateTime} from '~/data/format/units';

/**
 * The audit intensity setting (DESIGN-SPEC C-20). Neutral, never toned:
 * intensity is a setting, not a category, and every one of the nine hues is
 * already spoken for by the event scale. Panel-only, so it does not belong in
 * the shared parts K3 owns.
 */
const IntensityBadge: FC<{intensity: string}> = ({intensity}) => (
  <span
    className="border-border-soft text-fg-dim text-label inline-block rounded-sm border px-1.5 py-0.5"
    data-testid="intensity-badge"
  >
    {formatLabel(intensity)}
  </span>
);

type Props = {
  event: GaiaEvent;
};

/**
 * The first `PanelSection` (DESIGN-SPEC 5.1): what this event is, then what
 * it is called, then when it started, then whatever qualifiers it carries.
 *
 * The panel's `aria-labelledby` points at this `<h2>`. There is no live
 * region anywhere in the panel (DESIGN-SPEC 11.13): selection is
 * user-initiated and the heading labels the region, so announcing on every
 * arrow-key press would be noise.
 *
 * `StatusText` renders only for cost entries. Command events and ad-hoc
 * reviews have no ledger status ever (DESIGN-SPEC 7.4), so a dash there would
 * report a gap in data that does not exist.
 */
const DetailHeader: FC<Props> = ({event}) => {
  const {artifact, at, label, source, status, title, type} = event;
  const tone = EVENT_TONES[type];
  const intensity = auditIntensity(event);
  const isEntry = source.kind === 'entry';
  const partial = source.kind === 'entry' && source.value.partial;
  const hasQualifiers = isEntry || artifact !== null;

  return (
    <PanelSection>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={tone.icon} name={EVENT_ICONS[type]} size={20} />
        <TypeChip tone={tone} type={type} />
        {intensity !== null && <IntensityBadge intensity={intensity} />}
      </div>
      <div>
        <h2 className="text-title text-fg font-mono" id="event-detail-heading">
          {label}
        </h2>
        <p className="text-body text-fg-dim mt-1">{title}</p>
        <p className="text-label text-fg-mute mt-2 font-mono tabular-nums">
          Started {formatDateTime(at)}
        </p>
      </div>
      {hasQualifiers && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
          data-testid="detail-qualifiers"
        >
          {isEntry && <StatusText status={status} />}
          {artifact !== null && <ArtifactLink artifact={artifact} />}
          {partial && <PartialBadge />}
        </div>
      )}
    </PanelSection>
  );
};

export default DetailHeader;
