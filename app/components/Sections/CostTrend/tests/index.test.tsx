import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {formatWeekLabel} from '~/components/Charts/date-helpers';
import CostTrend from '~/components/Sections/CostTrend';
import type {CostsResponse} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (matches the pattern in Charts/PeriodSpendBars/tests).
const readFixture = (name: string): CostsResponse =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'test/fixtures/cost-trend', name),
      'utf8'
    )
  ) as CostsResponse;

const populated = readFixture('costs-response.json');
const empty = readFixture('costs-response-empty.json');
const unpriced = readFixture('costs-response-unpriced.json');
const multiPeriod = readFixture('costs-response-multi-period.json');

const weekLabel = (dayKey: string): string => formatWeekLabel(dayKey, 'en-US');

test('renders an empty state when there are no entries at all', () => {
  render(<CostTrend costs={empty} />);

  expect(screen.getByText('No recorded spend yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('renders an empty state when entries exist but none are priced (total is 0)', () => {
  render(<CostTrend costs={unpriced} />);

  expect(screen.getByText('No recorded spend yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('all 5 entries fall in the same week: one bar, summing only the priced ones', () => {
  render(<CostTrend costs={populated} locale="en-US" />);

  // SPEC-010 ($12.50) + SPEC-011 ($21.75), the rest unpriced; the fixture's
  // 2026-06-29 to 07-05 Wed-Sun run is one Monday-start week (Jun 29).
  const bars = screen.getAllByRole('graphics-symbol');

  expect(bars).toHaveLength(1);
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-29')}: $34.25`,
    })
  ).toBeInTheDocument();
});

test('entries spanning three weeks, including a gap week, render one bar per week with an explicit $0 gap bar', () => {
  render(<CostTrend costs={multiPeriod} locale="en-US" />);

  const bars = screen.getAllByRole('graphics-symbol');

  expect(bars).toHaveLength(3);
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-08')}: $15.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-15')}: $0.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-22')}: $20.00`,
    })
  ).toBeInTheDocument();
});

test('the chart carries an accessible summary naming the period range and total', () => {
  render(<CostTrend costs={multiPeriod} locale="en-US" />);

  expect(
    screen.getByRole('img', {
      name: `Recorded spend by week from ${weekLabel('2026-06-08')} to ${weekLabel('2026-06-22')}, totaling $35.00`,
    })
  ).toBeInTheDocument();
});

test('hovering a bar shows its period and recorded total in the tooltip', () => {
  render(<CostTrend costs={multiPeriod} locale="en-US" />);

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-22')}: $20.00`,
    })
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent(weekLabel('2026-06-22'));
  expect(tooltip).toHaveTextContent('$20.00');
});
