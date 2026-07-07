import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import PeriodSpendBars from '~/components/Charts/PeriodSpendBars';
import type {PeriodBarDatum} from '~/components/Charts/PeriodSpendBars';

const data: PeriodBarDatum[] = [
  {periodStart: '2026-06-08', value: 10},
  {periodStart: '2026-06-15', value: 0},
  {periodStart: '2026-06-22', value: 25},
];

const formatValue = (value: number): string => `$${value}`;

const renderChart = (): void => {
  render(
    <PeriodSpendBars
      data={data}
      formatPeriodLabel={(periodStart) => periodStart}
      formatValue={formatValue}
      label="Recorded spend by period"
    />
  );
};

test('the svg carries the given accessible label', () => {
  renderChart();

  expect(
    screen.getByRole('img', {name: 'Recorded spend by period'})
  ).toBeInTheDocument();
});

test('renders one focusable bar per period, aria-labeled with its label and value, including a $0 period', () => {
  renderChart();

  const bars = screen.getAllByRole('graphics-symbol');

  expect(bars).toHaveLength(3);
  expect(
    screen.getByRole('graphics-symbol', {name: '2026-06-08: $10'})
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {name: '2026-06-15: $0'})
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {name: '2026-06-22: $25'})
  ).toBeInTheDocument();
});

test('labels every bar with its period underneath', () => {
  renderChart();

  expect(screen.getByText('2026-06-08')).toBeInTheDocument();
  expect(screen.getByText('2026-06-15')).toBeInTheDocument();
  expect(screen.getByText('2026-06-22')).toBeInTheDocument();
});

test('the y-axis includes a $0 tick and a tick at (or above) the highest value', () => {
  renderChart();

  expect(screen.getByText('$0')).toBeInTheDocument();
  // niceTicks rounds up from the max value (25), so the top tick label is a
  // round number at or above it, not necessarily "$25" itself.
  const tickTexts = screen
    .getAllByText(/^\$\d+$/u)
    .map((element) => Number(element.textContent.slice(1)));

  expect(Math.max(...tickTexts)).toBeGreaterThanOrEqual(25);
});

test('hovering a bar shows its period and value in the tooltip; leaving clears it', () => {
  renderChart();

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: '2026-06-22: $25'})
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('2026-06-22');
  expect(tooltip).toHaveTextContent('$25');

  fireEvent.mouseLeave(
    screen.getByRole('graphics-symbol', {name: '2026-06-22: $25'})
  );
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a keyboard-only user can reach the same tooltip via focus', () => {
  renderChart();

  const bar = screen.getByRole('graphics-symbol', {name: '2026-06-08: $10'});

  expect(bar).toHaveAttribute('tabindex', '0');

  fireEvent.focus(bar);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$10');

  fireEvent.blur(bar);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('empty data renders no bars and does not crash', () => {
  render(
    <PeriodSpendBars
      data={[]}
      formatPeriodLabel={(periodStart) => periodStart}
      formatValue={formatValue}
    />
  );

  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});
