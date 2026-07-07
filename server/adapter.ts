import type {IncomingMessage, ServerResponse} from 'node:http';
import type {ApiError} from '~/data/schemas/api';
import type {FileCache} from '../app/data/cache';
import {createFileCache} from '../app/data/cache';
import type {DashboardConfig} from '../app/data/config';
import {loadConfig} from '../app/data/config';

/**
 * Node req/res <-> HandlerContext <-> JSON bridge (PLAN section 3, SPEC
 * section 3 npx constraint). This is the ONLY file that touches `node:http`
 * request/response objects; `server/plugin.ts` is the only file that touches
 * Vite, and calls into this module rather than talking to handlers directly.
 * That split lets a future thin `node:http` server (the npx path) mount the
 * same handlers through this same adapter, with nothing Vite-specific to
 * swap out.
 *
 * Config and the file cache are resolved ONCE per process and shared across
 * every request, so a refresh (a plain re-fetch, PLAN D3) hits the warm
 * `(path, mtime, size)` cache instead of rebuilding it from scratch.
 *
 * `cache.ts` / `config.ts` are imported by RELATIVE path, not the `~` alias:
 * this module is itself imported (via `server/plugin.ts`) from
 * `vite.config.ts`, whose own config-loading step bundles plain esbuild
 * BEFORE `resolve.alias` exists (chicken-and-egg), so a `~`-aliased VALUE
 * import fails there. Both modules are alias-free leaves themselves, so the
 * relative path resolves in every context (config load, dev server,
 * Vitest). Type-only imports (`ApiError` below) are erased before bundling
 * and are unaffected either way.
 */

export type AdapterContext = {
  cache: FileCache;
  config: DashboardConfig;
};

/**
 * A framework-agnostic handler: `(context, query) -> typed JSON` (PLAN
 * section 3). Both `getCosts` (which ignores the query) and `handleActivity`
 * (which reads `tz`) satisfy this shape.
 */
export type ApiHandler<TResponse> = (
  context: AdapterContext,
  query: RequestQuery
) => Promise<TResponse>;

/** Query params parsed from the request URL; every value is a plain string. */
export type RequestQuery = Record<string, string>;

const INTERNAL_ERROR_CODE = 'internal_error';
const INTERNAL_ERROR_STATUS = 500;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Request failed';

let sharedContext: AdapterContext | undefined;

/** The process-lifetime context every request shares, built lazily once. */
export const getAdapterContext = (): AdapterContext => {
  sharedContext ??= {cache: createFileCache(), config: loadConfig()};

  return sharedContext;
};

/** Query string of a request URL, decoded into a flat string map. */
const parseQuery = (url: string): RequestQuery => {
  const {searchParams} = new URL(url, 'http://localhost');
  const query: RequestQuery = {};

  for (const [key, value] of searchParams) {
    query[key] = value;
  }

  return query;
};

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown
): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

/**
 * Adapts one framework-agnostic handler into a Node request handler: builds
 * the shared context, runs the handler against the parsed query string, and
 * writes the JSON result. Any thrown error becomes a non-200 response shaped
 * per `apiErrorSchema` instead of an unhandled rejection.
 */
export const createNodeHandler =
  <TResponse>(
    handler: ApiHandler<TResponse>
  ): ((request: IncomingMessage, response: ServerResponse) => Promise<void>) =>
  async (request, response) => {
    try {
      const query = parseQuery(request.url ?? '/');
      const body = await handler(getAdapterContext(), query);

      writeJson(response, 200, body);
    } catch (error) {
      writeJson(response, INTERNAL_ERROR_STATUS, {
        error: {code: INTERNAL_ERROR_CODE, message: describeError(error)},
      } satisfies ApiError);
    }
  };
