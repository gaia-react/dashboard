import {statSync} from 'node:fs';

/**
 * Per-file memo keyed by (path, mtime, size). A refresh re-fetches every file;
 * unchanged files hit this cache and are not re-parsed, so warm refreshes stay
 * under the SPEC section 4.5 budget (D3 in PLAN.md).
 *
 * The `size` component catches same-mtime rewrites. The residual blind spot is
 * sub-second mtime granularity paired with an identical byte count; acceptable
 * for the append-only logs this caches.
 */
export type FileCache = {
  /** Drop all entries (mainly for tests). */
  clear: () => void;
  /**
   * Return the cached value for `path` when its (mtime, size) is unchanged,
   * otherwise call `compute` and store the result. `compute` may return a
   * Promise; the promise itself is cached, so concurrent gets share one read.
   */
  get: <T>(path: string, compute: (path: string) => T) => T;
  /** Number of cached entries. */
  size: () => number;
};

type CacheEntry = {
  mtimeMs: number;
  size: number;
  value: unknown;
};

export const createFileCache = (): FileCache => {
  const store = new Map<string, CacheEntry>();

  return {
    clear: () => store.clear(),
    get: <T>(path: string, compute: (path: string) => T): T => {
      const {mtimeMs, size} = statSync(path);
      const hit = store.get(path);

      if (hit?.mtimeMs === mtimeMs && hit.size === size) {
        return hit.value as T;
      }

      const value = compute(path);
      store.set(path, {mtimeMs, size, value});

      return value;
    },
    size: () => store.size,
  };
};
