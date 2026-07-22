import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import App from '~/components/App';
import {activityResponseSchema, costsResponseSchema} from '~/data/schemas/api';
import activityFixture from '../../../../test/fixtures/api/activity.json';
import costsFixture from '../../../../test/fixtures/api/costs.json';

const jsonResponse = (body: unknown): Response =>
  Response.json(body, {status: 200});

type Deferred = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

const createDeferred = (): Deferred => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {promise, resolve};
};

const stubFetch = (
  routes: Record<string, () => Promise<Response>>
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = Object.entries(routes).find(([prefix]) =>
      url.startsWith(prefix)
    );

    if (!route) {
      throw new Error(`Unmatched fetch: ${url}`);
    }

    return route[1]();
  });
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const callsTo = (fetchMock: ReturnType<typeof vi.fn>, prefix: string): number =>
  fetchMock.mock.calls.filter(([input]) => String(input).startsWith(prefix))
    .length;

const busyStateFor = (label: string): null | string =>
  screen.getByRole('region', {name: label}).getAttribute('aria-busy');

const resolvedFetch = (): ReturnType<typeof vi.fn> =>
  stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

// The KPI row sits inside the Sessions and Insights panels only (DESIGN-SPEC
// 1.4: the Work tab has no KPI row, the selected event's own figures live in
// the detail panel's metric strip instead).
const insightsTabLabels = [
  'Key metrics',
  'Highlights',
  'Model Usage',
  'Cost trend',
  'Activity',
];

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

test('the api fixtures satisfy the response contract this suite renders against', () => {
  // The honesty check: App/useDashboardData read these fixtures with no
  // runtime parse, so a fixture that drifted out of contract shape would
  // otherwise fail with a cryptic rendering error three phases from now
  // rather than a clear Zod error here.
  expect(() => costsResponseSchema.parse(costsFixture)).not.toThrow();
  expect(() => activityResponseSchema.parse(activityFixture)).not.toThrow();
});

test('renders the GAIA wordmark before any data has resolved', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(screen.getByAltText('')).toBeInTheDocument();
});

test('defaults to the Work tab, mounting only its panel, with no KPI row', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(
    screen.getByRole('tab', {name: 'Work', selected: true})
  ).toBeInTheDocument();
  expect(busyStateFor('Events')).toBe('true');
  expect(
    screen.queryByRole('region', {name: 'Key metrics'})
  ).not.toBeInTheDocument();
  // Other tabs' sections are not in the DOM until selected.
  expect(
    screen.queryByRole('region', {name: 'Sessions'})
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', {name: 'Model Usage'})
  ).not.toBeInTheDocument();
});

test("selecting a tab updates the URL, swaps the mounted panel, and renders that panel's KPI row", async () => {
  resolvedFetch();

  render(<App />);

  fireEvent.click(screen.getByRole('tab', {name: 'Insights'}));

  await waitFor(() => {
    expect(window.location.search).toBe('?tab=activity');
  });

  for (const label of insightsTabLabels) {
    expect(screen.getByRole('region', {name: label})).toBeInTheDocument();
  }
  expect(
    screen.queryByRole('region', {name: 'Events'})
  ).not.toBeInTheDocument();
});

test('honors the tab in the URL on first render', () => {
  window.history.replaceState(null, '', '/?tab=sessions');
  resolvedFetch();

  render(<App />);

  expect(
    screen.getByRole('tab', {name: 'Sessions', selected: true})
  ).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Key metrics'})).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Sessions'})).toBeInTheDocument();
});

test('the Work events pane paints while the activity scan is still pending', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expect(busyStateFor('Events')).toBe('false');
  });
  // The list itself is real content, not a skeleton, entirely off /api/costs.
  expect(screen.getByRole('button', {name: /SPEC-023/})).toBeInTheDocument();

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
});

test('Cost trend on the Insights tab waits for both resources', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  fireEvent.click(screen.getByRole('tab', {name: 'Insights'}));

  await waitFor(() => {
    expect(window.location.search).toBe('?tab=activity');
  });
  expect(busyStateFor('Cost trend')).toBe('true');

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
  await waitFor(() => {
    expect(busyStateFor('Cost trend')).toBe('false');
  });
});

test('the top bar shows a skeleton with a real, operable tab strip until BOTH resources resolve', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  expect(screen.getByTestId('top-bar-skeleton')).toBeInTheDocument();
  expect(screen.queryByRole('heading', {level: 1})).not.toBeInTheDocument();
  // The tab strip is real and operable even while the identity is a
  // placeholder (DESIGN-SPEC C-07: tabs are present before data resolves).
  expect(
    screen.getByRole('tab', {name: 'Work', selected: true})
  ).toBeInTheDocument();

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });

  expect(screen.queryByTestId('top-bar-skeleton')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', {level: 1, name: 'my-app'})
  ).toBeInTheDocument();
  expect(
    screen.getByText(/^Scanned 2 sessions, 23 specs, updated /)
  ).toBeInTheDocument();
});

test('the refresh button refetches both endpoints', async () => {
  const fetchMock = resolvedFetch();

  render(<App />);

  await waitFor(() => {
    expect(busyStateFor('Events')).toBe('false');
  });

  fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));

  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/costs')).toBe(2);
  });
  expect(callsTo(fetchMock, '/api/activity')).toBe(2);
});

test('a costs failure surfaces one error with a retry, on the one Work-tab region that needs costs', async () => {
  let costsCalls = 0;
  const fetchMock = stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => {
      costsCalls += 1;

      return costsCalls === 1 ?
          Promise.reject(new Error('connection refused'))
        : Promise.resolve(jsonResponse(costsFixture));
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
  expect(screen.getByRole('alert')).toHaveTextContent('connection refused');

  fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

  await waitFor(() => {
    expect(screen.getByRole('button', {name: /SPEC-023/})).toBeInTheDocument();
  });
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
});

test('the coverage disclosure renders on the Insights tab when cost and activity history diverge, nowhere else', async () => {
  resolvedFetch();

  render(<App />);

  expect(screen.queryByText(/^Project started /)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', {name: 'Insights'}));
  await waitFor(() => {
    expect(window.location.search).toBe('?tab=activity');
  });

  // activitySince (2026-05-05T00:00:00Z) precedes costSince (2026-07-03).
  expect(screen.getByText('Project started 2026-05-05')).toBeInTheDocument();
});

test('the Sessions attribution badge jumps to the Work tab with that event selected', async () => {
  resolvedFetch();
  window.history.pushState(null, '', '/?tab=sessions');

  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('region', {name: 'Sessions'})).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('link', {name: 'PLAN-002'}));

  const params = new URLSearchParams(window.location.search);

  expect(params.get('tab')).toBe('work');
  expect(params.get('entry')).toBe('PLAN-002');
  expect(
    await screen.findByRole('heading', {level: 2, name: 'PLAN-002'})
  ).toBeInTheDocument();
});

test('a Work event\'s "View in sessions" link jumps to the Sessions tab and lands on that session', async () => {
  resolvedFetch();

  render(<App />);
  // SPEC-023 (the default selection) carries a linked session that only
  // resolves once /api/activity lands.
  await screen.findByRole('link', {name: 'View in sessions'});

  fireEvent.click(screen.getByRole('link', {name: 'View in sessions'}));

  const params = new URLSearchParams(window.location.search);

  expect(params.get('tab')).toBe('sessions');
  expect(params.get('id')).toBe('3158fe6d-4480-42d3-8e70-1c4ecbfc2057');
  expect(
    await screen.findByText('Wire cost telemetry into the ledger')
  ).toBeInTheDocument();
});
