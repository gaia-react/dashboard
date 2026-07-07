import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import CostTrend from '~/components/Sections/CostTrend';
import type {CostsResponse} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (matches the pattern in Charts/TrendBars/tests).
const readFixture = (name: string): CostsResponse =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'test/fixtures/cost-trend', name),
      'utf8'
    )
  ) as CostsResponse;

const populated = readFixture('costs-response.json');
const empty = readFixture('costs-response-empty.json');

const topOfBar = (barElement: HTMLElement): number => {
  const match = /V(?<top>[\d.]+)/u.exec(barElement.getAttribute('d') ?? '');

  return Number(match?.groups?.top);
};

test('renders an empty state when no entry carries cost data', () => {
  render(<CostTrend costs={empty} />);

  expect(screen.getByText('No cost trend yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('renders one chronological bar per entry with cost data, skipping zero-cost entries', () => {
  render(<CostTrend costs={populated} locale="en-US" />);

  const bars = screen.getAllByRole('graphics-symbol');

  // 5 entries in the fixture, one (SPEC-012) has no recorded $ and zero
  // tokens, so it carries no cost data and is skipped (SPEC 6.7: "one bar
  // per spec/plan with ANY cost data").
  expect(bars).toHaveLength(4);
  expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
    expect.stringContaining('Add token rollup'),
    expect.stringContaining('Backfill archive'),
    expect.stringContaining('Ledger repair'),
    expect.stringContaining('archived-onboarding'),
  ]);
});

test('priced entries render on the dollar encoding, unpriced entries on the token encoding, never a shared $-axis', () => {
  render(<CostTrend costs={populated} locale="en-US" />);

  const dollarsBar = screen.getByTestId('trend-bar-SPEC-010');
  const tokensBar = screen.getByTestId('trend-bar-PLAN-002');

  // Visually distinct encodings: solid accent for recorded $, translucent
  // secondary hue for token-only entries.
  expect(dollarsBar).toHaveClass('fill-accent');
  expect(dollarsBar).not.toHaveAttribute('fill-opacity');
  expect(tokensBar).toHaveClass('fill-secondary');
  expect(tokensBar).toHaveAttribute('fill-opacity', '0.55');

  // The central correctness rule: dollars and tokens are never read off one
  // $-axis. SPEC-011 ($21.75) is the largest dollars-kind entry and
  // PLAN-002 (5.4M tokens) is the largest tokens-kind entry; each is
  // normalized against its OWN kind's max, so both reach the identical
  // plot-height ceiling despite the wildly different magnitudes. If they
  // shared a linear $-axis, SPEC-011's bar would be dwarfed to near-zero
  // height by the token-scale magnitude instead.
  const maxDollarsTop = topOfBar(screen.getByTestId('trend-bar-SPEC-011'));
  const maxTokensTop = topOfBar(tokensBar);

  expect(maxDollarsTop).toBe(maxTokensTop);
});

test('marks are aria-labeled with their unit-formatted value; the tooltip is hover-only', () => {
  render(<CostTrend costs={populated} locale="en-US" />);

  const dollarsMark = screen.getByRole('graphics-symbol', {
    name: 'Add token rollup: $12.50',
  });
  const tokensMark = screen.getByRole('graphics-symbol', {
    name: 'Backfill archive: 5.4M tokens',
  });

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  fireEvent.mouseEnter(dollarsMark);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$12.50');

  fireEvent.mouseLeave(dollarsMark);
  fireEvent.mouseEnter(tokensMark);
  expect(screen.getByRole('tooltip')).toHaveTextContent('5.4M tokens');
});
