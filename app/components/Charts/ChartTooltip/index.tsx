import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';

export type TooltipContent = {
  rows: TooltipRow[];
  title?: string;
};

/**
 * Which side of the anchor point the readout sits on (DESIGN-SPEC C-46).
 * `'below'` is what stops a tooltip near the top of an independently
 * scrolling pane being clipped by that pane's `overflow-y-auto`.
 */
export type TooltipPlacement = 'above' | 'below';

export type TooltipRow = {
  label: string;
  /** bg-* token class for the series line key; omit for single-metric rows. */
  swatchClassName?: string;
  value: string;
};

type Props = TooltipContent & {
  placement?: TooltipPlacement;
  x: number;
  y: number;
};

const TRANSFORMS: Readonly<Record<TooltipPlacement, string>> = {
  above: 'translate(-50%, calc(-100% - 0.5rem))',
  below: 'translate(-50%, 0.5rem)',
};

/**
 * Shared hover readout for the chart kit. Values lead (strong, high
 * contrast), labels follow; series identity rides a short color key. Render
 * it inside the chart's relative wrapper; it anchors to the (x, y) point and
 * never intercepts the pointer.
 *
 * Separation comes from the border and the elevated surface, never a shadow
 * (the Flat-Forever Rule). `placement` keys a closed union, so the transform
 * lookup is total and safe.
 */
const ChartTooltip: FC<Props> = ({placement = 'above', rows, title, x, y}) => (
  <div
    className="border-border bg-bg-elev-2 text-label pointer-events-none absolute z-10 min-w-28 rounded-md border px-2.5 py-2"
    role="tooltip"
    style={{
      left: x,
      top: y,
      transform: TRANSFORMS[placement],
    }}
  >
    {!!title && <p className="text-fg-dim mb-1 font-medium">{title}</p>}
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-baseline justify-between gap-3"
        >
          <span className="text-fg-dim flex items-center gap-1.5">
            {!!row.swatchClassName && (
              <span
                aria-hidden={true}
                className={twJoin('h-1 w-3 rounded-full', row.swatchClassName)}
              />
            )}
            {row.label}
          </span>
          <span className="text-fg font-semibold">{row.value}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default ChartTooltip;
