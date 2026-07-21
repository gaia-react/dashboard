---
paths:
  - 'app/**/*.tsx'
  - 'app/**/*.css'
---

# Tailwind Conventions

Authoring patterns live in `.claude/skills/tailwind/SKILL.md`. This rule covers only project-specific facts.

## Tailwind v4

Config lives in `app/styles/tailwind.css` under `@theme` / `@layer` / `@utility`. There is no `tailwind.config.ts`.

## Single dark theme (no light mode)

This dashboard is **dark-only** (SPEC section 7). The GAIA tokens in
`app/styles/tailwind.css` are a single dark surface; `../studio/branding/DESIGN.md`
defines no light palette. There is nothing to pair against.

- **Do not** write light/dark pairs (`bg-white dark:bg-gray-900`) or reach for a
  `dark:` variant. There is one theme; style it directly. The `@custom-variant dark`
  declaration was deleted in v2 because not one `dark:` utility existed in `app/`.
- **Do not** use neutral-gray template utilities (`bg-gray-*`, `text-gray-*`,
  `border-gray-*`) or invent semantic aliases like `bg-body` / `text-secondary`.
  Those belong to the fresh-scaffold baseline, not this GAIA product surface.
- `html` carries `color-scheme: dark`. That is what makes native `<select>` popups,
  `<option>` rows, `<optgroup>` headers, and scrollbars render dark. Do not remove it.

## Use the GAIA tokens

Reference the `@theme` tokens from `app/styles/tailwind.css` (backed by
`DESIGN.md`). No hex literals in components, ever, tokens only.

| Role                         | Tokens                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces                     | `bg-bg`, `bg-bg-elev` (cards, panels), `bg-bg-elev-2` (hover / selected state, chips, table headers), `bg-bg-tint` (slate-tinted / alt rows)               |
| Text                         | `text-fg` (primary), `text-fg-dim` (secondary, labels), `text-fg-mute` (captions, missing-data dashes)                                                     |
| Primary brand (burnt orange) | `text-accent` / `bg-accent`, `accent-2` (borders), `accent-soft` (colored text on elevated surfaces, and the base link hover)                              |
| Secondary (slate teal)       | `secondary`, `secondary-2` (borders/hover), `secondary-soft` (text on elevated). Plays the "yes / checkmark / confidence" role, there is no success green. |
| Semantic (amber)             | `warn`, `warn-2` (borders), `warn-soft` (text on elevated). Partial states, estimated-not-recorded markers, warnings.                                      |
| Muted blue (`info`)          | **Categorical only.** Marks the Harden event. Never a link, a system banner, or an informational callout.                                                  |
| Moss (`moss`)                | **Categorical only.** Marks the Fitness event. **Never a success state**, so `../studio/branding/DESIGN.md`'s no-success-green rule still holds.           |
| Borders                      | `border-border` (separates two objects), `border-border-soft` (separates sections inside one object)                                                       |

`info` and `moss` are the two sanctioned additions for this surface. They exist
because nine event types need nine tones and three hues cannot carry nine. Neither
carries semantic meaning.

## The Soft-On-Elevated Rule

Measured, not estimated. Body-size colored text needs 4.5:1; icons, borders, and chart
marks need 3:1.

| Token       | on `bg` | on `bg-elev` | on `bg-elev-2` |
| ----------- | ------- | ------------ | -------------- |
| `accent`    | 5.90    | 5.33         | 4.86           |
| `accent-2`  | 4.73    | **4.27**     | **3.89**       |
| `secondary` | 4.78    | **4.32**     | **3.93**       |
| `info`      | 4.70    | **4.25**     | **3.87**       |
| `moss`      | 5.48    | 4.95         | 4.51           |
| `fg-mute`   | 5.04    | 4.55         | **4.15**       |

Bold is under 4.5:1 and illegal for body-size text on that surface. Three consequences,
all binding:

- **On `bg-elev` and `bg-elev-2`, body-size colored text uses the `-soft` variant.**
  Base hues on elevated surfaces are for icons, borders, chip borders, and chart marks
  only. Every `-soft` variant clears 6.7:1 on every surface.
- **No `-2` variant ever carries text.** Not on any surface. They are border and
  hover-border values, full stop.
- **`fg-mute` is illegal on `bg-elev-2`.** Because an event card raises to `bg-elev-2`
  on hover and when selected, no text on an event card may use `text-fg-mute`; card
  captions use `text-fg-dim`. This is the easiest regression to introduce.

## The event tones (the Categorical Nine)

Nine event types, nine fixed tones, one icon each. Warm hues are Work, cool hues are
Maintenance, so the grouping reads before the label does.

| Group       | Event     | Tone             | Icon (`react-icons/lu`) | Chip text             |
| ----------- | --------- | ---------------- | ----------------------- | --------------------- |
| Work        | Spec      | `accent`         | `LuFileText`            | `text-accent-soft`    |
| Work        | Plan      | `accent-soft`    | `LuListChecks`          | `text-accent-soft`    |
| Work        | Debt      | `warn`           | `LuWrench`              | `text-warn-soft`      |
| Maintenance | Audit     | `secondary`      | `LuClipboardCheck`      | `text-secondary-soft` |
| Maintenance | Harden    | `info`           | `LuShieldCheck`         | `text-info-soft`      |
| Maintenance | Fitness   | `moss`           | `LuActivity`            | `text-moss-soft`      |
| Maintenance | Wiki      | `secondary-soft` | `LuBookOpen`            | `text-secondary-soft` |
| Maintenance | Forensics | `warn-soft`      | `LuBug`                 | `text-warn-soft`      |
| Maintenance | Review    | `fg-mute`        | `LuScanEye`             | `text-fg-dim`         |
| (fallback)  | Unknown   | `fg-mute`        | `LuTerminal`            | `text-fg-dim`         |

Review's chip text is `fg-dim`, not its tone: `fg-mute` has no `-soft` variant and
fails on `bg-elev-2`. The icon stays `fg-mute` because an icon is non-text and clears
the 3:1 threshold.

**Tone classes must be literal strings.** Tailwind cannot see `` `text-${tone}` ``.
`app/components/Sections/Work/event-meta.ts` exports one frozen record per event type
carrying every literal class. No component builds a tone class by concatenation, ever.

A hue colors an icon, a chip, a border, or a chart mark. It **never** fills a card
background, fills a button, or marks an inactive or disabled state. Every color-coded
element also carries an icon and a text label, so meaning survives greyscale and color
blindness.

## The type scale

Five semantic `--text-*` tokens. Each emits font-size, line-height, and (for the top
three) letter-spacing from a single utility. **Use these instead of hand-tuned
arbitrary values**; `text-[0.65rem]`, `text-[0.6rem]`, and friends do not belong in
this codebase.

| Utility          | Size      | Role                                                                                       | Companions                       |
| ---------------- | --------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| `text-metric`    | 2.25rem   | The one number a surface exists to report. At most three per surface.                      | `font-mono tabular-nums text-fg` |
| `text-metric-sm` | 1.5rem    | Card-level numbers, the detail panel's metric strip, donut center.                         | `font-mono tabular-nums text-fg` |
| `text-title`     | 1.25rem   | Section and panel headings, project name, selected event identifier.                       | `font-medium text-fg`            |
| `text-body`      | 0.9375rem | Default text, card titles, descriptions, table cells. Applied to `body` in the base layer. | `text-fg` or `text-fg-dim`       |
| `text-label`     | 0.8125rem | Every label, chip, select, badge, chart axis, tick, legend, caption. Sentence case.        | `text-fg-dim` or `text-fg-mute`  |

**All chart text is `text-label`.** No chart reaches for an arbitrary size; charts thin
their labels rather than shrinking them.

These are **font-size utilities, not colors.** There is no `--color-title` or
`--color-body`; `text-secondary` remains the teal color utility, unrelated to this
scale.

## No display font

`--font-display` (Fraunces) is deleted from `@theme`, the `h1, h2, h3` base block that
applied it is deleted, and the Google Fonts `<link>` plus both preconnects are gone
from `index.html`. Two reasons, both binding:

- **Product register.** A display serif in UI labels, buttons, or data is a
  product-register ban. This surface operates GAIA; the marketing site sells it.
- **Offline correctness.** `npx gaia-dashboard` must render correctly with the network
  off. No webfont is loaded at all. Do not add one.

There is no element selector for headings. **A heading takes its size and weight from
the component that renders it** (`text-title font-medium`), never from `h1`/`h2`/`h3`.

## Icons: `react-icons`, through `Icon` only

Sanctioned deviation from `../studio/branding/DESIGN.md`'s hand-coded-SVG rule. Lucide
is stroke-based, 1.5px, round-capped, which is the style that document already
describes, so this is a sourcing change rather than a visual one.

- Standardize on the Lucide set (`react-icons/lu`).
- Import icons **only** through `app/components/Icon`, never from `react-icons`
  directly in a section or a card.
- `react-icons` is the only new runtime dependency authorized for this redesign.
  Anything else is a blocker to surface, not a change to make.

## The four bans

A violation is blocker-severity at review time.

1. **No per-section eyebrows.** The tiny uppercase letter-spaced label above a block
   (`text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase` and any variant
   of it) is banned. Replace with a plain sentence-case label at `text-label`. At most
   one deliberate uppercase treatment may exist per surface, and it must be defensible
   as a choice.
2. **No side-stripe borders.** `border-l` / `border-r` wider than 1px used as a colored
   accent is banned on cards, list items, callouts, and alerts. The selected event card
   gets a **full** 1px border in its own tone plus a `bg-elev-2` surface.
3. **No nested cards.** A bordered or elevated box inside another bordered or elevated
   box is always wrong. The event list is a legitimate card list because each card is a
   discrete selectable object. The detail panel is **not** a grid of cards: it is one
   surface divided by `border-soft` hairline rules into flat sections.
4. **No bucket-level token vocabulary anywhere in `app/components/`.** Users asked for
   dollars, elapsed time, and total tokens, and nothing else. Bucket math stays
   server-side in `app/data/pricing/rates.ts`, where it is load-bearing. This check must
   return nothing:

   ```bash
   grep -rn "Fresh input\|Cache write\|Cache read\|cacheRead\|outputByModel" app/components/
   ```

Flatness is the fifth, and it predates these four: zero shadows, zero gradients, zero
glass blur, zero lift transforms. Depth is tone (`bg` to `bg-elev` to `bg-elev-2`) plus
space. A state change moves a surface up the tonal ramp or changes a border color; it
never adds a shadow.

## Radii, transitions, focus

| Role                                          | Class          |
| --------------------------------------------- | -------------- |
| Cards, panels, tooltips                       | `rounded-md`   |
| Controls, chips, badges, buttons, focus rings | `rounded-sm`   |
| Meter tracks and fills only                   | `rounded-full` |

`rounded-full` on a badge or chip is prohibited; nothing in v2 is a genuine toggle
chip.

Transitions stay in the 150-250ms band and every one carries
`motion-reduce:transition-none`. Focus is a 2px `accent` outline at 2px offset, never a
background change alone.

## Charts

Series palette in order: `accent`, `secondary`, `warn`, `accent-soft`,
`secondary-soft`, `warn-soft`, `info`, `moss`. `MAX_CONCURRENT_SERIES` is **8**; past
that, group the tail into "other". Neutrals (`fg-mute`, `border`) carry axes and grids.
Single-metric encodings (heatmap, one-series bars) stay on the accent ramp.

No arrangement of these eight hues clears the CVD separation target past three
concurrent series, so **hue is never the sole channel in any chart here.** Every chart
with two or more series ships a legend (always, never optional), a 2px surface gap
between touching fills, direct labels wherever they fit, and an `sr-only` list twin
carrying every datum.

The nine event tones are **not** a chart palette and must never be used as one.

## No arbitrary colors

Palette tokens only, with opacity modifiers where needed (`bg-accent/15`). No hex
literals in `[]`. Follow `DESIGN.md`: no purple, no cool grays, no Inter, no dedicated
success green, no fourth coequal hue.

## Not covered here

Light-mode support and theme toggling are out of scope and stay that way. If a light
palette is ever added, define it in `DESIGN.md` first, then propagate, per the
design-system source-of-truth rule.
