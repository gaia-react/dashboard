import type {FC} from 'react';

/**
 * Class constants are exported so skeletons can mirror the exact layout
 * (transparent-text technique, skeleton-loaders skill) without drifting.
 */
export const emptyStateClasses = {
  container:
    'border-border-soft bg-bg-elev rounded-md border border-dashed p-8 text-center',
  description: 'text-fg-mute mt-2 text-sm',
  title: 'text-fg-dim text-title font-medium',
};

type Props = {
  description?: string;
  title: string;
};

/**
 * Intentional empty state (SPEC section 6): explains why a section has no
 * data instead of looking broken.
 */
const EmptyState: FC<Props> = ({description, title}) => (
  <div className={emptyStateClasses.container}>
    <p className={emptyStateClasses.title}>{title}</p>
    {description && (
      <p className={emptyStateClasses.description}>{description}</p>
    )}
  </div>
);

export default EmptyState;
