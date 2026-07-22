import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import Work from '~/components/Sections/Work';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {activityResponseSchema, costsResponseSchema} from '~/data/schemas/api';
import type {ApiResourceState} from '~/hooks/useApiResource';

/**
 * Vitest runs from the repo root; happy-dom rewrites `import.meta.url` to an
 * http URL, so dom-environment tests resolve fixtures from cwd instead.
 * Parsed through the real response schemas (same discipline as
 * `Work/tests/events.test.ts`) so a drifted fixture fails here, not inside a
 * render.
 */
const readFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
  );

const costs: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-response.json')
);
const costsEmpty: CostsResponse = costsResponseSchema.parse(
  readFixture('costs-empty.json')
);

// SPEC-032 carries one linked session with `logFound: true`
// (3158fe6d-4480-42d3-8e70-1c4ecbfc2057); this is what lets the same fixture
// exercise the skeleton-row-vs-resolved-row seam Work owns (build the join
// once activity resolves, render skeleton rows until then).
const activityWithSession: ActivityResponse = activityResponseSchema.parse({
  heatmap: [],
  kpis: {activeDays: 0, estimatedAdHocDollars: null, totalTokens: 0},
  modelTotals: [],
  modelWeekly: [],
  parseHealth: {counters: [], notes: [], unknownKinds: [], unknownStatuses: []},
  scan: {
    activitySince: null,
    fileCount: 0,
    scannedAt: '2026-07-15T12:00:00Z',
    sessionCount: 1,
  },
  sessions: [
    {
      attribution: {entryType: 'spec', key: 'SPEC-032'},
      dollars: null,
      durationSeconds: 900,
      endedAt: '2026-07-14T09:15:00Z',
      gitBranch: null,
      models: ['claude-opus-4-8'],
      sessionId: '3158fe6d-4480-42d3-8e70-1c4ecbfc2057',
      startedAt: '2026-07-14T09:00:00Z',
      title: 'Adversarial audit drill-down',
      totalTokens: 12_000,
      turnCount: 3,
    },
  ],
});

const loading: ApiResourceState<never> = {status: 'loading'};
const activityLoading: ApiResourceState<ActivityResponse> = {status: 'loading'};
const costsSuccess: ApiResourceState<CostsResponse> = {
  data: costs,
  status: 'success',
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

test('while costs is loading, both panes show their skeletons and no real content', () => {
  render(
    <Work
      activityState={activityLoading}
      costsState={loading}
      refresh={vi.fn()}
    />
  );

  expect(screen.getByTestId('event-list-skeleton')).toBeInTheDocument();
  expect(screen.getByTestId('event-detail-skeleton')).toBeInTheDocument();
  expect(screen.queryByRole('heading', {level: 2})).not.toBeInTheDocument();
});

test('on a costs failure, the list pane shows ErrorState with retry and the detail pane renders nothing', () => {
  const refresh = vi.fn();

  render(
    <Work
      activityState={activityLoading}
      costsState={{message: 'connection refused', status: 'error'}}
      refresh={refresh}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('connection refused');
  expect(screen.queryByTestId('event-detail')).not.toBeInTheDocument();
  expect(screen.queryByText('Select an event')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('with no ?entry= in the URL, the most recent event is selected by default', () => {
  render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  // The command:gaia-debt...7b0a row (2026-07-15) is the newest event in the
  // fixture, newer than every spec/plan/review row.
  expect(
    screen.getByRole('heading', {level: 2, name: 'gaia-debt'})
  ).toBeInTheDocument();
});

test('clicking a card writes its key to ?entry= and swaps the detail panel to it', () => {
  render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', {name: /SPEC-018/}));

  expect(new URLSearchParams(window.location.search).get('entry')).toBe(
    'SPEC-018'
  );
  expect(
    screen.getByRole('heading', {level: 2, name: 'SPEC-018'})
  ).toBeInTheDocument();
});

test('changing the filter clears the prior selection and narrows the list to the new category', () => {
  render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  fireEvent.change(screen.getByRole('combobox', {name: 'Filter'}), {
    target: {value: 'forensics'},
  });

  const params = new URLSearchParams(window.location.search);

  expect(params.get('filter')).toBe('forensics');
  expect(params.has('entry')).toBe(false);
  // The sole forensics command becomes the default selection under the new
  // filter, and the spec that was selected before is no longer in the list.
  expect(
    screen.getByRole('heading', {level: 2, name: 'gaia-forensics'})
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', {name: /SPEC-032/})
  ).not.toBeInTheDocument();
});

test('a deep link to an event the current filter hides resets the filter to All events, rather than showing an empty panel', async () => {
  window.history.pushState(null, '', '/?filter=debt&entry=SPEC-032');

  render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  // SPEC-032 renders immediately even though the URL still names the
  // now-stale "debt" filter: the render never waits on the correction.
  expect(
    screen.getByRole('heading', {level: 2, name: 'SPEC-032'})
  ).toBeInTheDocument();

  await waitFor(() => {
    expect(
      new URLSearchParams(window.location.search).get('filter')
    ).toBeNull();
  });
});

test('an ?entry= naming nothing in the list falls back to the most recent event and drops the param', async () => {
  window.history.pushState(null, '', '/?entry=SPEC-999');

  render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  expect(
    screen.getByRole('heading', {level: 2, name: 'gaia-debt'})
  ).toBeInTheDocument();

  await waitFor(() => {
    expect(new URLSearchParams(window.location.search).has('entry')).toBe(
      false
    );
  });
});

test('a project with no events at all shows the empty list AND the empty selection state together', () => {
  render(
    <Work
      activityState={activityLoading}
      costsState={{data: costsEmpty, status: 'success'}}
      refresh={vi.fn()}
    />
  );

  expect(screen.getByText('No GAIA events yet')).toBeInTheDocument();
  expect(screen.getByText('Select an event')).toBeInTheDocument();
});

test('the session join is built once activity resolves; a linked session row is a skeleton until then', () => {
  window.history.pushState(null, '', '/?entry=SPEC-032');

  const {rerender} = render(
    <Work
      activityState={activityLoading}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  expect(screen.getByTestId('linked-session-skeleton')).toBeInTheDocument();

  rerender(
    <Work
      activityState={{data: activityWithSession, status: 'success'}}
      costsState={costsSuccess}
      refresh={vi.fn()}
    />
  );

  expect(
    screen.queryByTestId('linked-session-skeleton')
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('region', {name: 'SPEC-032'})).getByText(
      'Adversarial audit drill-down'
    )
  ).toBeInTheDocument();
});

test('the linked-session jump link forwards onViewSession with the session id', () => {
  window.history.pushState(null, '', '/?entry=SPEC-032');
  const onViewSession = vi.fn();

  render(
    <Work
      activityState={{data: activityWithSession, status: 'success'}}
      costsState={costsSuccess}
      onViewSession={onViewSession}
      refresh={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('link', {name: 'View in sessions'}));

  expect(onViewSession).toHaveBeenCalledWith(
    '3158fe6d-4480-42d3-8e70-1c4ecbfc2057'
  );
});
