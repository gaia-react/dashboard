import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {TrendBarDatum} from '~/components/Charts/TrendBars';
import TrendBars from '~/components/Charts/TrendBars';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
const fixturePath = path.join(
  process.cwd(),
  'test/fixtures/charts/trend-entries.json'
);
const trendEntries = JSON.parse(
  readFileSync(fixturePath, 'utf8')
) as TrendBarDatum[];

const renderChart = (): void => {
  render(<TrendBars data={trendEntries} locale="en-US" />);
};

const topOfBar = (pathElement: HTMLElement): number => {
  const match = /V(?<top>[\d.]+)/u.exec(pathElement.getAttribute('d') ?? '');

  return Number(match?.groups?.top);
};

test('renders one chronological bar per entry with distinct encodings', () => {
  renderChart();

  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(6);

  const dollarsBar = screen.getByTestId('trend-bar-SPEC-001');
  const tokensBar = screen.getByTestId('trend-bar-SPEC-002');

  // Recorded dollars: solid accent. Token-only: secondary hue, translucent.
  expect(dollarsBar).toHaveClass('fill-accent');
  expect(dollarsBar).not.toHaveAttribute('fill-opacity');
  expect(tokensBar).toHaveClass('fill-secondary');
  expect(tokensBar).toHaveAttribute('fill-opacity', '0.55');
  expect(dollarsBar).toHaveClass('motion-reduce:transition-none');
});

test('each encoding scales against its own max, never one shared $-axis', () => {
  renderChart();

  // Max dollars (SPEC-003) and max tokens (SPEC-004) each fill the plot
  // height: the two units are normalized independently.
  const maxDollarsTop = topOfBar(screen.getByTestId('trend-bar-SPEC-003'));
  const maxTokensTop = topOfBar(screen.getByTestId('trend-bar-SPEC-004'));

  expect(maxDollarsTop).toBe(12);
  expect(maxTokensTop).toBe(12);
});

test('a legend names both encodings', () => {
  renderChart();

  expect(screen.getByText('Recorded $')).toBeInTheDocument();
  expect(screen.getByText('Tokens (no recorded $)')).toBeInTheDocument();
});

test('hovering a bar shows its unit-formatted value', () => {
  renderChart();

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: 'Ledger repair: $21.75'})
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent('$21.75');

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: 'Session scan: 8M tokens'})
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent('8M tokens');
});

test('a keyboard-only user can reach and trigger the same tooltip via focus', () => {
  renderChart();

  const bar = screen.getByRole('graphics-symbol', {
    name: 'Ledger repair: $21.75',
  });

  expect(bar).toHaveAttribute('tabindex', '0');

  fireEvent.focus(bar);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$21.75');

  fireEvent.blur(bar);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('edge labels are text-label, never the legacy arbitrary size', () => {
  renderChart();

  const dollarsBar = screen.getByTestId('trend-bar-SPEC-001');

  expect(dollarsBar).toHaveClass('ease-out');
  expect(screen.getByText('SPEC-001')).toHaveClass('text-label');
});

test('the baseline gets a taller bottom margin so 13px edge labels do not collide', () => {
  renderChart();

  // height 180 - BOTTOM_MARGIN 24 = 156.
  expect(screen.getByTestId('trend-baseline')).toHaveAttribute('y1', '156');
});
