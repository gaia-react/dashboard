import type {FC} from 'react';
import {twMerge} from 'tailwind-merge';

/**
 * Shared shimmer classes for skeletons (skeleton-loaders skill). Apply to a
 * real element carrying the same typography classes as the content it stands
 * in for; `text-transparent` hides the placeholder text while it holds the
 * exact final dimensions. Animation stays behind `motion-safe` so
 * `prefers-reduced-motion` users get a static block.
 */
export const shimmer =
  'motion-safe:animate-shimmer from-bg-elev via-bg-elev-2 to-bg-elev rounded-sm bg-linear-to-r bg-size-[200%_100%] text-transparent select-none';

type Props = {
  className?: string;
};

/**
 * Block skeleton for non-text content (charts, tables, tiles). Size it with
 * the same dimension classes the real content occupies.
 */
const Skeleton: FC<Props> = ({className}) => (
  <div
    aria-hidden={true}
    className={twMerge(shimmer, className)}
    data-testid="skeleton"
  />
);

export default Skeleton;
