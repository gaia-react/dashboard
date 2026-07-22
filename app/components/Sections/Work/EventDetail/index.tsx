import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import AuditSection from '~/components/Sections/Work/EventDetail/AuditSection';
import ChartSections, {
  chartGridClass,
} from '~/components/Sections/Work/EventDetail/ChartSections';
import {
  agentMix,
  auditBlocks,
  detailSections,
  entryPhases,
  eventFigures,
  linkedSessionRefs,
  modelMix,
  runIdOf,
} from '~/components/Sections/Work/EventDetail/detail-model';
import DetailHeader from '~/components/Sections/Work/EventDetail/DetailHeader';
import LinkedSessions from '~/components/Sections/Work/EventDetail/LinkedSessions';
import MetricStrip, {
  METRIC_LABELS,
  metricItemClass,
  metricStripClass,
  metricValueClass,
} from '~/components/Sections/Work/EventDetail/MetricStrip';
import PanelSection from '~/components/Sections/Work/EventDetail/PanelSection';
import PhaseSection from '~/components/Sections/Work/EventDetail/PhaseSection';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import Skeleton, {shimmer} from '~/components/Skeleton';
import type {SessionSummary} from '~/data/schemas/api';

/**
 * One `bg-elev` surface with one border, divided into flat sections by
 * hairlines. Shared with the skeleton so the two shells are provably
 * identical.
 */
export const panelShellClass = 'border-border bg-bg-elev rounded-md border';

export type EventDetailProps = {
  event: GaiaEvent;
  /** Navigates to the Sessions tab, targeting one session. */
  onViewSession?: (sessionId: string) => void;
  /**
   * Lifted session lookup, built once by the caller. Undefined while
   * `/api/activity` has not resolved: rows render a skeleton rather than
   * blocking the whole panel on the slower resource.
   */
  sessionsById?: Map<string, SessionSummary>;
};

/**
 * The right pane of the Work console (DESIGN-SPEC 5, C-17): one surface that
 * explains the selected event, whatever kind it is.
 *
 * The `id` is load-bearing. Every card in the event list carries
 * `aria-controls="event-detail"`, and `aria-labelledby` points at the
 * header's `<h2>`. There is deliberately no live region here (DESIGN-SPEC
 * 11.13) and deliberately no transition on the swap (DESIGN-SPEC 8):
 * selection changes on every arrow key, so a fade would fight rapid browsing
 * and an announcement per keypress would be noise.
 *
 * `event` is not optional. The "no selection" state is only reachable when
 * the list itself is empty, and the shell owns it (DESIGN-SPEC 7.2).
 *
 * Which sections appear is `detail-model.ts`'s decision, not this file's.
 * Rows that can be empty render their empty state; rows that can never apply
 * to this event type are not rendered at all, because an empty section is a
 * statement about this event while an inapplicable one is noise.
 */
const EventDetail: FC<EventDetailProps> = ({
  event,
  onViewSession,
  sessionsById,
}) => {
  const sections = detailSections(event);

  return (
    <section
      aria-labelledby="event-detail-heading"
      className={panelShellClass}
      id="event-detail"
    >
      <DetailHeader event={event} />
      <PanelSection>
        <MetricStrip figures={eventFigures(event)} />
      </PanelSection>
      {sections.modelAndAgentCharts && (
        <ChartSections agentMix={agentMix(event)} modelMix={modelMix(event)} />
      )}
      {sections.phaseBars && <PhaseSection phases={entryPhases(event)} />}
      {sections.auditBlock && (
        <AuditSection
          blocks={auditBlocks(event)}
          entryType={event.type === 'spec' ? 'spec' : 'plan'}
        />
      )}
      <LinkedSessions
        onViewSession={onViewSession}
        references={linkedSessionRefs(event)}
        runId={sections.runIdRow ? runIdOf(event) : undefined}
        sessionsById={sessionsById}
      />
    </section>
  );
};

/**
 * The panel's loading state (DESIGN-SPEC 7.2, 7.3): the same shell, the same
 * section hairlines, a three-value metric strip at the real strip's
 * dimensions, and two chart-sized blocks, so the swap to real content causes
 * zero layout shift. Never a spinner in the middle of content.
 *
 * Text placeholders use the transparent-text technique over strings the same
 * length as the real ones; `aria-hidden` keeps those placeholders away from
 * assistive tech, which the enclosing `AsyncSection` announces for.
 */
export const EventDetailSkeleton: FC = () => (
  <section
    aria-hidden={true}
    className={panelShellClass}
    data-testid="event-detail-skeleton"
  >
    <PanelSection>
      <Skeleton className="h-6 w-28" />
      <div>
        <p className={twJoin('text-title font-mono', shimmer)}>SPEC-000</p>
        <p className={twJoin('text-body mt-1', shimmer)}>
          Loading the selected event
        </p>
        <p
          className={twJoin('text-label mt-2 font-mono tabular-nums', shimmer)}
        >
          Started Jan 1, 2026, 12:00 PM
        </p>
      </div>
    </PanelSection>
    <PanelSection>
      <dl className={metricStripClass} data-testid="metric-strip">
        {METRIC_LABELS.map((label) => (
          <div key={label} className={metricItemClass}>
            <dt className={twJoin('text-label', shimmer)}>{label}</dt>
            <dd className={twJoin(metricValueClass, shimmer)}>$000.00</dd>
          </div>
        ))}
      </dl>
    </PanelSection>
    <PanelSection className={chartGridClass}>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </PanelSection>
  </section>
);

export default EventDetail;
