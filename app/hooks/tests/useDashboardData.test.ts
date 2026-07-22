import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {useDashboardData} from '~/hooks/useDashboardData';
import activityFixture from '../../../test/fixtures/api/activity.json';
import costsFixture from '../../../test/fixtures/api/costs.json';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

test('requests costs and timezone-tagged activity', async () => {
  const fetchMock = stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  const {result} = renderHook(() => useDashboardData());

  await waitFor(() => {
    expect(result.current.costs.state.status).toBe('success');
  });
  const {timeZone} = Intl.DateTimeFormat().resolvedOptions();
  expect(fetchMock).toHaveBeenCalledWith('/api/costs');
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/activity?tz=${encodeURIComponent(timeZone)}`
  );
});

test('costs paint while the activity scan is still pending', async () => {
  const activityDeferred = createDeferred();
  stubFetch({
    '/api/activity': async () => activityDeferred.promise,
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  const {result} = renderHook(() => useDashboardData());

  await waitFor(() => {
    expect(result.current.costs.state.status).toBe('success');
  });
  expect(result.current.activity.state.status).toBe('loading');

  await act(async () => {
    activityDeferred.resolve(jsonResponse(activityFixture));
    await activityDeferred.promise;
  });
  await waitFor(() => {
    expect(result.current.activity.state).toEqual({
      data: activityFixture,
      status: 'success',
    });
  });
});

test('refresh refetches both endpoints and raises the combined isRefreshing while holding the render', async () => {
  const fetchMock = stubFetch({
    '/api/activity': async () => jsonResponse(activityFixture),
    '/api/costs': async () => jsonResponse(costsFixture),
  });

  const {result} = renderHook(() => useDashboardData());

  await waitFor(() => {
    expect(result.current.activity.state.status).toBe('success');
  });
  await waitFor(() => {
    expect(result.current.costs.state.status).toBe('success');
  });
  expect(result.current.isRefreshing).toBe(false);

  act(() => {
    result.current.refresh();
  });

  // Holds the render (DESIGN-SPEC 7.3, defect 7): both resources stay
  // 'success' with their previous data instead of flashing back to
  // 'loading'; the combined isRefreshing carries the busy signal instead.
  expect(result.current.costs.state.status).toBe('success');
  expect(result.current.activity.state.status).toBe('success');
  expect(result.current.isRefreshing).toBe(true);

  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/costs')).toBe(2);
  });
  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/activity')).toBe(2);
  });
  await waitFor(() => {
    expect(result.current.isRefreshing).toBe(false);
  });
});
