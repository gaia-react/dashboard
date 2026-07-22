import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import DashboardHeader, {
  TopBarSkeleton,
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

// Parsing through the real response schema is the fixture's honesty check: a
// malformed fixture fails here with a clear Zod error, not a cryptic
// component-rendering failure below.
const costsPopulated: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-populated.json')
);
const activityPopulated: ActivityResponse = activityResponseSchema.parse(
  readFixture('activity-populated.json')
);

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

test('renders the wordmark, project name, project root, freshness line, tabs, and refresh', () => {
  render(
    <DashboardHeader
      activeTab="work"
      activity={activityPopulated}
      costs={costsPopulated}
      isRefreshing={false}
      onSelectTab={vi.fn()}
      refresh={vi.fn()}
    />
  );

  expect(screen.getByAltText('')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {level: 1, name: 'my-app'})
  ).toBeInTheDocument();
  expect(screen.getByText('/Users/you/projects/my-app')).toBeInTheDocument();
  // The exact relative suffix depends on wall-clock time relative to the
  // fixture's fixed `scannedAt` (useRelativeTime.test.ts pins the exact
  // bucketing); only the static counts are asserted verbatim here.
  expect(
    screen.getByText(/^Scanned 3 sessions, 23 specs, updated /)
  ).toBeInTheDocument();
  expect(
    screen.getByRole('tab', {name: 'Work', selected: true})
  ).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Refresh'})).toBeInTheDocument();
});

test('the identity button resets to the Work tab and drops every other query param', () => {
  window.history.pushState(null, '', '/?tab=activity&entry=spec-1&filter=spec');

  render(
    <DashboardHeader
      activeTab="activity"
      activity={activityPopulated}
      costs={costsPopulated}
      isRefreshing={false}
      onSelectTab={vi.fn()}
      refresh={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', {name: /my-app/}));

  const params = new URLSearchParams(window.location.search);

  expect(params.get('tab')).toBe('work');
  expect(params.has('entry')).toBe(false);
  expect(params.has('filter')).toBe(false);
});

test('clicking a tab reports it to onSelectTab', () => {
  const onSelectTab = vi.fn();

  render(
    <DashboardHeader
      activeTab="work"
      activity={activityPopulated}
      costs={costsPopulated}
      isRefreshing={false}
      onSelectTab={onSelectTab}
      refresh={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('tab', {name: 'Sessions'}));

  expect(onSelectTab).toHaveBeenCalledWith('sessions');
});

test('the refresh button calls refresh and holds a stable accessible name while idle', () => {
  const refresh = vi.fn();

  render(
    <DashboardHeader
      activeTab="work"
      activity={activityPopulated}
      costs={costsPopulated}
      isRefreshing={false}
      onSelectTab={vi.fn()}
      refresh={refresh}
    />
  );

  const button = screen.getByRole('button', {name: 'Refresh'});

  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('while a refetch is in flight, refresh is disabled and its own label becomes "Refreshing"', () => {
  render(
    <DashboardHeader
      activeTab="work"
      activity={activityPopulated}
      costs={costsPopulated}
      isRefreshing={true}
      onSelectTab={vi.fn()}
      refresh={vi.fn()}
    />
  );

  // The accessible name change itself IS the announcement (DESIGN-SPEC C-08):
  // there is no separate live region for this.
  const button = screen.getByRole('button', {name: 'Refreshing'});

  expect(button).toBeDisabled();
  expect(
    screen.queryByRole('button', {name: 'Refresh'})
  ).not.toBeInTheDocument();
});

test('TopBarSkeleton renders a real, operable tab strip even before data has resolved', () => {
  const onSelectTab = vi.fn();

  render(<TopBarSkeleton activeTab="sessions" onSelectTab={onSelectTab} />);

  const tab = screen.getByRole('tab', {name: 'Work'});

  expect(tab).not.toHaveAttribute('aria-hidden');
  fireEvent.click(tab);
  expect(onSelectTab).toHaveBeenCalledWith('work');
  expect(
    screen.getByRole('tab', {name: 'Sessions', selected: true})
  ).toBeInTheDocument();
});

test('TopBarSkeleton hides only its identity and refresh placeholders from assistive tech', () => {
  render(<TopBarSkeleton activeTab="work" onSelectTab={vi.fn()} />);

  expect(screen.getByTestId('header-identity-skeleton')).toBeInTheDocument();
  expect(screen.getByTestId('identity-skeleton-region')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  // No accessible "Refresh" control exists yet: the real button is not
  // rendered until identity/freshness data has resolved.
  expect(
    screen.queryByRole('button', {name: /refresh/i})
  ).not.toBeInTheDocument();
});
