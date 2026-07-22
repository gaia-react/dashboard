import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import {colorTransition, focusRing} from '~/styles/class-names';

type Props = {
  message: string;
  onRetry?: () => void;
  title?: string;
};

/**
 * The C-08 ghost-button vocabulary plus the border and top margin C-31 adds,
 * so Retry looks like every other button in the console rather than like a
 * form control that only appears when something breaks.
 */
const retryClass = twJoin(
  'text-label text-fg-dim border-border hover:bg-bg-elev-2 hover:text-fg active:bg-bg-elev-2 mt-4 inline-flex items-center gap-2 rounded-sm border px-3 py-1.5',
  colorTransition,
  focusRing
);

/**
 * Section-level failure panel (DESIGN-SPEC C-31). Amber per DESIGN.md (this
 * system has no error red); a plain refetch is the retry (PLAN D3).
 *
 * The title's old mono, tracked, all-caps eyebrow treatment is gone: that
 * pattern is banned outright (DESIGN-SPEC 9.1), and an error heading is
 * exactly where a legible one matters most.
 */
const ErrorState: FC<Props> = ({
  message,
  onRetry,
  title = 'Something went wrong',
}) => (
  <div className="border-warn-2 bg-bg-elev rounded-md border p-6" role="alert">
    <p className="text-title text-warn-soft">{title}</p>
    <p className="text-body text-fg-dim mt-2">{message}</p>
    {onRetry && (
      <button className={retryClass} onClick={onRetry} type="button">
        Retry
      </button>
    )}
  </div>
);

export default ErrorState;
