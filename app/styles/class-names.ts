/**
 * Shared Tailwind class strings (DESIGN-SPEC.md section 2.8), declared once
 * and imported everywhere. Two reasons they live here rather than being
 * hand-written per component:
 *
 * - Tailwind reads class names as literal strings. A constant is still a
 *   literal at the source level, so the scanner sees it; a concatenated
 *   `text-${tone}` is not, and produces a class that does not exist.
 * - `motion-reduce:transition-none` omitted once is an accessibility
 *   regression no test catches (DESIGN-SPEC section 8).
 *
 * Work-scoped constants (the event tones) live in
 * `app/components/Sections/Work/event-meta.ts` instead.
 */

/**
 * The UI-control focus ring: 2px accent outline at 2px offset (DESIGN-SPEC
 * section 2.8, PRODUCT.md accessibility bar). Buttons, links, and selects.
 */
export const focusRing =
  'focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * The focus ring for a chart mark's hit area (DESIGN-SPEC section 3, C-36 to
 * C-44). Deliberately NOT `focusRing`: a chart mark's ring sits at
 * `outline-offset-1` so it hugs the mark instead of colliding with its
 * neighbors, and it takes no radius because the shape is the mark's own.
 * Every chart in the kit already renders this offset; do not sweep them onto
 * `focusRing`.
 */
export const chartFocusRing =
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1';

/** Color state change, 150ms, reduced-motion safe (DESIGN-SPEC section 8). */
export const colorTransition =
  'transition-colors duration-150 ease-out motion-reduce:transition-none';

/** Opacity state change, 150ms, reduced-motion safe (DESIGN-SPEC section 8). */
export const opacityTransition =
  'transition-opacity duration-150 ease-out motion-reduce:transition-none';

/**
 * The app shell's horizontal inset: full-bleed at every width, capped only at
 * `2xl` so a very wide monitor does not stretch a line of text across a metre
 * of glass (DESIGN-SPEC section 1.2).
 */
export const shellInset =
  'px-4 sm:px-6 xl:px-10 2xl:mx-auto 2xl:max-w-[140rem]';

/**
 * Every figure in this dashboard. `tabular-nums` is what keeps a column of
 * dollars scannable when the digits change (PRODUCT.md accessibility bar).
 */
export const numeric = 'font-mono tabular-nums';
