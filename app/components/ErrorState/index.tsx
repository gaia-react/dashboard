import type {FC} from 'react';

type Props = {
  message: string;
  onRetry?: () => void;
  title?: string;
};

/**
 * Section-level failure panel. Amber per DESIGN.md (no dedicated error red);
 * a plain refetch is the retry (PLAN D3).
 */
const ErrorState: FC<Props> = ({
  message,
  onRetry,
  title = 'Something went wrong',
}) => (
  <div className="border-warn-2 bg-bg-elev rounded-md border p-6" role="alert">
    <p className="text-warn-soft font-mono text-xs tracking-[0.2em] uppercase">
      {title}
    </p>
    <p className="text-fg-dim mt-2 text-sm">{message}</p>
    {onRetry && (
      <button
        className="border-border text-fg hover:border-warn-2 focus-visible:outline-accent mt-4 rounded-sm border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    )}
  </div>
);

export default ErrorState;
