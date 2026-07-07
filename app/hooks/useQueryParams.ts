import {useCallback, useMemo, useSyncExternalStore} from 'react';

/**
 * The dashboard's tab, session filters, page, and jump-link target live in the
 * URL query string so they are shareable, survive reload, and let a cross-tab
 * jump-link land on a clean, unfiltered view (a lingering filter can never
 * hide the session it navigated to). No router dependency: the URL is a plain
 * external store, read through `useSyncExternalStore` so every consumer stays
 * in sync when any one of them writes.
 */

const QUERY_CHANGE_EVENT = 'gaia:querychange';

const subscribe = (onStoreChange: () => void): (() => void) => {
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(QUERY_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(QUERY_CHANGE_EVENT, onStoreChange);
  };
};

const getSnapshot = (): string => window.location.search;

/** A no-op server snapshot; the dashboard only ever renders in the browser. */
const getServerSnapshot = (): string => '';

/** `null` or `''` deletes the key; any other value sets it. */
export type QueryPatch = Record<string, null | string>;

export type UseQueryParams = [
  URLSearchParams,
  (patch: QueryPatch) => void,
  (next: QueryPatch) => void,
];

const applyPatch = (
  base: URLSearchParams,
  patch: QueryPatch
): URLSearchParams => {
  const next = new URLSearchParams(base);

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  return next;
};

const commit = (next: URLSearchParams): void => {
  const queryString = next.toString();
  const url = `${window.location.pathname}${
    queryString === '' ? '' : `?${queryString}`
  }${window.location.hash}`;

  window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));
};

export const useQueryParams = (): UseQueryParams => {
  const search = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const setQueryParams = useCallback((patch: QueryPatch) => {
    // Read the live URL rather than the snapshot so batched patches from
    // different callers in one tick each see the previous write.
    commit(applyPatch(new URLSearchParams(window.location.search), patch));
  }, []);

  /**
   * Replaces the whole query with `next`, dropping every param not named in
   * it (a tab switch or a cross-tab jump-link, where a filter left over from
   * the previous view could hide the thing being navigated to).
   */
  const resetQueryParams = useCallback((next: QueryPatch) => {
    commit(applyPatch(new URLSearchParams(), next));
  }, []);

  return [params, setQueryParams, resetQueryParams];
};
