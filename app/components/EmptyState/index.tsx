import type {FC} from 'react';
import type {IconName} from '~/components/Icon';
import Icon from '~/components/Icon';

/**
 * Class constants are exported so skeletons can mirror the exact layout
 * (transparent-text technique, skeleton-loaders skill) without drifting.
 *
 * The dashed border is gone (DESIGN-SPEC C-29 / 9.4): a dashed rule reads as
 * a drop target or an unfinished region, and this surface is neither. A solid
 * `border-border-soft` hairline says the same thing without the costume.
 */
export const emptyStateClasses = {
  container:
    'border-border-soft bg-bg-elev flex flex-col items-center gap-2 rounded-md border p-8 text-center',
  description: 'text-body text-fg-mute max-w-prose',
  icon: 'text-fg-mute',
  title: 'text-title text-fg-dim',
};

type Props = {
  description?: string;
  /** Rendered above the title when passed. Optional, so no existing caller
   * changes; a section that has a natural symbol gains one. */
  icon?: IconName;
  title: string;
};

/**
 * Intentional empty state (SPEC section 6, DESIGN-SPEC C-29): teaches what
 * would fill the surface instead of looking broken. The description is never
 * "Nothing here".
 */
const EmptyState: FC<Props> = ({description, icon, title}) => (
  <div className={emptyStateClasses.container} data-testid="empty-state">
    {icon && <Icon className={emptyStateClasses.icon} name={icon} size={24} />}
    <p className={emptyStateClasses.title}>{title}</p>
    {description && (
      <p className={emptyStateClasses.description}>{description}</p>
    )}
  </div>
);

export default EmptyState;
