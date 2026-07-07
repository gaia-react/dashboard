import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {formatWeekLabel} from '~/components/Charts/date-helpers';
import CostTrend from '~/components/Sections/CostTrend';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (matches the pattern in Charts/PeriodSpendBars/tests).
const readFixture = <T,>(name: string): T =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'test/fixtures/cost-trend', name),
      'utf8'
    )
  ) as T;

const populatedCosts = readFixture<CostsResponse>('costs-response.json');
const emptyCosts = readFixture<CostsResponse>('costs-response-empty.json');
const unpricedCosts = readFixture<CostsResponse>(
  'costs-response-unpriced.json'
);
const multiPeriodCosts = readFixture<CostsResponse>(
  'costs-response-multi-period.json'
);
const populatedActivity = readFixture<ActivityResponse>(
  'activity-response.json'
);
const emptyActivity = readFixture<ActivityResponse>(
  'activity-response-empty.json'
);

const weekLabel = (dayKey: string): string => formatWeekLabel(dayKey, 'en-US');

test('renders an empty state when there is no cost or activity data at all', () => {
  render(<CostTrend activity={emptyActivity} costs={emptyCosts} />);

  expect(screen.getByText('No recorded spend yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('renders an empty state when cost entries exist but none are priced and there is no ad-hoc spend either', () => {
  render(<CostTrend activity={emptyActivity} costs={unpricedCosts} />);

  expect(screen.getByText('No recorded spend yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('a nonzero ad-hoc total alone is enough to skip the empty state, even with no recorded spend', () => {
  render(<CostTrend activity={populatedActivity} costs={emptyCosts} />);

  expect(screen.queryByText('No recorded spend yet')).not.toBeInTheDocument();
  expect(screen.getAllByRole('graphics-symbol').length).toBeGreaterThan(0);
});

test('a single week of recorded spend renders as one group, ad hoc at $0 with no ad-hoc sessions', () => {
  render(
    <CostTrend activity={emptyActivity} costs={populatedCosts} locale="en-US" />
  );

  // The fixture's 2026-07-01 to 07-05 run is one Monday-start week (Jun 29);
  // recorded sums its 2 priced entries ($12.50 + $21.75), ad hoc is $0.
  const groups = screen.getAllByRole('graphics-symbol');

  expect(groups).toHaveLength(1);
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-29')}: spec & plan (recorded) $34.25, ad hoc (estimated) $0.00`,
    })
  ).toBeInTheDocument();
});

test('recorded appears only in its priced weeks while ad hoc spans the whole activity window, gaps included', () => {
  render(
    <CostTrend
      activity={populatedActivity}
      costs={multiPeriodCosts}
      locale="en-US"
    />
  );

  // Window: activitySince (Jun 1) through scannedAt (Jun 30) = 5 weeks.
  // Recorded: $15 (Jun 8's 2 entries), $0, $20 (Jun 22) -- unchanged from the
  // single-series design. Ad hoc: $5 (Jun 1), $0, $8 (Jun 15), $12 (Jun 22),
  // $0 (Jun 29) -- the attributed and recorded-basis sessions never count.
  const groups = screen.getAllByRole('graphics-symbol');

  expect(groups).toHaveLength(5);
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-01')}: spec & plan (recorded) $0.00, ad hoc (estimated) $5.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-08')}: spec & plan (recorded) $15.00, ad hoc (estimated) $0.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-15')}: spec & plan (recorded) $0.00, ad hoc (estimated) $8.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-22')}: spec & plan (recorded) $20.00, ad hoc (estimated) $12.00`,
    })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-29')}: spec & plan (recorded) $0.00, ad hoc (estimated) $0.00`,
    })
  ).toBeInTheDocument();
});

test('a recorded entry backfilled earlier than activitySince still counts, not clipped out of the window', () => {
  // Cost tracking and session history are reconciled from two separate
  // sources (OVERVIEW.md), so either side's "since" mark can predate the
  // other's. activitySince alone (Jun 1) would clip this May 25 backfilled
  // entry out of the window; costs.coverage.costSince and the entry's own
  // sortAt must pull the start back to include it.
  const [firstEntry, ...restEntries] = multiPeriodCosts.entries;
  const backfilledCosts: CostsResponse = {
    ...multiPeriodCosts,
    coverage: {costSince: '2026-05-25T00:00:00Z'},
    entries: [
      {
        ...firstEntry,
        sortAt: '2026-05-25T09:00:00Z',
        totals: {...firstEntry.totals, recordedDollars: 7},
      },
      ...restEntries,
    ],
  };

  render(
    <CostTrend
      activity={populatedActivity}
      costs={backfilledCosts}
      locale="en-US"
    />
  );

  expect(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-05-25')}: spec & plan (recorded) $7.00, ad hoc (estimated) $0.00`,
    })
  ).toBeInTheDocument();
});

test('the ad-hoc series sums to the same total as kpis.estimatedAdHocDollars', () => {
  render(
    <CostTrend
      activity={populatedActivity}
      costs={multiPeriodCosts}
      locale="en-US"
    />
  );

  const adHocValues = ['$5.00', '$0.00', '$8.00', '$12.00', '$0.00'];
  const total = adHocValues.reduce(
    (sum, value) => sum + Number(value.replace('$', '')),
    0
  );

  expect(total).toBe(populatedActivity.kpis.estimatedAdHocDollars?.value);
});

test('the chart carries an accessible summary naming both series and their totals', () => {
  render(
    <CostTrend
      activity={populatedActivity}
      costs={multiPeriodCosts}
      locale="en-US"
    />
  );

  expect(
    screen.getByRole('img', {
      name: `Recorded spec & plan spend and estimated ad-hoc spend by week from ${weekLabel('2026-06-01')} to ${weekLabel('2026-06-29')}: spec & plan totaling $35.00, ad hoc totaling $25.00`,
    })
  ).toBeInTheDocument();
});

test('hovering a period group shows both series in the tooltip', () => {
  render(
    <CostTrend
      activity={populatedActivity}
      costs={multiPeriodCosts}
      locale="en-US"
    />
  );

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {
      name: `${weekLabel('2026-06-22')}: spec & plan (recorded) $20.00, ad hoc (estimated) $12.00`,
    })
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent(weekLabel('2026-06-22'));
  expect(tooltip).toHaveTextContent('$20.00');
  expect(tooltip).toHaveTextContent('$12.00');
});

test('a legend distinguishes recorded from estimated', () => {
  render(
    <CostTrend
      activity={populatedActivity}
      costs={multiPeriodCosts}
      locale="en-US"
    />
  );

  expect(screen.getByText('Spec & plan (recorded)')).toBeInTheDocument();
  expect(screen.getByText('Ad hoc (estimated)')).toBeInTheDocument();
});
