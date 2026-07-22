import {useCallback, useEffect, useRef, useState} from 'react';

export type ApiResource<TData> = {
  /** True from the moment `refetch()` is called until its request settles.
   * `state` itself never returns to 'loading' on a refetch (DESIGN-SPEC
   * section 10, defect 7): this is the busy signal a caller reads instead,
   * so the previous render can stay on screen. */
  isRefreshing: boolean;
  refetch: () => void;
  state: ApiResourceState<TData>;
};

/**
 * Response typing is a local generic until schemas/api.ts lands (Phase 2);
 * callers then instantiate with CostsResponse / ActivityResponse.
 */
export type ApiResourceState<TData> =
  | {data: TData; status: 'success'}
  | {message: string; status: 'error'}
  | {status: 'loading'};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as {error?: {message?: string}};

    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Non-JSON error body; fall through to the status line.
  }

  return `Request failed with status ${response.status}`;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Request failed';

/**
 * Fetches a JSON API resource and exposes a loading / error / success state
 * machine plus a refetch. A plain refetch IS the refresh (PLAN D3): the
 * server cache re-parses only changed files.
 */
export const useApiResource = <TData>(url: string): ApiResource<TData> => {
  const [state, setState] = useState<ApiResourceState<TData>>({
    status: 'loading',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  // No synchronous setState here: the mount effect calls this while the
  // state is already 'loading' (react-hooks/set-state-in-effect). The url is
  // stable for the lifetime of a hook instance in this app.
  const load = useCallback((): void => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    const settle = (next: ApiResourceState<TData>): void => {
      if (requestIdRef.current === requestId) {
        setState(next);
        setIsRefreshing(false);
      }
    };

    fetch(url)
      .then(async (response) => {
        if (response.ok) {
          settle({data: (await response.json()) as TData, status: 'success'});
        } else {
          settle({message: await readErrorMessage(response), status: 'error'});
        }
      })
      .catch((error: unknown) => {
        settle({message: describeError(error), status: 'error'});
      });
  }, [url]);

  // Event-context re-fetch: raises isRefreshing and reissues the request
  // without touching `state`, so the previous render holds until the new
  // request settles (DESIGN-SPEC section 10, defect 7). A failed refetch
  // still lands `state` in 'error' via `settle` above: the dashboard cannot
  // vouch for stale figures once it knows the refresh failed.
  const refetch = useCallback((): void => {
    setIsRefreshing(true);
    load();
  }, [load]);

  useEffect(() => {
    load();

    return () => {
      // Invalidate in-flight requests so a late response cannot set state
      // after unmount or after the url changed.
      requestIdRef.current += 1;
    };
  }, [load]);

  return {isRefreshing, refetch, state};
};
