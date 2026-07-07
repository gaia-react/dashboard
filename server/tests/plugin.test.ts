import {beforeEach, describe, expect, test, vi} from 'vitest';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {gaiaDashboardApiPlugin} from '../plugin';

/**
 * Handlers are stubbed via a fake `server.ssrLoadModule` (never invoked for
 * real): this proves the plugin's ROUTING (method + path dispatch, query
 * pass-through, fallthrough to `next`, and the `ssrLoadModule` load itself)
 * wires to the adapter correctly. The hard rule is tests never read
 * `../gaia`; the real `getCosts`/`handleActivity` pipeline is exercised by
 * the handler-level fixture tests and the live validation harness, not here.
 */
const getCostsMock = vi.fn(async () => ({source: 'costs'}));
const handleActivityMock = vi.fn(async () => ({source: 'activity'}));

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void
) => void;

type MockResponse = {
  end: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  statusCode: number;
};

const makeResponse = (): MockResponse => ({
  end: vi.fn(),
  setHeader: vi.fn(),
  statusCode: 200,
});

const makeRequest = (method: string, url: string): IncomingMessage =>
  ({method, url}) as unknown as IncomingMessage;

const unregisteredMiddleware: Middleware = (_request, _response, _next) => {
  throw new Error('middleware was never registered');
};

/** Stubs the two modules the plugin loads via `server.ssrLoadModule`. */
const ssrLoadModule = async (specifier: string): Promise<unknown> => {
  if (specifier === '~/data/handlers/costs') {
    return {getCosts: getCostsMock};
  }

  if (specifier === '~/data/handlers/activity') {
    return {handleActivity: handleActivityMock};
  }

  throw new Error(`unexpected ssrLoadModule specifier: ${specifier}`);
};

/** Mounts the plugin against a fake ViteDevServer and returns the one
 * middleware it registers via `server.middlewares.use`. */
const mountMiddleware = (): Middleware => {
  let middleware: Middleware = unregisteredMiddleware;
  const fakeServer = {
    middlewares: {
      use: (handler: Middleware) => {
        middleware = handler;
      },
    },
    ssrLoadModule,
  };

  const configureServer = gaiaDashboardApiPlugin().configureServer as (
    server: typeof fakeServer
  ) => void;

  configureServer(fakeServer);

  return middleware;
};

beforeEach(() => {
  getCostsMock.mockClear();
  handleActivityMock.mockClear();
});

describe('gaiaDashboardApiPlugin', () => {
  test('GET /api/costs dispatches to the costs handler', async () => {
    const middleware = mountMiddleware();
    const response = makeResponse();
    const next = vi.fn();

    middleware(
      makeRequest('GET', '/api/costs'),
      response as unknown as ServerResponse,
      next
    );
    await vi.waitFor(() => {
      expect(response.end).toHaveBeenCalledWith(
        JSON.stringify({source: 'costs'})
      );
    });

    expect(getCostsMock).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
  });

  test('GET /api/activity?tz=... dispatches to the activity handler with the decoded query', async () => {
    const middleware = mountMiddleware();
    const response = makeResponse();
    const next = vi.fn();

    middleware(
      makeRequest('GET', '/api/activity?tz=Asia%2FTokyo'),
      response as unknown as ServerResponse,
      next
    );
    await vi.waitFor(() => {
      expect(response.end).toHaveBeenCalledWith(
        JSON.stringify({source: 'activity'})
      );
    });

    expect(handleActivityMock).toHaveBeenCalledWith(expect.anything(), {
      tz: 'Asia/Tokyo',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('an unmatched path falls through to next, untouched', () => {
    const middleware = mountMiddleware();
    const next = vi.fn();

    middleware(
      makeRequest('GET', '/index.html'),
      makeResponse() as unknown as ServerResponse,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(getCostsMock).not.toHaveBeenCalled();
    expect(handleActivityMock).not.toHaveBeenCalled();
  });

  test('a non-GET method on an API path falls through to next (no refresh endpoint, PLAN D3)', () => {
    const middleware = mountMiddleware();
    const next = vi.fn();

    middleware(
      makeRequest('POST', '/api/costs'),
      makeResponse() as unknown as ServerResponse,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(getCostsMock).not.toHaveBeenCalled();
  });
});
