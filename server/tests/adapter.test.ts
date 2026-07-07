import {describe, expect, test, vi} from 'vitest';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createNodeHandler, getAdapterContext} from '../adapter';

/**
 * `createNodeHandler` is exercised with trivial stub handlers here (plumbing
 * only: context building, query parsing, JSON serialization, error mapping).
 * `getCosts` / `handleActivity` wired through the real adapter are covered by
 * the live validation in P3 (server.plugin mounted against `../gaia`).
 */

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

const makeRequest = (url: string): IncomingMessage =>
  ({url}) as unknown as IncomingMessage;

const bodyOf = (response: MockResponse): unknown =>
  JSON.parse(response.end.mock.calls[0]?.[0] as string);

describe('createNodeHandler', () => {
  test('serializes the resolved value as a 200 JSON body', async () => {
    const handle = createNodeHandler(async () => ({hello: 'world'}));
    const response = makeResponse();

    await handle(
      makeRequest('/api/example'),
      response as unknown as ServerResponse
    );

    expect(response.statusCode).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json'
    );
    expect(bodyOf(response)).toEqual({hello: 'world'});
  });

  test('passes the decoded query string through to the handler', async () => {
    let seenQuery: Record<string, string> | undefined;
    const handle = createNodeHandler(async (_context, query) => {
      seenQuery = query;

      return {};
    });

    await handle(
      makeRequest('/api/activity?tz=Asia%2FTokyo'),
      makeResponse() as unknown as ServerResponse
    );

    expect(seenQuery).toEqual({tz: 'Asia/Tokyo'});
  });

  test('a thrown error maps to a 500 {error: {code, message}} body', async () => {
    const handle = createNodeHandler(async () => {
      throw new Error('boom');
    });
    const response = makeResponse();

    await handle(
      makeRequest('/api/costs'),
      response as unknown as ServerResponse
    );

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({
      error: {code: 'internal_error', message: 'boom'},
    });
  });

  test('shares one context (and its file cache) across every call', () => {
    expect(getAdapterContext()).toBe(getAdapterContext());
  });
});
