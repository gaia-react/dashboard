import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import Gauge from '~/components/Charts/Gauge';

const formatValue = (value: number): string => `$${value.toFixed(2)}`;

test('renders the track and fill with the true share as text and width', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={12.34}
      maxLabel="execute phase"
      value={4.2}
    />
  );

  const meter = screen.getByRole('progressbar');

  expect(meter).toHaveAttribute('aria-valuemin', '0');
  expect(meter).toHaveAttribute('aria-valuemax', '100');
  expect(meter).toHaveAttribute('aria-valuenow', '34');
  expect(meter).toHaveAttribute('aria-valuetext', '34 percent of phase cost');
  expect(screen.getByText('34%')).toBeInTheDocument();
  expect(
    screen.getByText('$4.20 of $12.34, execute phase')
  ).toBeInTheDocument();
});

test('the fill width is a direct style percent, never encoded by color alone', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={12.34}
      maxLabel="execute phase"
      value={4.2}
    />
  );

  const fill = screen.getByTestId('gauge-fill');

  expect(fill).toHaveClass('bg-secondary');
  expect(fill).toHaveStyle({width: '34.0356564019449%'});
});

test('clamps an over-max value to a full track while labeling the true, unclamped figure', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={12}
      maxLabel="execute phase"
      value={15}
    />
  );

  const meter = screen.getByRole('progressbar');
  const fill = screen.getByTestId('gauge-fill');

  expect(fill).toHaveStyle({width: '100%'});
  expect(meter).toHaveAttribute('aria-valuenow', '100');
  // The true figure (125%), not the clamped one, is what the user reads.
  expect(screen.getByText('125%')).toBeInTheDocument();
  expect(
    screen.getByText('$15.00 of $12.00, execute phase')
  ).toBeInTheDocument();
});

test('a sub-1% share still shows a visible sliver of fill, never a 0%-wide track', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={1000}
      maxLabel="execute phase"
      value={3}
    />
  );

  const fill = screen.getByTestId('gauge-fill');

  expect(fill).toHaveStyle({width: '2%'});
});

test('renders a defined empty state, never a 0% meter, when the phase recorded no cost', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={0}
      maxLabel="execute phase"
      value={4.2}
    />
  );

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByText('Audit share not available')).toBeInTheDocument();
  expect(screen.getByText(/The audit itself cost \$4.20/u)).toBeInTheDocument();
});

test('renders a defined empty state when the phase cost is null', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={null}
      maxLabel="execute phase"
      value={4.2}
    />
  );

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByText('Audit share not available')).toBeInTheDocument();
});

test('renders a defined empty state when the audit value itself is null', () => {
  render(
    <Gauge
      formatValue={formatValue}
      max={12.34}
      maxLabel="execute phase"
      value={null}
    />
  );

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByText('Audit share not available')).toBeInTheDocument();
});
