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

test('populated: recorded and estimated spend render as distinct, basis-labeled tiles', () => {
  render(<KpiRow activity={activityPopulated} costs={costsPopulated} />);

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

test('populated: renders a lower-bound marker on the estimated tile when flagged', () => {
  render(<KpiRow activity={activityPopulated} costs={costsPopulated} />);

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent(/lower bound/i);
});

test('populated: specs, plans, sessions, tokens, and active-day tiles state their basis', () => {
  render(<KpiRow activity={activityPopulated} costs={costsPopulated} />);

  expect(screen.getByRole('group', {name: 'Specs merged'})).toHaveTextContent(
    '20 / 23'
  );
  expect(screen.getByRole('group', {name: 'Plans'})).toHaveTextContent('6');
  expect(screen.getByRole('group', {name: 'Sessions'})).toHaveTextContent('3');
  expect(screen.getByRole('group', {name: 'Active days'})).toHaveTextContent(
    '62'
  );

  for (const tile of [
    screen.getByRole('group', {name: 'Sessions'}),
    screen.getByRole('group', {name: 'Active days'}),
    screen.getByRole('group', {name: 'Total tokens'}),
  ]) {
    expect(tile).toHaveTextContent(/all activity/i);
  }
});

test('populated: the total-tokens tile is a closed-by-default disclosure with the bucket split', () => {
  render(<KpiRow activity={activityPopulated} costs={costsPopulated} />);

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

test('empty: recorded and estimated tiles read as intentional, not broken, while activity KPIs still populate', () => {
  render(<KpiRow activity={activityEmpty} costs={costsEmpty} />);

  const recordedTile = screen.getByRole('group', {name: 'Recorded spend'});

  expect(recordedTile).toHaveTextContent('$0.00');
  expect(recordedTile).toHaveTextContent(/no recorded cost yet/i);

  const estimatedTile = screen.getByRole('group', {
    name: 'Estimated ad hoc spend',
  });

  expect(estimatedTile).toHaveTextContent(/not available/i);
  expect(estimatedTile).not.toHaveTextContent('$');

  expect(screen.getByRole('group', {name: 'Sessions'})).toHaveTextContent('2');
  expect(screen.getByRole('group', {name: 'Active days'})).toHaveTextContent(
    '4'
  );
});

test('exports a skeleton for AsyncSection with a matching tile count', () => {
  render(<KpiRowSkeleton />);

  // The grid is aria-hidden while loading; `hidden: true` opts the role
  // query into elements normally excluded from the accessibility tree.
  expect(screen.getAllByRole('group', {hidden: true})).toHaveLength(7);
});
