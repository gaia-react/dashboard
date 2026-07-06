/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

const alias = {
  '~': new URL('app', import.meta.url).pathname,
};

/**
 * Two test environments, split by path:
 * - `node`: the framework-agnostic data layer and server (real fs, node URLs).
 * - `dom`: React components and hooks (happy-dom, jest-dom matchers).
 *
 * The split is by directory so workstreams never hand-annotate an environment;
 * put data-layer tests under app/data or server, UI tests under
 * app/components or app/hooks.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {alias},
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          include: [
            'app/data/**/*.test.{ts,tsx}',
            'server/**/*.test.{ts,tsx}',
            'test/**/*.test.{ts,tsx}',
          ],
          name: 'node',
        },
      },
      {
        extends: true,
        test: {
          environment: 'happy-dom',
          include: [
            'app/components/**/*.test.{ts,tsx}',
            'app/hooks/**/*.test.{ts,tsx}',
          ],
          name: 'dom',
          setupFiles: ['./test/setup.ts'],
        },
      },
    ],
  },
});
