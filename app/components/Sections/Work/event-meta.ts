import type {IconName} from '~/components/Icon';
import type {
  GaiaEventGroup,
  GaiaEventType,
} from '~/components/Sections/Work/events';
import type {PhaseRollup} from '~/data/schemas/api';

/**
 * The literal Tailwind classes one event tone renders as. Tailwind cannot see
 * `` `text-${tone}` ``, so a concatenated class is a class that does not
 * exist in the stylesheet. Every string below is copied verbatim from
 * DESIGN-SPEC 2.5's table; none is built by concatenation, ever.
 */
export type EventTone = {
  /** The selected card's full 1px border. Never a side stripe. */
  border: string;
  /** The type chip's label text. */
  chipText: string;
  /** A chart mark, where SVG needs `fill-*` rather than `bg-*`. */
  fill: string;
  /** The event icon. */
  icon: string;
  /** A legend swatch. */
  swatch: string;
};

/**
 * The Categorical Nine plus the `unknown` fallback (DESIGN-SPEC 2.5). Warm
 * hues are Work, cool hues are Maintenance, so the grouping reads before the
 * label does.
 *
 * Two entries look like mistakes and are not:
 *
 * - **Review's `chipText` is `text-fg-dim`, not `text-fg-mute`.** `fg-mute`
 *   has no `-soft` variant and measures 4.15:1 on `bg-elev-2`, which is
 *   exactly where a chip sits on a selected card. Its `icon` stays
 *   `text-fg-mute` because an icon is non-text and clears the 3:1 threshold.
 * - **`unknown` reuses Review's tone.** It is the tenth type but not a tenth
 *   hue: an unrecognized event degrades, it never invents a color.
 *
 * Keys are members of a closed union, so a direct index into these records is
 * total and safe. That is the difference from `events.ts`'s command lookup: a
 * union key is trusted, a raw `../gaia` string is not.
 */
export const EVENT_TONES: Readonly<Record<GaiaEventType, EventTone>> = {
  audit: {
    border: 'border-secondary',
    chipText: 'text-secondary-soft',
    fill: 'fill-secondary',
    icon: 'text-secondary',
    swatch: 'bg-secondary',
  },
  debt: {
    border: 'border-warn',
    chipText: 'text-warn-soft',
    fill: 'fill-warn',
    icon: 'text-warn',
    swatch: 'bg-warn',
  },
  fitness: {
    border: 'border-moss',
    chipText: 'text-moss-soft',
    fill: 'fill-moss',
    icon: 'text-moss',
    swatch: 'bg-moss',
  },
  forensics: {
    border: 'border-warn-soft',
    chipText: 'text-warn-soft',
    fill: 'fill-warn-soft',
    icon: 'text-warn-soft',
    swatch: 'bg-warn-soft',
  },
  harden: {
    border: 'border-info',
    chipText: 'text-info-soft',
    fill: 'fill-info',
    icon: 'text-info',
    swatch: 'bg-info',
  },
  plan: {
    border: 'border-accent-soft',
    chipText: 'text-accent-soft',
    fill: 'fill-accent-soft',
    icon: 'text-accent-soft',
    swatch: 'bg-accent-soft',
  },
  review: {
    border: 'border-fg-mute',
    chipText: 'text-fg-dim',
    fill: 'fill-fg-mute',
    icon: 'text-fg-mute',
    swatch: 'bg-fg-mute',
  },
  spec: {
    border: 'border-accent',
    chipText: 'text-accent-soft',
    fill: 'fill-accent',
    icon: 'text-accent',
    swatch: 'bg-accent',
  },
  unknown: {
    border: 'border-fg-mute',
    chipText: 'text-fg-dim',
    fill: 'fill-fg-mute',
    icon: 'text-fg-mute',
    swatch: 'bg-fg-mute',
  },
  wiki: {
    border: 'border-secondary-soft',
    chipText: 'text-secondary-soft',
    fill: 'fill-secondary-soft',
    icon: 'text-secondary-soft',
    swatch: 'bg-secondary-soft',
  },
};

/** Sentence-case display names. Every color-coded element carries this label
 * as well as its icon, so meaning survives greyscale (PRODUCT.md principle
 * 4). */
export const EVENT_LABELS: Readonly<Record<GaiaEventType, string>> = {
  audit: 'Audit',
  debt: 'Debt',
  fitness: 'Fitness',
  forensics: 'Forensics',
  harden: 'Harden',
  plan: 'Plan',
  review: 'Review',
  spec: 'Spec',
  unknown: 'Unknown',
  wiki: 'Wiki',
};

/** Semantic icon names resolved by `~/components/Icon` (DESIGN-SPEC 2.5). */
export const EVENT_ICONS: Readonly<Record<GaiaEventType, IconName>> = {
  audit: 'audit',
  debt: 'debt',
  fitness: 'fitness',
  forensics: 'forensics',
  harden: 'harden',
  plan: 'plan',
  review: 'review',
  spec: 'spec',
  unknown: 'unknown',
  wiki: 'wiki',
};

/**
 * The filter select's `<optgroup>` membership and order (DESIGN-SPEC C-10).
 * The list lives here rather than in `EventFilters` so the filter and any
 * other grouping read one source.
 *
 * `unknown` is deliberately in neither group: it has no filter option and is
 * reachable only from "All events". Giving an unrecognized command its own
 * filter entry would name a category the project does not have.
 */
export const EVENT_GROUPS: Readonly<Record<GaiaEventGroup, GaiaEventType[]>> = {
  maintenance: ['audit', 'fitness', 'forensics', 'harden', 'wiki', 'review'],
  work: ['spec', 'plan', 'debt'],
};

/**
 * Merges the per-phase scalar maps for the detail panel's model-mix donut and
 * agent-type bars (DESIGN-SPEC 5.4). `CostEntry` carries `byModel` and
 * `byAgentType` per phase, not per entry, so the panel needs one merged map.
 *
 * Three outcomes, deliberately distinguished:
 *
 * - `null` when every phase carries `null` (and when there are no phases at
 *   all): no breakdown was recorded. Backfill rows carry no `byModel`, so
 *   this is the common path, not an edge case.
 * - `{}` when at least one phase carried a map but nothing summed: a
 *   breakdown that recorded nothing. The chart renders its own empty state.
 * - the summed record otherwise.
 *
 * Accumulates into a `Map` rather than an object literal: the keys are model
 * ids and agent-type names read straight from `../gaia`, so a key colliding
 * with `Object.prototype` would otherwise read an inherited member as a
 * running total.
 */
export const mergeScalarMaps = (
  phases: PhaseRollup[],
  field: 'byAgentType' | 'byModel'
): null | Record<string, number> => {
  const totals = new Map<string, number>();
  let anyRecorded = false;

  for (const phase of phases) {
    const scalars = phase[field];

    if (scalars !== null) {
      anyRecorded = true;

      for (const [key, value] of Object.entries(scalars)) {
        totals.set(key, (totals.get(key) ?? 0) + value);
      }
    }
  }

  return anyRecorded ? Object.fromEntries(totals) : null;
};
