import {render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import EventDetail, {
  EventDetailSkeleton,
} from '~/components/Sections/Work/EventDetail';
import {
  METRIC_LABELS,
  metricStripClass,
} from '~/components/Sections/Work/EventDetail/MetricStrip';
import {panelSectionClass} from '~/components/Sections/Work/EventDetail/PanelSection';
import {
  bareCommand,
  debtCommand,
  emptyJoin,
  hasAriaLiveDescendant,
  joined,
  plan004,
  plan009,
  review,
  roundedMdDescendants,
  spec018,
  spec032,
  stripLabels,
  stripValueNodes,
  stripValues,
} from '~/components/Sections/Work/EventDetail/tests/detail-fixtures';
import {NO_DATA_LABEL} from '~/data/format/units';

/**
 * The `[data-testid="panel-section"]` element that itself contains an
 * element carrying `testId`, e.g. finding the shared chart section without
 * raw `.parentElement` traversal (only testing-library's own `within` walks
 * the tree here).
 */
const findSectionContaining = (
  sections: HTMLElement[],
  testId: string
): HTMLElement => {
  const found = sections.find((section) =>
    within(section).queryByTestId(testId)
  );

  if (found === undefined) {
    throw new Error(`no panel-section contains ${testId}`);
  }

  return found;
};

test('a spec entry renders every section DESIGN-SPEC 5.4 gives it', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  expect(
    screen.getByRole('heading', {level: 2, name: 'SPEC-032'})
  ).toBeInTheDocument();
  expect(screen.getAllByTestId('metric-strip')[0]).toBeInTheDocument();
  expect(screen.getByTestId('model-mix-section')).toBeInTheDocument();
  expect(screen.getByTestId('agent-type-section')).toBeInTheDocument();
  expect(screen.getByTestId('phase-cost-bar')).toBeInTheDocument();
  expect(screen.getByTestId('phase-elapsed-bar')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {name: 'Adversarial audit'})
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {name: 'Linked sessions'})
  ).toBeInTheDocument();
  // Run id is a command-event row; an entry has none.
  expect(screen.queryByTestId('run-id-row')).not.toBeInTheDocument();
});

test('a command event gets the charts and the run id, never phases or an audit', () => {
  render(<EventDetail event={debtCommand} sessionsById={emptyJoin} />);

  expect(screen.getByTestId('model-mix-section')).toBeInTheDocument();
  expect(screen.getByTestId('agent-type-section')).toBeInTheDocument();
  expect(screen.getByTestId('run-id-row')).toHaveTextContent(
    'gaia-debt-20260715T114955Z-7b0a'
  );
  expect(screen.queryByTestId('phase-cost-bar')).not.toBeInTheDocument();
  expect(screen.queryByTestId('phase-elapsed-bar')).not.toBeInTheDocument();
  expect(screen.queryByText('Adversarial audit')).not.toBeInTheDocument();
  // Not rendered as an empty state either: a section that can never apply is
  // absent, not empty.
  expect(screen.queryByText('No adversarial audit')).not.toBeInTheDocument();
  expect(screen.queryByText('No phase breakdown')).not.toBeInTheDocument();
});

test('an ad-hoc review renders no donut, no agent bars, and no empty state standing in for them', () => {
  render(<EventDetail event={review} sessionsById={emptyJoin} />);

  expect(screen.getByTestId('metric-strip')).toBeInTheDocument();
  expect(screen.queryByTestId('model-mix-section')).not.toBeInTheDocument();
  expect(screen.queryByTestId('agent-type-section')).not.toBeInTheDocument();
  expect(screen.queryByText('No model breakdown')).not.toBeInTheDocument();
  expect(screen.queryByText('No agent-type breakdown')).not.toBeInTheDocument();
  expect(screen.queryByTestId('chart-empty')).not.toBeInTheDocument();
  expect(screen.queryByTestId('phase-cost-bar')).not.toBeInTheDocument();
  expect(screen.queryByTestId('run-id-row')).not.toBeInTheDocument();
  expect(screen.getAllByTestId('linked-session-row')).toHaveLength(1);
});

test('the donut and the agent bars share one section, two-up only at xl', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  const sections = screen.getAllByTestId('panel-section');
  const chartSection = findSectionContaining(sections, 'model-mix-section');

  expect(
    within(chartSection).getByTestId('agent-type-section')
  ).toBeInTheDocument();
  expect(chartSection).toHaveClass('xl:grid', 'xl:grid-cols-2', 'xl:gap-8');
  // No unconditional grid: below xl the two stack.
  expect(chartSection).not.toHaveClass('grid');
});

test('the metric strip is exactly three values, in the order Cost, Elapsed, Total tokens', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  const [strip] = screen.getAllByTestId('metric-strip');

  expect(stripLabels(strip)).toEqual([...METRIC_LABELS]);
  expect(stripValues(strip)).toEqual(['$12.34', '1h 30m', '4.2M']);
});

test('a missing figure renders the no-data dash, never a zero', () => {
  render(<EventDetail event={plan004} sessionsById={emptyJoin} />);

  const strip = screen.getByTestId('metric-strip');

  expect(stripValues(strip)).toEqual([NO_DATA_LABEL, NO_DATA_LABEL, '320K']);
  expect(strip).not.toHaveTextContent('$0.00');
  expect(strip).not.toHaveTextContent('0m');
  // A dash steps down in tone rather than reading as a recorded figure.
  const values = stripValueNodes(strip);

  expect(values[0]).toHaveClass('text-fg-mute');
  expect(values[2]).toHaveClass('text-fg');
});

test('the header states what the event is, what it is called, and when it started', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  expect(screen.getByTestId('type-chip')).toHaveTextContent('Spec');
  // The tone icon at size 20 plus the chip's own icon (DESIGN-SPEC 5.1).
  expect(screen.getAllByTestId('icon-spec')).toHaveLength(2);
  expect(
    screen.getByText('Audit cost tracking and the recorded-spend drill-down.')
  ).toBeInTheDocument();
  expect(screen.getByText(/^Started /u)).toBeInTheDocument();
  expect(
    within(screen.getByTestId('detail-qualifiers')).getByText('Merged')
  ).toBeInTheDocument();
});

test('an incomplete entry flags itself, and a command carries no ledger status', () => {
  const {unmount} = render(
    <EventDetail event={plan004} sessionsById={emptyJoin} />
  );

  expect(screen.getByText('Partial')).toBeInTheDocument();
  unmount();

  render(<EventDetail event={bareCommand} sessionsById={emptyJoin} />);
  // Command events have no ledger status ever, so no dash reports one.
  expect(screen.queryByTestId('detail-qualifiers')).not.toBeInTheDocument();
});

test('the intensity badge is a spec-with-audit affordance only', () => {
  const {unmount} = render(
    <EventDetail event={spec032} sessionsById={joined} />
  );

  expect(screen.getByTestId('intensity-badge')).toHaveTextContent('Deep');
  unmount();

  // Plan audits carry `intensity: null`.
  const view = render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  expect(screen.queryByTestId('intensity-badge')).not.toBeInTheDocument();
  view.unmount();

  render(<EventDetail event={spec018} sessionsById={emptyJoin} />);
  expect(screen.queryByTestId('intensity-badge')).not.toBeInTheDocument();
});

test('the panel is one region, labelled by its heading and addressable by the list', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  const panel = screen.getByRole('region', {name: 'SPEC-032'});

  expect(panel).toHaveAttribute('id', 'event-detail');
  expect(panel).toHaveClass(
    'rounded-md',
    'border',
    'border-border',
    'bg-bg-elev'
  );
});

test('the panel is one surface: no nested card, no side stripe', () => {
  const {container} = render(
    <EventDetail event={spec032} sessionsById={joined} />
  );
  const panel = screen.getByRole('region', {name: 'SPEC-032'});

  // `rounded-md` is the card/panel radius; nothing inside the panel may be
  // one, because a bordered box inside a bordered box is a nested card.
  expect(roundedMdDescendants(panel)).toHaveLength(0);
  expect(container.innerHTML).not.toContain('border-l-2');
  expect(container.innerHTML).not.toContain('border-r-2');
});

test('the panel carries no eyebrow vocabulary and no bucket vocabulary', () => {
  const {container} = render(
    <EventDetail event={spec032} sessionsById={joined} />
  );

  expect(container.innerHTML).not.toContain('uppercase');
  expect(container.innerHTML).not.toContain('tracking-[');

  for (const banned of [
    'Fresh input',
    'Cache write',
    'Cache read',
    'cacheRead',
    'outputByModel',
  ]) {
    expect(container.innerHTML).not.toContain(banned);
  }
});

test('selection is not announced: the heading labels the region instead', () => {
  const {container} = render(
    <EventDetail event={spec032} sessionsById={joined} />
  );

  expect(hasAriaLiveDescendant(container)).toBe(false);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('the skeleton reuses the panel shell and the same section hairlines', () => {
  const view = render(<EventDetail event={spec032} sessionsById={joined} />);
  const realShellClass = screen.getByRole('region', {
    name: 'SPEC-032',
  }).className;
  const realSectionClass = screen.getAllByTestId('panel-section')[0].className;
  const realStripClass = screen.getAllByTestId('metric-strip')[0].className;

  view.unmount();

  render(<EventDetailSkeleton />);
  const shell = screen.getByTestId('event-detail-skeleton');
  const sections = screen.getAllByTestId('panel-section');

  expect(shell).toHaveClass(realShellClass, {exact: true});
  expect(sections.length).toBeGreaterThanOrEqual(3);
  expect(sections[0]).toHaveClass(realSectionClass, {exact: true});
  expect(sections[0]).toHaveClass(panelSectionClass, {exact: true});

  for (const section of sections) {
    expect(section.className).toContain('border-b');
    expect(section.className).toContain('border-border-soft');
  }

  const strip = screen.getByTestId('metric-strip');

  expect(strip).toHaveClass(realStripClass, {exact: true});
  expect(strip).toHaveClass(metricStripClass, {exact: true});
  expect(stripLabels(strip)).toEqual([...METRIC_LABELS]);
});

test('the skeleton is hidden from assistive tech and shows no spinner', () => {
  const {container} = render(<EventDetailSkeleton />);

  expect(screen.getByTestId('event-detail-skeleton')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  expect(container.innerHTML).not.toContain('animate-spin');
  expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
});
