import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {HorizontalBarDatum} from '~/components/Charts/HorizontalBars';
import HorizontalBars from '~/components/Charts/HorizontalBars';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
const fixturePath = path.join(
  process.cwd(),
  'test/fixtures/charts/model-totals.json'
);
const modelTotals = JSON.parse(
  readFileSync(fixturePath, 'utf8')
) as HorizontalBarDatum[];

const formatValue = (value: number): string =>
  formatCompactNumber(value, 'en-US');

test('renders one accent bar per datum with label and value at the tip', () => {
  render(<HorizontalBars data={modelTotals} formatValue={formatValue} />);

  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(4);
  expect(
    screen.getByRole('graphics-symbol', {name: 'claude-opus-4: 8.2M'})
  ).toBeInTheDocument();
  expect(screen.getByText('claude-haiku-4')).toBeInTheDocument();

  // Single-metric bars stay on the accent ramp (SPEC section 7).
  const opusBar = screen.getByTestId('horizontal-bar-claude-opus-4');

  expect(opusBar).toHaveClass('fill-accent');
  expect(opusBar).toHaveClass('motion-reduce:transition-none');
});

test('bar lengths are proportional to values on a shared linear scale', () => {
  render(<HorizontalBars data={modelTotals} formatValue={formatValue} />);

  // width 480, label column 128, value column 56: plot area is 296px.
  // Max (8.2M) fills the plot; its tip label sits at 128 + 296 + 6.
  expect(screen.getByText('8.2M')).toHaveAttribute('x', '430');
  // 3.1M / 8.2M * 296 = 111.9; tip label at 128 + 111.9 + 6.
  expect(screen.getByText('3.1M')).toHaveAttribute('x', '245.9');
});

test('a row with bucket detail shows a tooltip on hover and hides on leave', () => {
  const [first, ...rest] = modelTotals;
  const withTooltip: HorizontalBarDatum[] = [
    {
      ...first,
      tooltip: {
        rows: [
          {label: 'output', value: '8.2M'},
          {label: 'cache read', value: '120M'},
        ],
        title: 'claude-opus-4',
      },
    },
    ...rest,
  ];

  render(<HorizontalBars data={withTooltip} formatValue={formatValue} />);

  const row = screen.getByRole('graphics-symbol', {
    name: 'claude-opus-4: 8.2M',
  });

  fireEvent.mouseEnter(row);
  expect(screen.getByRole('tooltip')).toHaveTextContent('cache read');

  fireEvent.mouseLeave(row);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a keyboard-only user can reach and trigger the same tooltip via focus', () => {
  const [first, ...rest] = modelTotals;
  const withTooltip: HorizontalBarDatum[] = [
    {
      ...first,
      tooltip: {
        rows: [{label: 'output', value: '8.2M'}],
        title: 'claude-opus-4',
      },
    },
    ...rest,
  ];

  render(<HorizontalBars data={withTooltip} formatValue={formatValue} />);

  const row = screen.getByRole('graphics-symbol', {
    name: 'claude-opus-4: 8.2M',
  });

  expect(row).toHaveAttribute('tabindex', '0');

  fireEvent.focus(row);
  expect(screen.getByRole('tooltip')).toHaveTextContent('output');

  fireEvent.blur(row);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
