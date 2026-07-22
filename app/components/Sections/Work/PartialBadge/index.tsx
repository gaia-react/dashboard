import type {FC} from 'react';

/**
 * Flags an entry whose recorded figures are known to be incomplete
 * (DESIGN-SPEC C-15). Amber, and the one non-status marker that takes a hue:
 * an incomplete figure is exactly what `warn` means outside the event scale.
 *
 * `border-warn-2` is a border, never text: no `-2` variant may carry text on
 * any surface (`.claude/rules/tailwind.md`, The Soft-On-Elevated Rule).
 */
const PartialBadge: FC = () => (
  <span className="border-warn-2 text-warn-soft text-label ml-2 inline-block rounded-sm border px-1.5 py-0.5">
    Partial
  </span>
);

export default PartialBadge;
