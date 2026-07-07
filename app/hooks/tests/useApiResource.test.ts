import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {useApiResource} from '~/hooks/useApiResource';

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {status});

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

test('refetch returns to loading and lands the fresh data', async () => {
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

  act(() => {
    result.current.refetch();
  });

  expect(result.current.state.status).toBe('loading');
  await waitFor(() => {
    expect(result.current.state).toEqual({data: {value: 2}, status: 'success'});
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
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
