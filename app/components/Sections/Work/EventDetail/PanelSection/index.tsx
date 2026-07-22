import type {FC, ReactNode} from 'react';
import {twMerge} from 'tailwind-merge';

/**
 * The one primitive every detail section is built from (DESIGN-SPEC C-18).
 * Exported so `EventDetailSkeleton` divides its shell with the identical
 * hairlines and padding, which is what makes the loading-to-loaded swap cause
 * zero layout shift.
 */
export const panelSectionClass =
  'border-border-soft flex flex-col gap-4 border-b p-6 last:border-b-0 xl:p-8';

type Props = {
  children: ReactNode;
  className?: string;
  /** Rendered as the section's `<h3>`; omitted where the content names itself. */
  heading?: string;
};

/**
 * One flat section of the detail panel. The hairline plus the padding are the
 * separation: no eyebrow above the heading, no bordered box around it, no
 * `bg-elev-2` fill behind it. A bordered or elevated box inside the panel's
 * own border is a nested card, which is banned outright, so this renders a
 * plain `<div>` and never grows a border of its own beyond the bottom rule.
 */
const PanelSection: FC<Props> = ({children, className, heading}) => (
  <div
    className={twMerge(panelSectionClass, className)}
    data-testid="panel-section"
  >
    {heading !== undefined && <h3 className="text-title text-fg">{heading}</h3>}
    {children}
  </div>
);

export default PanelSection;
