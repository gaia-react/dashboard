import type {Plugin} from 'vite';
import type {handleActivity} from '~/data/handlers/activity';
import type {getCosts} from '~/data/handlers/costs';
import {createNodeHandler} from './adapter';

type GetCosts = typeof getCosts;
type HandleActivity = typeof handleActivity;

/**
 * Vite dev-server middleware mounting `GET /api/costs` and
 * `GET /api/activity?tz=<IANA>` (PLAN section 3). This is the ONLY file that
 * imports Vite; the handlers under `app/data/**` stay framework-agnostic
 * (SPEC section 3 npx constraint), and `server/adapter.ts` is the only Node
 * req/res coupling. No `POST /api/refresh`: a re-fetch of both endpoints IS
 * the refresh (PLAN D3), so there is nothing else to mount.
 *
 * The handlers are loaded via `server.ssrLoadModule` inside
 * `configureServer`, not a static top-level `import`: this file is itself
 * imported by `vite.config.ts`, whose own config-loading step bundles plain
 * esbuild BEFORE `resolve.alias` exists, so the `~` alias the data layer
 * uses throughout cannot resolve at that point. `configureServer` runs once
 * Vite's own resolver (aliases included) is live, so that is the earliest
 * point the handlers CAN be reached through their normal `~` imports. The
 * `import type` declarations above are erased before bundling (TypeScript
 * type-only imports never emit a runtime import) and cost nothing there.
 */
export const gaiaDashboardApiPlugin = (): Plugin => ({
  configureServer: (server) => {
    const handlers = Promise.all([
      server.ssrLoadModule('~/data/handlers/costs') as Promise<{
        getCosts: GetCosts;
      }>,
      server.ssrLoadModule('~/data/handlers/activity') as Promise<{
        handleActivity: HandleActivity;
      }>,
    ]).then(([costsModule, activityModule]) => ({
      respondActivity: createNodeHandler(activityModule.handleActivity),
      respondCosts: createNodeHandler(costsModule.getCosts),
    }));

    server.middlewares.use((request, response, next) => {
      if (request.method !== 'GET' || request.url === undefined) {
        next();

        return;
      }

      const {pathname} = new URL(request.url, 'http://localhost');

      if (pathname === '/api/costs') {
        handlers
          .then(async ({respondCosts}) => respondCosts(request, response))
          .catch(next);
      } else if (pathname === '/api/activity') {
        handlers
          .then(async ({respondActivity}) => respondActivity(request, response))
          .catch(next);
      } else {
        next();
      }
    });
  },
  name: 'gaia-dashboard-api',
});
