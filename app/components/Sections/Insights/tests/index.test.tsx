import {render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import Insights from '~/components/Sections/Insights';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {activityResponseSchema, costsResponseSchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (mirrors app/components/Sections/KpiRow/tests/index.test.tsx).
const readFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'test/fixtures/insights', name),
      'utf8'
    )
  );

// Parsing through the real response schemas is the fixture's honesty check:
// a malformed fixture fails here with a clear Zod error, not a cryptic
// component-rendering failure below.
const activityPopulated: ActivityResponse = activityResponseSchema.parse(
  readFixture('activity-populated.json')
);
const activityEmpty: ActivityResponse = activityResponseSchema.parse(
  readFixture('activity-empty.json')
);
const costsPopulated: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-populated.json')
);
const costsEmpty: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-empty.json')
);

test('renders the section chrome and the three headline stat tiles from fixture data', () => {
  render(
    <Insights
      activity={activityPopulated}
      costs={costsPopulated}
      locale="en-US"
    />
  );

  expect(screen.getByText('Highlights')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {name: 'What stood out'})
  ).toBeInTheDocument();

  expect(screen.getByText('Most active day')).toBeInTheDocument();
  expect(screen.getByText('Jun 2, 2026')).toBeInTheDocument();
  expect(screen.getByText('5K output · 7 sessions')).toBeInTheDocument();

  expect(screen.getByText('Busiest model')).toBeInTheDocument();
  expect(screen.getByText('6K output tokens')).toBeInTheDocument();

  expect(screen.getByText('Recorded work time')).toBeInTheDocument();
  expect(screen.getByText('3h 10m')).toBeInTheDocument();
  expect(screen.getByText('Across all specs & plans')).toBeInTheDocument();
});

test('busiest model humanizes the raw id, excluding the <synthetic> bucket despite its higher raw output', () => {
  render(
    <Insights
      activity={activityPopulated}
      costs={costsPopulated}
      locale="en-US"
    />
  );

  // claude-sonnet-5 (6K output) beats claude-opus-4-8 (4K); <synthetic> has
  // the highest raw output (9K) but is excluded from the ranking entirely
  // (insights.ts busiestModel), so it never surfaces even as a loser.
  expect(screen.getByText('Claude Sonnet 5')).toBeInTheDocument();
  expect(screen.queryByText('claude-sonnet-5')).not.toBeInTheDocument();
  expect(screen.queryByText('<synthetic>')).not.toBeInTheDocument();
});

test('costliest specs & plans ranks priced entries by dollars, dropping unpriced and zero-dollar ones', () => {
  render(
    <Insights
      activity={activityPopulated}
      costs={costsPopulated}
      locale="en-US"
    />
  );

  const [costlyList] = screen.getAllByRole('list');
  const items = within(costlyList).getAllByRole('listitem');

  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining('SPEC-002'),
    expect.stringContaining('SPEC-001'),
  ]);
  expect(within(costlyList).getByText('$40.00')).toBeInTheDocument();
  expect(within(costlyList).getByText('$12.50')).toBeInTheDocument();
  expect(within(costlyList).getByText('Backfill archive')).toBeInTheDocument();
  expect(within(costlyList).getByText('Add token rollup')).toBeInTheDocument();

  // PLAN-003 has no recorded dollars and SPEC-004 recorded exactly $0;
  // topCostlyEntries requires a dollar figure > 0, so neither surfaces here.
  expect(
    within(costlyList).queryByText('Ledger repair')
  ).not.toBeInTheDocument();
  expect(
    within(costlyList).queryByText('Zero cost work')
  ).not.toBeInTheDocument();
});

test('longest sessions ranks sessions by wall-clock duration, longest first', () => {
  render(
    <Insights
      activity={activityPopulated}
      costs={costsPopulated}
      locale="en-US"
    />
  );

  const [, sessionsList] = screen.getAllByRole('list');
  const items = within(sessionsList).getAllByRole('listitem');

  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining('Longest session ever'),
    expect.stringContaining('Second longest'),
    expect.stringContaining('Short check-in'),
  ]);
  expect(within(sessionsList).getByText('2h 00m')).toBeInTheDocument();
  expect(within(sessionsList).getByText('1h 00m')).toBeInTheDocument();
  expect(within(sessionsList).getByText('10m 00s')).toBeInTheDocument();
});

test('a fully empty dataset renders the intentional empty state, not a hollow layout', () => {
  render(<Insights activity={activityEmpty} costs={costsEmpty} />);

  expect(screen.getByText('No insights yet')).toBeInTheDocument();
  expect(
    screen.getByText(/standout numbers surface here/i)
  ).toBeInTheDocument();
  expect(screen.queryByText('Most active day')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('list')).toHaveLength(0);
});

test('mixed data (activity present, no priced work) falls back per section instead of a broken layout', () => {
  render(<Insights activity={activityPopulated} costs={costsEmpty} />);

  // hasContent is true (activity still carries a busiest day/model and
  // sessions), so the section chrome and both stat/list grids render; only
  // the cost-derived tile and list fall back, and gracefully so.
  expect(screen.getByText('Recorded work time')).toBeInTheDocument();
  expect(screen.getByText('-')).toBeInTheDocument();

  const [costlyList] = screen.getAllByRole('list');

  expect(
    within(costlyList).getByText('No priced work yet.')
  ).toBeInTheDocument();

  // The activity-derived tile and list are unaffected by the empty costs.
  expect(screen.getByText('Jun 2, 2026')).toBeInTheDocument();
  expect(screen.getByText('Claude Sonnet 5')).toBeInTheDocument();
  expect(screen.getByText('Longest session ever')).toBeInTheDocument();
});
