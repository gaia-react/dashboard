import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import Icon from '~/components/Icon';
import {colorTransition, focusRing} from '~/styles/class-names';

type Props = {
  /** True while a retry triggered through `onRetry` is in flight (C-31 X/L
   * states). Mirrors DashboardHeader's RefreshButton (C-08) exactly. */
  isRetrying?: boolean;
  message: string;
  onRetry?: () => void;
  title?: string;
};

/**
 * The C-08 ghost-button vocabulary plus the border and top margin C-31 adds,
 * so Retry looks like every other button in the console rather than like a
 * form control that only appears when something breaks. The disabled
 * treatment is C-08's too, so the two buttons never diverge.
 */
const retryClass = twJoin(
  'text-label text-fg-dim border-border hover:bg-bg-elev-2 hover:text-fg active:bg-bg-elev-2 disabled:text-fg-mute disabled:hover:text-fg-mute mt-4 inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 disabled:hover:bg-transparent',
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
 *
 * X and L depend on DESIGN-SPEC section 10 defect 7 (W12, P4): `isRetrying`
 * disables the button, swaps its label to "Retrying", and spins its icon,
 * exactly like C-08's RefreshButton.
 */
const ErrorState: FC<Props> = ({
  isRetrying = false,
  message,
  onRetry,
  title = 'Something went wrong',
}) => (
  <div className="border-warn-2 bg-bg-elev rounded-md border p-6" role="alert">
    <p className="text-title text-warn-soft">{title}</p>
    <p className="text-body text-fg-dim mt-2">{message}</p>
    {onRetry && (
      <button
        className={retryClass}
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        <Icon
          className={isRetrying ? 'motion-safe:animate-spin' : undefined}
          name="refresh"
          size={14}
        />
        {isRetrying ? 'Retrying' : 'Retry'}
      </button>
    )}
  </div>
);

export default ErrorState;
