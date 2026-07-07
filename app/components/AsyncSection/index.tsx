import type {ReactElement, ReactNode} from 'react';
import ErrorState from '~/components/ErrorState';
import type {ApiResourceState} from '~/hooks/useApiResource';

type Props<TData> = {
  children: (data: TData) => ReactNode;
  errorTitle?: string;
  label: string;
  onRetry?: () => void;
  skeleton: ReactNode;
  state: ApiResourceState<TData>;
};

/**
 * Section slot boundary: renders the skeleton while its API resource loads,
 * the error primitive on failure, and the content once data lands, inside
 * one stable landmark so the swap never remounts the container.
 */
const AsyncSection = <TData,>({
  children,
  errorTitle,
  label,
  onRetry,
  skeleton,
  state,
}: Props<TData>): ReactElement => (
  <section aria-busy={state.status === 'loading'} aria-label={label}>
    {state.status === 'loading' && (
      <>
        <span className="sr-only" role="status">
          Loading {label}
        </span>
        {skeleton}
      </>
    )}
    {state.status === 'error' && (
      <ErrorState
        message={state.message}
        onRetry={onRetry}
        title={errorTitle}
      />
    )}
    {state.status === 'success' && children(state.data)}
  </section>
);

export default AsyncSection;
