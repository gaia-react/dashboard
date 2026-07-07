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

const sectionLabels = [
  'Key metrics',
  'Specs and plans',
  'Activity',
  'Model mix',
  'Sessions',
  'Cost trend',
  'Parse health',
];

afterEach(() => {
  vi.unstubAllGlobals();
});

test('renders the GAIA wordmark', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  expect(screen.getByAltText('GAIA')).toBeInTheDocument();
});

test('renders a busy skeleton slot for every section while loading', () => {
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => createDeferred().promise,
  });

  render(<App />);

  for (const label of sectionLabels) {
    expect(screen.getByRole('region', {name: label})).toHaveAttribute(
      'aria-busy',
      'true'
    );
  }
});

test('cost sections paint while the activity scan is still pending', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('region', {name: 'Key metrics'})).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });
  expect(
    screen.getByText('my-app · /Users/you/projects/my-app')
  ).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
    'aria-busy',
    'true'
  );

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
  await waitFor(() => {
    expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });
});

test('the header identity swaps skeleton for content in the same typography', async () => {
  const costsDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => createDeferred().promise,
    '/api/costs': async () => costsDeferred.promise,
  });

  render(<App />);

  const identitySkeleton = screen.getByText(
    'project · /Users/you/projects/project'
  );
  expect(identitySkeleton).toHaveClass('text-sm', 'text-transparent');

  await act(async () => {
    costsDeferred.resolve(jsonResponse(costsFixture));
    await costsDeferred.promise;
  });

  const identity = await screen.findByText(
    'my-app · /Users/you/projects/my-app'
  );
  expect(identity).toHaveClass('text-sm', 'text-fg-dim');
  expect(
    screen.queryByText('project · /Users/you/projects/project')
  ).not.toBeInTheDocument();
});

test('the refresh button refetches both endpoints', async () => {
  const fetchMock = stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });

  fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));

  await waitFor(() => {
    expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
  expect(callsTo(fetchMock, '/api/activity')).toBe(2);
});

test('cost slots surface an error with a retry that refetches', async () => {
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
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
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
  expect(callsTo(fetchMock, '/api/costs')).toBe(2);
});
