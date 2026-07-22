import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {useApiResource} from '~/hooks/useApiResource';

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {status});

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

afterEach(() => {
  vi.unstubAllGlobals();
});

test('starts loading and resolves to success with the response data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({value: 42})));

  const {result} = renderHook(() =>
    useApiResource<{value: number}>('/api/costs')
  );

  expect(result.current.state.status).toBe('loading');
  await waitFor(() => {
    expect(result.current.state).toEqual({
      data: {value: 42},
      status: 'success',
    });
  });
});

test('surfaces the server error message on a non-200 response', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          {error: {code: 'scan_failed', message: 'Session scan failed'}},
          500
        )
      )
  );

  const {result} = renderHook(() => useApiResource('/api/activity'));

  await waitFor(() => {
    expect(result.current.state).toEqual({
      message: 'Session scan failed',
      status: 'error',
    });
  });
});

test('falls back to the status code when the error body is not JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('boom', {status: 502}))
  );

  const {result} = renderHook(() => useApiResource('/api/costs'));

  await waitFor(() => {
    expect(result.current.state).toEqual({
      message: 'Request failed with status 502',
      status: 'error',
    });
  });
});

test('surfaces a network failure as an error state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('connection refused'))
  );

  const {result} = renderHook(() => useApiResource('/api/costs'));

  await waitFor(() => {
    expect(result.current.state).toEqual({
      message: 'connection refused',
      status: 'error',
    });
  });
});

test('refetch holds the previous render, raises isRefreshing, and lands the fresh data', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({value: 1}))
    .mockResolvedValueOnce(jsonResponse({value: 2}));
  vi.stubGlobal('fetch', fetchMock);

  const {result} = renderHook(() =>
    useApiResource<{value: number}>('/api/costs')
  );

  await waitFor(() => {
    expect(result.current.state).toEqual({data: {value: 1}, status: 'success'});
  });
  expect(result.current.isRefreshing).toBe(false);

  act(() => {
    result.current.refetch();
  });

  // Holds the previous render (DESIGN-SPEC 7.3, defect 7): status stays
  // 'success' with the prior data instead of flashing back to 'loading'.
  // isRefreshing is the busy signal a caller reads instead.
  expect(result.current.state).toEqual({data: {value: 1}, status: 'success'});
  expect(result.current.isRefreshing).toBe(true);

  await waitFor(() => {
    expect(result.current.state).toEqual({data: {value: 2}, status: 'success'});
  });
  expect(result.current.isRefreshing).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a late response from a superseded refetch cannot lower isRefreshing for the newer one', async () => {
  const firstRefetch = createDeferred();
  const secondRefetch = createDeferred();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({value: 1}))
    .mockReturnValueOnce(firstRefetch.promise)
    .mockReturnValueOnce(secondRefetch.promise);
  vi.stubGlobal('fetch', fetchMock);

  const {result} = renderHook(() =>
    useApiResource<{value: number}>('/api/costs')
  );

  await waitFor(() => {
    expect(result.current.state.status).toBe('success');
  });

  act(() => {
    result.current.refetch();
  });
  act(() => {
    result.current.refetch();
  });

  expect(result.current.isRefreshing).toBe(true);

  await act(async () => {
    firstRefetch.resolve(jsonResponse({value: 2}));
    await firstRefetch.promise;
  });

  // The superseded request's late arrival must not lower isRefreshing or
  // apply its data; the newer refetch (requestIdRef) is still in flight.
  expect(result.current.isRefreshing).toBe(true);
  expect(result.current.state).toEqual({data: {value: 1}, status: 'success'});

  await act(async () => {
    secondRefetch.resolve(jsonResponse({value: 3}));
    await secondRefetch.promise;
  });

  expect(result.current.isRefreshing).toBe(false);
  expect(result.current.state).toEqual({data: {value: 3}, status: 'success'});
});

test('a failed refetch replaces the stale data with the error state and clears isRefreshing', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({value: 1}))
    .mockRejectedValueOnce(new Error('connection refused'));
  vi.stubGlobal('fetch', fetchMock);

  const {result} = renderHook(() =>
    useApiResource<{value: number}>('/api/costs')
  );

  await waitFor(() => {
    expect(result.current.state).toEqual({data: {value: 1}, status: 'success'});
  });

  act(() => {
    result.current.refetch();
  });

  await waitFor(() => {
    expect(result.current.state).toEqual({
      message: 'connection refused',
      status: 'error',
    });
  });
  expect(result.current.isRefreshing).toBe(false);
});

test('refetch recovers from an error state', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('connection refused'))
    .mockResolvedValueOnce(jsonResponse({value: 7}));
  vi.stubGlobal('fetch', fetchMock);

  const {result} = renderHook(() =>
    useApiResource<{value: number}>('/api/costs')
  );

  await waitFor(() => {
    expect(result.current.state.status).toBe('error');
  });

  act(() => {
    result.current.refetch();
  });

  await waitFor(() => {
    expect(result.current.state).toEqual({data: {value: 7}, status: 'success'});
  });
});
