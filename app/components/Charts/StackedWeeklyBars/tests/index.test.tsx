import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {formatWeekLabel} from '~/components/Charts/date-helpers';
import type {WeeklyStackDatum} from '~/components/Charts/StackedWeeklyBars';
import StackedWeeklyBars from '~/components/Charts/StackedWeeklyBars';

const SEVEN_WEEK_KEYS = [
  '2026-06-01',
  '2026-06-08',
  '2026-06-15',
  '2026-06-22',
  '2026-06-29',
  '2026-07-06',
  '2026-07-13',
];
const sevenWeeks: WeeklyStackDatum[] = SEVEN_WEEK_KEYS.map((week, index) => ({
  values: {alpha: index + 1},
  week,
}));

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
const fixturePath = path.join(
  process.cwd(),
  'test/fixtures/charts/weekly-stacks.json'
);
const weeklyStacks = JSON.parse(
  readFileSync(fixturePath, 'utf8')
) as WeeklyStackDatum[];

const renderChart = (): void => {
  render(<StackedWeeklyBars data={weeklyStacks} locale="en-US" />);
};

test('past eight series the tail folds into an "Other" legend entry', () => {
  renderChart();

  // 9 fixture series collapse to 7 named + Other.
  expect(screen.getAllByRole('listitem')).toHaveLength(8);
  expect(screen.getByText('Other')).toBeInTheDocument();
  expect(screen.queryByText('hotel')).not.toBeInTheDocument();
  expect(screen.queryByText('india')).not.toBeInTheDocument();
});

test('renders one week band per datum with stacked, gapped segments', () => {
  renderChart();

  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(4);
  expect(
    screen.getByRole('graphics-symbol', {name: 'Week of Jun 7: 300 total'})
  ).toBeInTheDocument();

  // Zero-value series render no segment: weeks carry 7, 6, 6, and 5 marks.
  expect(screen.getAllByTestId(/^stack-segment-/u)).toHaveLength(24);

  // Colors follow the palette order by series total, "other" wears a neutral.
  expect(screen.getByTestId('stack-segment-2026-06-07-alpha')).toHaveClass(
    'fill-accent'
  );
  expect(screen.getByTestId('stack-segment-2026-06-07-other')).toHaveClass(
    'fill-fg-mute'
  );
  expect(screen.getByTestId('stack-segment-2026-06-07-alpha')).toHaveClass(
    'motion-reduce:transition-none'
  );
});

test('draws clean y ticks and week labels on the band axis', () => {
  renderChart();

  expect(screen.getByText('200')).toBeInTheDocument();
  expect(screen.getByText('Jun 14')).toBeInTheDocument();
});

test('hovering a week shows one tooltip listing every series at that x', () => {
  renderChart();

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: 'Week of Jun 7: 300 total'})
  );

  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Week of Jun 7');
  expect(within(tooltip).getByText('alpha')).toBeInTheDocument();
  expect(within(tooltip).getByText('echo')).toBeInTheDocument();
  expect(within(tooltip).getByText('Other')).toBeInTheDocument();
  expect(within(tooltip).getByText('100')).toBeInTheDocument();
});

test('a keyboard-only user can reach and trigger the same tooltip via focus', () => {
  renderChart();

  const week = screen.getByRole('graphics-symbol', {
    name: 'Week of Jun 7: 300 total',
  });

  expect(week).toHaveAttribute('tabindex', '0');

  fireEvent.focus(week);
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Week of Jun 7');

  fireEvent.blur(week);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('tick and week-label text is text-label, never the legacy arbitrary size', () => {
  renderChart();

  expect(screen.getByText('200')).toHaveClass('text-label');
  expect(screen.getByText('Jun 14')).toHaveClass('text-label');
});

test('the left margin gets extra room so 13px tick labels do not collide', () => {
  renderChart();

  // LEFT_MARGIN 56, tick text sits at LEFT_MARGIN - 6.
  expect(screen.getByText('200')).toHaveAttribute('x', '50');
});

test('segment opacity transitions carry ease-out via the shared constant', () => {
  renderChart();

  expect(screen.getByTestId('stack-segment-2026-06-07-alpha')).toHaveClass(
    'ease-out'
  );
});

test('past six visible weeks, week labels thin to every other week', () => {
  render(<StackedWeeklyBars data={sevenWeeks} locale="en-US" />);

  // 7 weeks, MAX_WEEK_LABELS 6: ceil(7/6) = 2, so labels show at indices
  // 0, 2, 4, 6 (four labels), not all seven.
  const shownLabels = SEVEN_WEEK_KEYS.filter(
    (_week, index) => index % 2 === 0
  ).map((week) => formatWeekLabel(week, 'en-US'));
  const hiddenLabels = SEVEN_WEEK_KEYS.filter(
    (_week, index) => index % 2 !== 0
  ).map((week) => formatWeekLabel(week, 'en-US'));

  for (const label of shownLabels) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }

  for (const label of hiddenLabels) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});
