import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import App from '~/components/App';
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

// All seven SPEC section 6.2-6.8 AsyncSection regions the shell composes.
const sectionLabels = [
  'Key metrics',
  'Specs and plans',
  'Activity',
  'Model mix',
  'Sessions',
  'Cost trend',
  'Parse health',
];

// DashboardHeader/KpiRow (6.1/6.2) and the ParseHealth footer (6.8) read
// fields from BOTH resources, so they cannot paint until costs AND activity
// have resolved. CostTable and CostTrend read only costs (PLAN D2).
const bothResourceLabels = ['Key metrics', 'Parse health'];
const costsOnlyLabels = ['Specs and plans', 'Cost trend'];
const activityOnlyLabels = ['Activity', 'Model mix', 'Sessions'];

const busyStateFor = (label: string): null | string =>
  screen.getByRole('region', {name: label}).getAttribute('aria-busy');

const expectAllBusy = (labels: string[], busy: boolean): void => {
  for (const label of labels) {
    expect(busyStateFor(label)).toBe(String(busy));
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test('renders the GAIA wordmark', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(screen.getByText('Dashboard')).toBeInTheDocument();
});

test('renders a busy region for every section while both endpoints are pending', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expectAllBusy(sectionLabels, true);
});

test('cost-only sections paint while the activity scan is still pending', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expectAllBusy(costsOnlyLabels, false);
  });
  // Two-resource sections stay busy: they need activity too, not just costs.
  expectAllBusy(bothResourceLabels, true);
  expectAllBusy(activityOnlyLabels, true);

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
  await waitFor(() => {
    expectAllBusy(sectionLabels, false);
  });
});

test('the header shows a skeleton until BOTH resources resolve, then the real identity', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  expect(
    screen.getByText('project · /Users/you/projects/project')
  ).toBeInTheDocument();

  // Costs alone resolving is not enough: the header still needs activity.
  await waitFor(() => {
    expect(busyStateFor('Specs and plans')).toBe('false');
  });
  expect(
    screen.getByText('project · /Users/you/projects/project')
  ).toBeInTheDocument();

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });

  const identity = await screen.findByText(
    'my-app · /Users/you/projects/my-app'
  );

  expect(identity).toHaveClass('text-sm', 'text-fg-dim');
  expect(
    screen.queryByText('project · /Users/you/projects/project')
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/^Scanned 2 sessions · 23 specs ·/)
  ).toBeInTheDocument();
});

test('the refresh button refetches both endpoints', async () => {
  const fetchMock = stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expectAllBusy(sectionLabels, false);
  });

  fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));

  await waitFor(() => {
    expectAllBusy(sectionLabels, false);
  });
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
  expect(callsTo(fetchMock, '/api/activity')).toBe(2);
});

test('a costs failure surfaces an error with a retry on every section that needs costs', async () => {
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
    // "Specs and plans", "Cost trend" (costs-only) plus "Key metrics",
    // "Parse health" (both-resource) all surface the costs failure.
    expect(screen.getAllByRole('alert')).toHaveLength(4);
  });
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
    'connection refused'
  );
  // Activity-only sections are unaffected by the costs failure.
  expectAllBusy(activityOnlyLabels, false);

  fireEvent.click(screen.getAllByRole('button', {name: 'Retry'})[0]);

  await waitFor(() => {
    expect(
      screen.getByText('my-app · /Users/you/projects/my-app')
    ).toBeInTheDocument();
  });
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
});
