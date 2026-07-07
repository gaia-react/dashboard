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

const busyStateFor = (label: string): null | string =>
  screen.getByRole('region', {name: label}).getAttribute('aria-busy');

const expectAllBusy = (labels: string[], busy: boolean): void => {
  for (const label of labels) {
    expect(busyStateFor(label)).toBe(String(busy));
  }
};

// The KPI row sits above the tab strip; the Work tab (default) shows the
// specs & plans cost table. Sections on the other tabs are not mounted until
// their tab is active.
const workTabLabels = ['Key metrics', 'Specs and plans'];
const activityTabLabels = [
  'Activity',
  'Model mix',
  'Cost trend',
  'Parse health',
];

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

test('renders the GAIA wordmark', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(screen.getByText('Dashboard')).toBeInTheDocument();
});

test('defaults to the Work tab, mounting only its sections', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(
    screen.getByRole('tab', {name: 'Work', selected: true})
  ).toBeInTheDocument();
  expectAllBusy(workTabLabels, true);
  // Other tabs' sections are not in the DOM until selected.
  expect(
    screen.queryByRole('region', {name: 'Sessions'})
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', {name: 'Model mix'})
  ).not.toBeInTheDocument();
});

test('selecting a tab updates the URL and swaps the mounted sections', async () => {
  stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  fireEvent.click(screen.getByRole('tab', {name: 'Activity'}));

  await waitFor(() => {
    expect(window.location.search).toBe('?tab=activity');
  });

  for (const label of activityTabLabels) {
    expect(screen.getByRole('region', {name: label})).toBeInTheDocument();
  }
  expect(
    screen.queryByRole('region', {name: 'Specs and plans'})
  ).not.toBeInTheDocument();
});

test('honors the tab in the URL on first render', () => {
  window.history.replaceState(null, '', '/?tab=sessions');
  stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  expect(
    screen.getByRole('tab', {name: 'Sessions', selected: true})
  ).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Sessions'})).toBeInTheDocument();
});

test('the Work cost table paints while the activity scan is still pending', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expect(busyStateFor('Specs and plans')).toBe('false');
  });
  // The KPI row needs activity too, so it stays busy until the scan lands.
  expect(busyStateFor('Key metrics')).toBe('true');

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
  await waitFor(() => {
    expectAllBusy(workTabLabels, false);
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
    expectAllBusy(workTabLabels, false);
  });

  fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));

  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/costs')).toBe(2);
  });
  expect(callsTo(fetchMock, '/api/activity')).toBe(2);
});

test('a costs failure surfaces an error with a retry on every mounted section that needs costs', async () => {
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
    // On the Work tab, "Key metrics" (both-resource) and "Specs and plans"
    // (costs-only) both surface the costs failure.
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
    'connection refused'
  );

  fireEvent.click(screen.getAllByRole('button', {name: 'Retry'})[0]);

  await waitFor(() => {
    expect(
      screen.getByText('my-app · /Users/you/projects/my-app')
    ).toBeInTheDocument();
  });
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
});
