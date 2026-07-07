import {render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import KpiRow, {KpiRowSkeleton} from '~/components/Sections/KpiRow';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {activityResponseSchema, costsResponseSchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
const readFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'test/fixtures/header-kpi', name),
      'utf8'
    )
  );

// Parsing through the real response schema is the fixture's honesty check:
// a malformed fixture fails here with a clear Zod error, not a cryptic
// component-rendering failure below.
const costsPopulated: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-populated.json')
);
const costsEmpty: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-empty.json')
);
const activityPopulated: ActivityResponse = activityResponseSchema.parse(
  readFixture('activity-populated.json')
);
const activityEmpty: ActivityResponse = activityResponseSchema.parse(
  readFixture('activity-empty.json')
);

/** activityPopulated with a swapped-in estimated ad hoc figure. */
const withEstimate = (
  estimatedAdHocDollars: ActivityResponse['kpis']['estimatedAdHocDollars']
): ActivityResponse => ({
  ...activityPopulated,
  kpis: {...activityPopulated.kpis, estimatedAdHocDollars},
});

test('work: recorded and estimated spend render as distinct, basis-labeled tiles', () => {
  render(
    <KpiRow activity={activityPopulated} costs={costsPopulated} tab="work" />
  );

  const recordedTile = screen.getByRole('group', {name: 'Recorded spend'});

  expect(recordedTile).toHaveTextContent('$14.35');
  expect(recordedTile).toHaveTextContent(/recorded/i);

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent('$42.10');
  expect(estimatedTile).toHaveTextContent(/estimated/i);
  // Recorded and estimated dollars never combine into one number (SPEC 5.3):
  // $14.35 + $42.10 = $56.45 must not appear anywhere on the tile.
  expect(screen.queryByText(/56\.45/)).not.toBeInTheDocument();
});

test('work: renders a lower-bound marker on a non-zero estimated tile when flagged', () => {
  render(
    <KpiRow activity={activityPopulated} costs={costsPopulated} tab="work" />
  );

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent('≥$42.10');
  expect(estimatedTile).toHaveTextContent(/lower bound/i);
});

test('work: a zero estimate never carries a lower-bound marker (W10)', () => {
  render(
    <KpiRow
      activity={withEstimate({lowerBound: true, value: 0})}
      costs={costsPopulated}
      tab="work"
    />
  );

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).not.toHaveTextContent('≥');
  expect(estimatedTile).not.toHaveTextContent(/lower bound/i);
  expect(estimatedTile).toHaveTextContent(/no ad hoc activity to estimate/i);
});

test('work: no lower-bound marker when the estimate is a firm figure', () => {
  render(
    <KpiRow
      activity={withEstimate({lowerBound: false, value: 10})}
      costs={costsPopulated}
      tab="work"
    />
  );

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent('$10.00');
  expect(estimatedTile).not.toHaveTextContent('≥');
  expect(estimatedTile).not.toHaveTextContent(/lower bound/i);
});

test('work: specs and plans show the merged-over-total ratio', () => {
  render(
    <KpiRow activity={activityPopulated} costs={costsPopulated} tab="work" />
  );

  const specsTile = screen.getByRole('group', {name: 'Specs'});
  const plansTile = screen.getByRole('group', {name: 'Plans'});

  expect(specsTile).toHaveTextContent('20 / 23');
  expect(specsTile).toHaveTextContent(/merged/i);
  expect(plansTile).toHaveTextContent('4 / 6');
  expect(plansTile).toHaveTextContent(/merged/i);
});

test('sessions: shows session counts and the GAIA-vs-ad-hoc split, not specs or plans', () => {
  render(
    <KpiRow
      activity={activityPopulated}
      costs={costsPopulated}
      tab="sessions"
    />
  );

  expect(screen.getByRole('group', {name: 'Sessions'})).toHaveTextContent('3');
  expect(screen.getByRole('group', {name: 'GAIA'})).toHaveTextContent('1');
  expect(screen.getByRole('group', {name: 'Ad hoc'})).toHaveTextContent('2');

  expect(screen.queryByRole('group', {name: 'Specs'})).not.toBeInTheDocument();
  expect(screen.queryByRole('group', {name: 'Plans'})).not.toBeInTheDocument();
  expect(
    screen.queryByRole('group', {name: 'Active days'})
  ).not.toBeInTheDocument();
});

test('activity: leads with active days and total tokens, plus spend', () => {
  render(
    <KpiRow
      activity={activityPopulated}
      costs={costsPopulated}
      tab="activity"
    />
  );

  expect(screen.getByRole('group', {name: 'Active days'})).toHaveTextContent(
    '62'
  );
  expect(screen.getByRole('group', {name: 'Total tokens'})).toHaveTextContent(
    '14M'
  );
  expect(
    screen.getByRole('group', {name: 'Recorded spend'})
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', {name: 'Estimated ad hoc spend'})
  ).toBeInTheDocument();
});

test('the total-tokens tile is a closed-by-default disclosure with the bucket split', () => {
  render(
    <KpiRow
      activity={activityPopulated}
      costs={costsPopulated}
      tab="sessions"
    />
  );

  const tokensTile = screen.getByRole('group', {name: 'Total tokens'});
  // <details> carries an implicit "group" role; scoping within the tile
  // finds it without reaching for raw DOM traversal.
  const disclosure = within(tokensTile).getByRole('group');

  expect(disclosure).not.toHaveAttribute('open');
  expect(tokensTile).toHaveTextContent('14M');
  expect(tokensTile).toHaveTextContent(/fresh input/i);
  expect(tokensTile).toHaveTextContent(/cache read/i);
  expect(tokensTile).toHaveTextContent(/cache write/i);
  expect(tokensTile).toHaveTextContent(/output/i);
});

test('empty: recorded and estimated tiles read as intentional, not broken', () => {
  render(<KpiRow activity={activityEmpty} costs={costsEmpty} tab="work" />);

  const recordedTile = screen.getByRole('group', {name: 'Recorded spend'});

  expect(recordedTile).toHaveTextContent('$0.00');
  expect(recordedTile).toHaveTextContent(/no recorded cost yet/i);

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent(/not available/i);
  expect(estimatedTile).not.toHaveTextContent('$');
});

test('exports a skeleton for AsyncSection with a matching tile count', () => {
  render(<KpiRowSkeleton />);

  // The grid is aria-hidden while loading; `hidden: true` opts the role
  // query into elements normally excluded from the accessibility tree.
  expect(screen.getAllByRole('group', {hidden: true})).toHaveLength(4);
});
