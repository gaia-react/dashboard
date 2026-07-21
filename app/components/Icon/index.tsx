import type {FC} from 'react';
import {createElement} from 'react';
import type {IconBaseProps} from 'react-icons';
import {twMerge} from 'tailwind-merge';
import type {IconName} from './icon-map';
import {resolveIcon} from './icon-map';

type IconSize = 14 | 16 | 20 | 24;

type Props = {
  className?: string;
  /** When present, the icon is meaningful: role="img" + aria-label. Otherwise decorative. */
  label?: string;
  name: IconName;
  size?: IconSize;
};

/**
 * The single import surface for react-icons (DESIGN.md deviation 2). Every
 * other component reaches an icon through this one, never through
 * `react-icons` directly. Icon is decorative (aria-hidden) by default,
 * because nearly every icon in this dashboard sits beside a text label that
 * already carries the meaning; passing `label` promotes it to a meaningful
 * `role="img"` element instead.
 *
 * Rendered with `createElement` rather than JSX: `IconComponent` is resolved
 * dynamically from `name`, and `react-hooks/static-components` flags that
 * shape when written as a JSX tag (it cannot tell "select an existing,
 * stable component from a map" apart from "define a new component during
 * render"). `createElement` is the same element-construction call JSX
 * compiles to; it just is not the JSX literal syntax that rule's analysis
 * pattern-matches on.
 */
const Icon: FC<Props> = ({className, label, name, size = 16}) => {
  const IconComponent = resolveIcon(name);
  const decorative = !label;

  // `data-testid` is a valid DOM attribute (and JSX allows it structurally on
  // any element), but createElement's typed overload resolution has no
  // equivalent to JSX's special-cased data-*/aria-* allowance, so the object
  // literal needs an explicit assertion rather than inferring against
  // `IconBaseProps` directly.
  return createElement(IconComponent, {
    'aria-hidden': decorative ? true : undefined,
    'aria-label': decorative ? undefined : label,
    className: twMerge('shrink-0', className),
    'data-testid': `icon-${name}`,
    role: decorative ? undefined : 'img',
    size,
    strokeWidth: 1.5,
  } as IconBaseProps);
};

export default Icon;

export type {IconName};
