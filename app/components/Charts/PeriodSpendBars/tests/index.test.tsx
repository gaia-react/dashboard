import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import PeriodSpendBars from '~/components/Charts/PeriodSpendBars';
import type {PeriodBarDatum} from '~/components/Charts/PeriodSpendBars';

const data: PeriodBarDatum[] = [
  {adHocValue: 40, periodStart: '2026-06-08', recordedValue: 0},
  {adHocValue: 0, periodStart: '2026-06-15', recordedValue: 0},
  {adHocValue: 20, periodStart: '2026-06-22', recordedValue: 25},
];

const formatValue = (value: number): string => `$${value}`;

const renderChart = (): void => {
  render(
    <PeriodSpendBars
      data={data}
      formatPeriodLabel={(periodStart) => periodStart}
      formatValue={formatValue}
      label="Recorded vs ad-hoc spend by period"
    />
  );
};

test('the svg carries the given accessible label', () => {
  renderChart();

  expect(
    screen.getByRole('img', {name: 'Recorded vs ad-hoc spend by period'})
  ).toBeInTheDocument();
});

test('renders one focusable group per period, aria-labeled with both series', () => {
  renderChart();

  const groups = screen.getAllByRole('graphics-symbol');

  expect(groups).toHaveLength(3);
  expect(
    screen.getByRole('graphics-symbol', {
      name: '2026-06-08: spec & plan (recorded) $0, ad hoc (estimated) $40',
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: '2026-06-15: spec & plan (recorded) $0, ad hoc (estimated) $0',
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: '2026-06-22: spec & plan (recorded) $25, ad hoc (estimated) $20',
    })
  ).toBeInTheDocument();
});

test('a legend names both series', () => {
  renderChart();

  expect(screen.getByText('Spec & plan (recorded)')).toBeInTheDocument();
  expect(screen.getByText('Ad hoc (estimated)')).toBeInTheDocument();
});

test('recorded and ad-hoc bars carry visually distinct classes, recorded solid and ad hoc translucent', () => {
  renderChart();

  const recordedBar = screen.getByTestId('period-bar-recorded-2026-06-22');
  const adHocBar = screen.getByTestId('period-bar-adhoc-2026-06-22');

  expect(recordedBar).toHaveClass('fill-accent');
  expect(recordedBar).not.toHaveAttribute('fill-opacity');
  expect(adHocBar).toHaveClass('fill-secondary');
  expect(adHocBar).toHaveAttribute('fill-opacity', '0.55');
});

test('labels every period underneath its group', () => {
  renderChart();

  expect(screen.getByText('2026-06-08')).toBeInTheDocument();
  expect(screen.getByText('2026-06-15')).toBeInTheDocument();
  expect(screen.getByText('2026-06-22')).toBeInTheDocument();
});

test('the y-axis includes a $0 tick and a tick at (or above) the highest value across both series', () => {
  renderChart();

  expect(screen.getByText('$0')).toBeInTheDocument();
  // niceTicks rounds up from the max across both series (40), so the top
  // tick label is a round number at or above it, not necessarily "$40".
  const tickTexts = screen
    .getAllByText(/^\$\d+$/u)
    .map((element) => Number(element.textContent.slice(1)));

  expect(Math.max(...tickTexts)).toBeGreaterThanOrEqual(40);
});

test('hovering a period shows both series in the tooltip; leaving clears it', () => {
  renderChart();

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {
      name: '2026-06-22: spec & plan (recorded) $25, ad hoc (estimated) $20',
    })
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('2026-06-22');
  expect(tooltip).toHaveTextContent('$25');
  expect(tooltip).toHaveTextContent('$20');

  fireEvent.mouseLeave(
    screen.getByRole('graphics-symbol', {
      name: '2026-06-22: spec & plan (recorded) $25, ad hoc (estimated) $20',
    })
  );
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a keyboard-only user can reach the same tooltip via focus', () => {
  renderChart();

  const group = screen.getByRole('graphics-symbol', {
    name: '2026-06-08: spec & plan (recorded) $0, ad hoc (estimated) $40',
  });

  expect(group).toHaveAttribute('tabindex', '0');

  fireEvent.focus(group);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$40');

  fireEvent.blur(group);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('labels are text-label, never the legacy arbitrary size', () => {
  renderChart();

  expect(screen.getByText('2026-06-08')).toHaveClass('text-label');
  expect(screen.getByText('$0')).toHaveClass('text-label');
});

test('the baseline gets a taller bottom margin so 13px period labels do not collide', () => {
  renderChart();

  // height 180 (default), BOTTOM_MARGIN 24: the $0 tick sits at
  // yScale(0) + 3 = plotBottom + 3 = (180 - 24) + 3 = 159.
  expect(screen.getByText('$0')).toHaveAttribute('y', '159');
});

test('bar opacity transitions carry ease-out via the shared constant', () => {
  renderChart();

  expect(screen.getByTestId('period-bar-recorded-2026-06-22')).toHaveClass(
    'ease-out'
  );
});

test('empty data renders no groups and does not crash', () => {
  render(
    <PeriodSpendBars
      data={[]}
      formatPeriodLabel={(periodStart) => periodStart}
      formatValue={formatValue}
    />
  );

  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});
