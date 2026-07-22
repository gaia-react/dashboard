import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import EventDetail from '~/components/Sections/Work/EventDetail';
import {
  bareCommand,
  debtCommand,
  emptyJoin,
  joined,
  MISSING_LOG_SESSION_ID,
  plan004,
  plan009,
  plan010,
  spec018,
  spec032,
  SPEC_SESSION_ID,
  stripValues,
} from '~/components/Sections/Work/EventDetail/tests/detail-fixtures';
import {NO_DATA_LABEL} from '~/data/format/units';

test('the fixed-width agent bars scroll inside their own box, never sideways off the page', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  const chart = screen.getByLabelText('Tokens by agent type');

  // The chart's own wrapper is `relative inline-block`; the scroll box is the
  // one this panel puts around it.
  expect(screen.getByTestId('agent-type-scroll')).toHaveClass(
    'w-full',
    'overflow-x-auto'
  );
  expect(chart).toHaveAttribute('width', '420');
});

test('an entry whose every phase has a null byModel renders the donut empty state, not an empty ring', () => {
  render(<EventDetail event={plan004} sessionsById={emptyJoin} />);

  expect(screen.getByText('No model breakdown')).toBeInTheDocument();
  expect(
    screen.getByText(
      'This event was reconstructed from the backfill, which records total cost but not which models did the work.'
    )
  ).toBeInTheDocument();
  expect(screen.getByText('No agent-type breakdown')).toBeInTheDocument();
  expect(
    screen.getByText(
      'This event was reconstructed from the backfill, which records total cost but not which agents did the work.'
    )
  ).toBeInTheDocument();
  expect(
    screen.queryByTestId('donut-accessible-summary')
  ).not.toBeInTheDocument();
});

test('exactly one model renders a single segment naming the model, never a donut', () => {
  render(<EventDetail event={spec018} sessionsById={emptyJoin} />);

  const bar = screen.getByTestId('single-series-bar');

  expect(bar).toHaveTextContent('Claude Sonnet 4.6');
  expect(bar).toHaveTextContent('100%');
  expect(bar).toHaveTextContent('1.1M');
  expect(
    screen.queryByTestId('donut-accessible-summary')
  ).not.toBeInTheDocument();
});

test('an entry with no phases reports it once rather than twice', () => {
  render(<EventDetail event={spec018} sessionsById={emptyJoin} />);

  // SPEC-018 has one phase, so both bars render; the zero-phase copy is not
  // reachable here. What must not happen is the section vanishing.
  expect(screen.getByTestId('phase-cost-bar')).toBeInTheDocument();
  expect(screen.getByTestId('phase-elapsed-bar')).toBeInTheDocument();
  expect(screen.queryByText('No phase breakdown')).not.toBeInTheDocument();
});

test('the elapsed-share bar names elapsed time in its null-phase footnote, never cost', () => {
  // PLAN-009 has no spec phase at all (only plan and execute), and its
  // execute phase carries a null recordedDollars but a real durationSeconds.
  // So: the cost bar's null keys are spec (absent) and execute (null cost);
  // the elapsed bar's null key is spec alone (plan and execute both recorded
  // elapsed time). If SegmentedBar's footnote hardcoded "cost" regardless of
  // which measure it plots, the elapsed bar would wrongly say "Spec phase
  // recorded no cost" here.
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  const costBar = screen.getByTestId('phase-cost-bar');
  const elapsedBar = screen.getByTestId('phase-elapsed-bar');

  expect(
    within(costBar).getByText(/Spec phase recorded no cost/u)
  ).toBeInTheDocument();
  expect(
    within(costBar).getByText(/Execute phase recorded no cost/u)
  ).toBeInTheDocument();

  expect(
    within(elapsedBar).getByText(/Spec phase recorded no elapsed time/u)
  ).toBeInTheDocument();
  expect(
    within(elapsedBar).queryByText(/recorded no cost/u)
  ).not.toBeInTheDocument();
});

test('an entry with no audit on any phase renders the explicit no-audit state', () => {
  render(<EventDetail event={spec018} sessionsById={emptyJoin} />);

  expect(screen.getByText('No adversarial audit')).toBeInTheDocument();
  expect(
    screen.getByText(
      'This spec ran without an adversarial audit pass. When one runs, its cost, elapsed time, and the lenses it applied appear here.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('the no-audit copy names the kind it is talking about', () => {
  render(<EventDetail event={plan004} sessionsById={emptyJoin} />);

  expect(
    screen.getByText(
      'This plan ran without an adversarial audit pass. When one runs, its cost, elapsed time, and the lenses it applied appear here.'
    )
  ).toBeInTheDocument();
});

test('a spec audit resolves COV to the spec name, never the bare acronym', () => {
  render(<EventDetail event={spec032} sessionsById={joined} />);

  const lenses = screen.getByTestId('lens-list');

  expect(
    within(lenses).getByText('Coverage & consistency')
  ).toBeInTheDocument();
  expect(within(lenses).getByText('Factual grounding')).toBeInTheDocument();
  expect(within(lenses).getByText('Security')).toBeInTheDocument();
  expect(screen.queryByText('COV')).not.toBeInTheDocument();
});

test('a plan audit resolves the same COV acronym to the plan name', () => {
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  expect(screen.getByText('SPEC coverage')).toBeInTheDocument();
  expect(
    screen.getByText('Decomposition & dependency soundness')
  ).toBeInTheDocument();
  expect(screen.queryByText('COV')).not.toBeInTheDocument();
  expect(screen.queryByText('Coverage & consistency')).not.toBeInTheDocument();
});

test('a lens acronym that collides with Object.prototype renders verbatim', () => {
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  // `lenses` is z.array(z.string()) upstream, so the vocabulary is untrusted.
  // An unmapped acronym falls back to itself, never to an inherited member.
  expect(screen.getByText('constructor')).toBeInTheDocument();
});

test('two audit-carrying phases render two blocks, each naming its own phase', () => {
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  expect(
    screen.getAllByRole('heading', {name: 'Adversarial audit'})
  ).toHaveLength(2);
  expect(screen.getByText('Plan phase')).toBeInTheDocument();
  expect(screen.getByText('Execute phase')).toBeInTheDocument();

  // Each block carries its own figures; the two are never merged. Strip 0 is
  // the entry's own.
  const strips = screen.getAllByTestId('metric-strip');

  expect(stripValues(strips[1])).toEqual(['$0.50', '3m', '120K']);
  expect(stripValues(strips[2])).toEqual(['$0.30', '2m', '80K']);
});

test('the audit-share meter reports a real share when the phase recorded a cost', () => {
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  const meters = screen.getAllByRole('progressbar');

  expect(meters).toHaveLength(1);
  expect(meters[0]).toHaveAttribute('aria-valuenow', '25');
  expect(meters[0]).toHaveAttribute(
    'aria-valuetext',
    '25 percent of phase cost'
  );
});

test('a null phase cost renders the meter empty state, never a 0% meter', () => {
  render(<EventDetail event={plan009} sessionsById={emptyJoin} />);

  expect(screen.getByText('Audit share not available')).toBeInTheDocument();
  expect(
    screen.getByText(
      "The enclosing phase recorded no cost, so the audit's share of it cannot be computed. The audit itself cost $0.30."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
});

test('a real, measured zero phase cost also renders the meter empty state, never a 0% meter', () => {
  // PLAN-010's one phase recorded recordedDollars: 0 (a real measurement,
  // not a missing figure) alongside an audit that cost $0.25. If AuditBlock
  // or Gauge ever treated phaseDollars === 0 as a computable share instead
  // of routing it through the empty branch, this would render a 0% meter
  // (technically true, but banned: DESIGN-SPEC 7.4 says phase dollars null
  // OR 0 both render the empty state) instead of the explanatory copy.
  render(<EventDetail event={plan010} sessionsById={emptyJoin} />);

  expect(screen.getByText('Audit share not available')).toBeInTheDocument();
  expect(
    screen.getByText(
      "The enclosing phase recorded no cost, so the audit's share of it cannot be computed. The audit itself cost $0.25."
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
});

test('a command event carries its artifact link in the header and its run id below', () => {
  render(<EventDetail event={debtCommand} sessionsById={emptyJoin} />);

  const link = screen.getByRole('link', {name: /PR #769/u});

  expect(link).toHaveAttribute(
    'href',
    'https://github.com/gaia-react/gaia/pull/769'
  );
  expect(screen.getByTestId('detail-qualifiers')).toContainElement(link);
  expect(screen.getByTestId('run-id-row')).toHaveTextContent('Run id');
});

test('a command with no github renders neither a link nor a broken href', () => {
  render(<EventDetail event={bareCommand} sessionsById={emptyJoin} />);

  const outbound = screen
    .queryAllByRole('link')
    .filter((node) => node.getAttribute('href')?.startsWith('https://'));

  expect(outbound).toEqual([]);
  expect(screen.queryByTestId('detail-qualifiers')).not.toBeInTheDocument();
  // The run id row still renders, reporting the gap rather than vanishing.
  expect(screen.getByTestId('run-id-row')).toHaveTextContent(
    `Run id${NO_DATA_LABEL}`
  );
});

test('session rows hold their height while /api/activity is still in flight', () => {
  render(<EventDetail event={spec032} />);

  // One session has logFound true (skeleton), the other false (no log will
  // ever arrive, so it renders its badge immediately).
  expect(screen.getAllByTestId('linked-session-skeleton')).toHaveLength(1);
  expect(screen.getByText('Log missing')).toBeInTheDocument();
  expect(screen.getByText(MISSING_LOG_SESSION_ID)).toBeInTheDocument();
});

test('a resolved activity response that misses the id falls back to the raw id, with no link and no error', () => {
  render(<EventDetail event={spec032} sessionsById={emptyJoin} />);

  expect(
    screen.queryByTestId('linked-session-skeleton')
  ).not.toBeInTheDocument();
  expect(screen.getByText(SPEC_SESSION_ID)).toBeInTheDocument();
  expect(
    screen.queryByRole('link', {name: 'View in sessions'})
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a joined session renders its title, duration, and an in-app jump link', () => {
  const onViewSession = vi.fn();

  render(
    <EventDetail
      event={spec032}
      onViewSession={onViewSession}
      sessionsById={joined}
    />
  );

  expect(screen.getByText('Draft the audit cost contract')).toBeInTheDocument();
  expect(screen.getByText('30m')).toBeInTheDocument();

  const link = screen.getByRole('link', {name: 'View in sessions'});

  expect(link).toHaveAttribute('href', `?tab=sessions&id=${SPEC_SESSION_ID}`);

  // fireEvent.click returns false when the handler called preventDefault: the
  // jump navigates in-app rather than reloading the page.
  expect(fireEvent.click(link)).toBe(false);
  expect(onViewSession).toHaveBeenCalledWith(SPEC_SESSION_ID);
});

test('an event with no sessions teaches why, rather than showing a blank region', () => {
  render(<EventDetail event={plan004} sessionsById={emptyJoin} />);

  expect(screen.getByText('No linked sessions')).toBeInTheDocument();
  expect(
    screen.getByText(
      'The ledger recorded this event without a session id, so there is no transcript to link.'
    )
  ).toBeInTheDocument();
});
