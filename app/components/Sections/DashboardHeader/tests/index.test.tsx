import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import DashboardHeader, {
  DashboardHeaderSkeleton,
} from '~/components/Sections/DashboardHeader';
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

test('renders the wordmark, project identity, freshness line, and a working refresh button', () => {
  const refresh = vi.fn();

  render(
    <DashboardHeader
      activity={activityPopulated}
      costs={costsPopulated}
      refresh={refresh}
    />
  );

  expect(screen.getByAltText('GAIA')).toBeInTheDocument();
  expect(
    screen.getByText('my-app · /Users/you/projects/my-app')
  ).toBeInTheDocument();
  // Recency wording ("just now" vs "N days ago") depends on wall-clock time
  // relative to the fixed fixture timestamp; format-header.test.ts already
  // pins the exact bucketing under a controlled clock, so only the
  // session/spec-count prefix is asserted here.
  expect(
    screen.getByText((content) =>
      content.startsWith('Scanned 3 sessions · 23 specs ·')
    )
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('shows the project start date as the earlier of cost and activity history', () => {
  render(
    <DashboardHeader
      activity={activityPopulated}
      costs={costsPopulated}
      refresh={vi.fn()}
    />
  );

  // activitySince (2026-05-05T08:00:00Z) precedes costSince (2026-07-03); the
  // 08:00Z time keeps it on the 5th across US zones, so the date is stable.
  expect(screen.getByText('Project started 2026-05-05')).toBeInTheDocument();
  expect(screen.queryByText(/Cost tracking began/)).not.toBeInTheDocument();
});

test('derives the project start from activity alone when there is no cost history', () => {
  render(
    <DashboardHeader
      activity={activityEmpty}
      costs={costsEmpty}
      refresh={vi.fn()}
    />
  );

  expect(screen.getByText(/^Project started /)).toBeInTheDocument();
  // Freshness still populates from activity alone (empty-project state).
  expect(
    screen.getByText((content) =>
      content.startsWith('Scanned 2 sessions · 0 specs ·')
    )
  ).toBeInTheDocument();
});

test('the skeleton mirrors the identity block max width so the data swap does not reflow', () => {
  const {unmount} = render(<DashboardHeaderSkeleton />);
  const skeletonIdentity = screen.getByTestId('header-identity-skeleton');
  const skeletonWidthClass = [...skeletonIdentity.classList].find((name) =>
    name.startsWith('max-w-')
  );

  unmount();

  render(
    <DashboardHeader
      activity={activityPopulated}
      costs={costsPopulated}
      refresh={vi.fn()}
    />
  );
  const realIdentity = screen.getByText('my-app · /Users/you/projects/my-app');

  expect(skeletonWidthClass).toBeDefined();
  expect(realIdentity).toHaveClass(skeletonWidthClass as string);
});
