# DESIGN-SPEC: GAIA Dashboard v2

The implementable contract for the Phase 8 redesign. Every UI agent in P1 through
P5 builds to this file. Agents work in parallel and never talk to each other, so
this document is the only thing keeping the result visually coherent: where it
gives a class string, use that class string.

**Governing documents, in precedence order.** `PRODUCT.md` and `DESIGN.md` at the
dashboard root (register: product), then `tasks/phase-8-redesign/README.md`
(user-confirmed ground truth), then this file, then
`.claude/rules/{tailwind,accessibility,coding-guidelines}.md`. Nothing here
overrides a named rule in `DESIGN.md`; where this file appears to add something,
it is filling in a value `DESIGN.md` left open.

**How to read a spec entry.** A class string in backticks is literal: paste it.
A value in angle brackets (`<tone>`) is resolved from a lookup table in this
document, never invented. "Not applicable" against a state means the state cannot
occur for that component, and the reason is given.

**Visual direction probe: skipped.** This harness has no native image generation.
Direction is set by `DESIGN.md` and the four reference images in
`../dashboard-feedback/`, which were read directly.

---

## Contents

1. [Layout skeleton](#1-layout-skeleton)
2. [Tokens and type scale](#2-tokens-and-type-scale)
3. [Component inventory](#3-component-inventory)
4. [Event card composition](#4-event-card-composition)
5. [Detail panel composition](#5-detail-panel-composition)
6. [Chart specifications](#6-chart-specifications)
7. [Empty, loading, and error states](#7-empty-loading-and-error-states)
8. [Motion](#8-motion)
9. [Retirement list](#9-retirement-list)
10. [Defects found, not fixed](#10-defects-found-not-fixed)
11. [Judgment calls](#11-judgment-calls)

---

## 1. Layout skeleton

### 1.1 Breakpoints in use

Tailwind defaults, unchanged. Only these five are referenced anywhere in v2.

| Prefix | Min width | What changes |
| --- | --- | --- |
| (base) | 0 | Single column everywhere. Top bar stacks to two rows. Event list above detail panel. |
| `sm:` | 40rem / 640px | Shell padding steps to `px-6`. Donut and its legend go side by side. Metric strip goes from two rows to one. |
| `lg:` | 64rem / 1024px | The console appears: two-pane Work grid, independently scrolling panes, single-row top bar. |
| `xl:` | 80rem / 1280px | Shell padding steps to `px-10`. Panel section padding steps to `p-8`. Detail panel charts go two-up. |
| `2xl:` | 96rem / 1536px | The only cap: `max-w-[140rem] mx-auto`. Nothing else changes. |

`md:` is deliberately unused. The v1 code hides table columns at `md:`; those
tables are retired, and adding a sixth breakpoint for no structural change is
noise.

### 1.2 The app shell

```tsx
<div className="bg-bg text-fg flex h-dvh flex-col overflow-hidden">
  <TopBar />                                {/* shrink-0, never scrolls */}
  <div className={scrollRegionClass}>       {/* the page scroller */}
    …tab panel…
  </div>
</div>
```

The top bar sits **outside** the scroller rather than being `position: sticky`
inside it. It is functionally identical (always visible, never scrolls away) and
it removes every magic-number sticky offset from the build: the list pane can
then stick at `top-0` of its own container with no knowledge of the bar's height.

`scrollRegionClass` is one of exactly two strings, chosen by the active tab:

```ts
// Work: the two panes scroll independently at lg and up; the region itself does not.
const workRegionClass = 'min-h-0 flex-1 overflow-y-auto lg:overflow-hidden';
// Sessions and Insights: long documents, the region is the scroller at every width.
const documentRegionClass = 'min-h-0 flex-1 overflow-y-auto';
```

`min-h-0` is load-bearing on both: without it a flex child refuses to shrink
below its content and the internal scroll never engages.

**Shell inset.** One string, applied to the top bar's inner grid and to every tab
panel's outer element. Nothing else may set horizontal page padding.

```
px-4 sm:px-6 xl:px-10 2xl:mx-auto 2xl:max-w-[140rem]
```

Full bleed to the viewport edge below `2xl`, capped at 140rem above it. The v1
`max-w-6xl` is gone.

**Z-index scale.** Semantic, four values, nothing else anywhere:

| Layer | Value | Where |
| --- | --- | --- |
| Sticky pane header (filter/sort row) | `z-10` | inside the event list pane |
| Chart tooltip | `z-10` | inside the chart's own `relative` wrapper (a separate stacking context) |
| Top bar | `z-20` | app shell |
| (reserved) modal / toast | `z-30` | not used in v2; do not squat on it |

### 1.3 Top bar

One `<header>`, one row at `lg:`, two rows below. Three children in DOM order:
identity, tab strip, refresh. Grid placement moves the refresh button, so no
element is duplicated across breakpoints.

```tsx
<header className="border-border-soft bg-bg z-20 shrink-0 border-b">
  <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:h-16 lg:grid-cols-[1fr_auto_1fr] lg:gap-x-6 lg:gap-y-0 lg:py-0 xl:px-10 2xl:mx-auto 2xl:max-w-[140rem]">
    <div className="col-start-1 row-start-1 min-w-0">…identity…</div>
    <nav className="col-span-2 col-start-1 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">…tabs…</nav>
    <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">…refresh…</div>
  </div>
</header>
```

**Identity block.** A `<button>` (returns to the Work tab and clears every other
query param, as v1 does) containing:

- Line 1: `<img src={gaiaLogo} className="h-6 w-auto" alt="GAIA" />` then the
  project name as `<h1 className="text-title text-fg truncate">`.
  Wrapper: `flex items-center gap-3`.
- Line 2: the project root then the freshness line, both `text-label`, joined in
  one `flex flex-wrap items-baseline gap-x-3 gap-y-0.5` row.
  Root: `text-fg-dim break-all lg:truncate` with `title={root}`.
  Freshness: `text-fg-mute font-mono tabular-nums whitespace-nowrap`, reading
  `Scanned 412 sessions, 35 specs, updated 2m ago`.

The relative "updated 2m ago" moves **out** of the refresh button and into this
line. In v1 it was the button's visible label, which made the control's
accessible name change every 60 seconds.

**Tab strip.** See C-07. Below `lg` it is `overflow-x-auto` so three tabs never
wrap on a 320px viewport.

**Refresh.** See C-08.

### 1.4 The Work two-pane grid

```tsx
<div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(20rem,26rem)_1fr] lg:gap-6 xl:gap-8">
  <div className="min-h-0 lg:overflow-y-auto lg:pb-8">…EventList…</div>
  <div className="min-h-0 lg:overflow-y-auto lg:pb-8">…EventDetail…</div>
</div>
```

The grid is the direct child of the tab panel, which carries the shell inset plus
`py-4 lg:py-6`.

| Width | Behavior |
| --- | --- |
| base | One column. List first, detail below it. Both at natural height; the page scroller handles overflow. The list caps at `max-h-[60vh] overflow-y-auto` so the detail panel is reachable without scrolling past a 145-card list. |
| `sm:` | Unchanged structurally. Inset steps to `px-6`. |
| `lg:` | Two columns. List pane 20rem minimum, 26rem maximum; detail takes the rest. Each pane scrolls independently; the page does not scroll. The list drops its `max-h` cap (`lg:max-h-none`). |
| `xl:` | Gap steps to 8. Detail panel sections step to `p-8`. Detail panel charts go two-up (see §5.3). |
| `2xl:` | Shell cap engages. The list pane stays at 26rem; the detail panel absorbs the extra width. |

The list pane's filter/sort header is `sticky top-0 z-10 bg-bg pb-3` so it stays
put while cards scroll under it. The `bg-bg` is required: without an opaque
background the cards show through.

### 1.5 Sessions and Insights tabs

No structural change in v2 (README: Sessions is TBD, Insights is "what it is
today, displayed more visually"). Both render inside `documentRegionClass` with
the shell inset and `flex flex-col gap-8 py-6 xl:gap-10`. Section chrome changes
only per §3 and §9.

---

## 2. Tokens and type scale

### 2.1 New color tokens

Added to `@theme` in `app/styles/tailwind.css`, matching the existing three-part
pattern (base, `-2` for borders and hover, `-soft` for text on dark).

```css
--color-info: #6183ad;
--color-info-2: #4a688c;
--color-info-soft: #9db6d6;

--color-moss: #7a9463;
--color-moss-2: #5f764c;
--color-moss-soft: #a8bf94;
```

Both are **categorical only**. `moss` is never a success state; `info` is never a
link, a system banner, or an informational callout. They exist because nine event
categories need nine tones and three hues cannot carry nine.

### 2.2 Verified contrast

Computed, not estimated. Ratios are text-on-surface; the AA body threshold is
4.5:1 and the AA large / non-text threshold is 3:1.

| Token | on `bg` | on `bg-elev` | on `bg-elev-2` |
| --- | --- | --- | --- |
| `accent` | 5.90 | 5.33 | 4.86 |
| `accent-2` | 4.73 | **4.27** | **3.89** |
| `accent-soft` | 9.17 | 8.28 | 7.54 |
| `secondary` | 4.78 | **4.32** | **3.93** |
| `secondary-2` | **3.16** | **2.85** | **2.60** |
| `secondary-soft` | 8.20 | 7.40 | 6.74 |
| `warn` | 8.51 | 7.68 | 7.00 |
| `warn-2` | 5.92 | 5.35 | 4.87 |
| `warn-soft` | 11.46 | 10.35 | 9.42 |
| `info` | 4.70 | **4.25** | **3.87** |
| `info-2` | **3.20** | **2.89** | **2.64** |
| `info-soft` | 8.86 | 8.00 | 7.29 |
| `moss` | 5.48 | 4.95 | 4.51 |
| `moss-2` | **3.67** | **3.31** | **3.02** |
| `moss-soft` | 9.26 | 8.36 | 7.61 |
| `fg` | 17.50 | 15.80 | 14.39 |
| `fg-dim` | 8.29 | 7.48 | 6.82 |
| `fg-mute` | 5.04 | 4.55 | **4.15** |
| `border` | 1.69 | 1.53 | 1.39 |
| `border-soft` | 1.35 | 1.22 | 1.11 |

**Bold = under 4.5:1, not legal for body-size text on that surface.**

Three rules fall out, and all three are binding:

- **The Soft-On-Elevated Rule (from `DESIGN.md`), restated concretely.** On
  `bg-elev` and `bg-elev-2`, body-size colored text uses the `-soft` variant. Base
  `info` and `secondary` both miss on `bg-elev`; all five base hues miss on
  `bg-elev-2`. Base hues on elevated surfaces are for **icons, borders, chips
  borders, and chart marks only**.
- **No `-2` variant ever carries text.** Not on any surface. They are border and
  hover-border values, full stop.
- **`fg-mute` is not legal on `bg-elev-2`** (4.15). It is legal on `bg` (5.04) and
  on `bg-elev` (4.55). Because the event card raises to `bg-elev-2` on hover and
  when selected, **no text on an event card may use `fg-mute`**: card captions use
  `fg-dim`. This is the single most common way this build will regress.

### 2.3 Type scale

Added to `@theme`. Tailwind v4 pairs a size with its line height and letter
spacing through the `--text-{name}--{property}` suffix.

```css
--text-metric: 2.25rem;
--text-metric--line-height: 1.05;
--text-metric--letter-spacing: -0.02em;

--text-metric-sm: 1.5rem;
--text-metric-sm--line-height: 1.1;
--text-metric-sm--letter-spacing: -0.01em;

--text-title: 1.25rem;
--text-title--line-height: 1.25;
--text-title--letter-spacing: -0.01em;

--text-body: 0.9375rem;
--text-body--line-height: 1.5;

--text-label: 0.8125rem;
--text-label--line-height: 1.2;
```

These generate the utilities `text-metric`, `text-metric-sm`, `text-title`,
`text-body`, `text-label`. They are **font-size utilities, not colors**. There is
no `--color-body` or `--color-title`; `text-secondary` remains the teal color
utility, unrelated to this scale.

| Utility | Role | Companion classes |
| --- | --- | --- |
| `text-metric` | The one number a surface exists to report. KPI tiles, at most three per surface. | `font-mono tabular-nums text-fg` |
| `text-metric-sm` | Card-level numbers, the detail panel's three-value metric strip, donut center. | `font-mono tabular-nums text-fg` |
| `text-title` | Section and panel headings, the project name, the selected event's identifier in the panel header. | `text-fg` (sans, weight 500 via `font-medium`) |
| `text-body` | Default text, card titles, descriptions, table cells. | `text-fg` or `text-fg-dim` |
| `text-label` | Every label, chip, select, badge, chart axis, chart tick, chart legend, caption. Sentence case, never uppercase, never letter-spaced. | `text-fg-dim` (labels) or `text-fg-mute` (captions on `bg` / `bg-elev` only) |

**All chart text is `text-label`.** No chart may reach for an arbitrary size.
This raises tick text from 10px to 13px, which is the point: the feedback asked
for larger type. Charts compensate by thinning labels, not by shrinking them (see
§6.6).

### 2.4 Typography and base layer

```css
@theme {
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, sfmono-regular, menlo, monaco, consolas,
    'Liberation Mono', 'Courier New', monospace;
  /* --font-display is REMOVED. */
}

@layer base {
  html {
    @apply antialiased;
    color-scheme: dark;      /* native selects, scrollbars, and form chrome render dark */
  }

  body {
    @apply bg-bg text-fg text-body font-sans;
  }

  a {
    @apply text-accent hover:text-accent-soft no-underline hover:underline;
  }

  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }
}
```

- `--font-display` and the `h1, h2, h3 { @apply font-display font-light }` block
  are deleted. Headings take their size and weight from the component that
  renders them, never from an element selector.
- `@custom-variant dark` is deleted. It is dead code: there is not one `dark:`
  utility in `app/`.
- `color-scheme: dark` is new and non-optional. It is what makes native
  `<select>` popups, `<option>` rows, `<optgroup>` headers, and scrollbars render
  dark. Without it the two filter controls flash a white OS popup on a dark
  console.
- The base link hover changes from `accent-2` to `accent-soft`. `accent-2`
  measures 4.27:1 on `bg-elev`, which fails AA for a link sitting on any panel.

### 2.5 The Categorical Nine

Nine event types, nine fixed tones, one icon each. An unrecognized event type
degrades to `fg-mute` plus `LuTerminal`; it never invents a tenth tone.

| Group | Event | Tone token | Icon (`react-icons/lu`) | Icon class | Chip text class | Selected border class |
| --- | --- | --- | --- | --- | --- | --- |
| Work | Spec | `accent` | `LuFileText` | `text-accent` | `text-accent-soft` | `border-accent` |
| Work | Plan | `accent-soft` | `LuListChecks` | `text-accent-soft` | `text-accent-soft` | `border-accent-soft` |
| Work | Debt | `warn` | `LuWrench` | `text-warn` | `text-warn-soft` | `border-warn` |
| Maintenance | Audit | `secondary` | `LuClipboardCheck` | `text-secondary` | `text-secondary-soft` | `border-secondary` |
| Maintenance | Harden | `info` | `LuShieldCheck` | `text-info` | `text-info-soft` | `border-info` |
| Maintenance | Fitness | `moss` | `LuActivity` | `text-moss` | `text-moss-soft` | `border-moss` |
| Maintenance | Wiki | `secondary-soft` | `LuBookOpen` | `text-secondary-soft` | `text-secondary-soft` | `border-secondary-soft` |
| Maintenance | Forensics | `warn-soft` | `LuBug` | `text-warn-soft` | `text-warn-soft` | `border-warn-soft` |
| Maintenance | Review | `fg-mute` | `LuScanEye` | `text-fg-mute` | `text-fg-dim` | `border-fg-mute` |
| (fallback) | Unknown | `fg-mute` | `LuTerminal` | `text-fg-mute` | `text-fg-dim` | `border-fg-mute` |

Warm hues are Work, cool hues are Maintenance, so the grouping reads before the
label does.

**Review's chip text is `fg-dim`, not `fg-mute`.** `fg-mute` has no `-soft`
variant, and it measures 4.15:1 on `bg-elev-2`, which is where a chip sits. The
icon stays `fg-mute` because an icon is non-text and clears the 3:1 threshold.
The same substitution applies anywhere Review would render tone-colored text.

**These class strings must be literal.** Tailwind cannot see
`` `text-${tone}` ``. `app/components/Sections/Work/event-meta.ts` (owned by K3)
exports one frozen record per event type carrying every literal string:

```ts
type EventTone = {
  border: string;      // 'border-accent'
  chipText: string;    // 'text-accent-soft'
  fill: string;        // 'fill-accent'    (chart marks)
  icon: string;        // 'text-accent'
  swatch: string;      // 'bg-accent'      (legend swatches)
};
```

No component builds a tone class by concatenation, ever.

### 2.6 Chart series palette

`app/components/Charts/chart-palette.ts` keeps its existing six slots **in
order** and appends the two new hues at slots 7 and 8.
`MAX_CONCURRENT_SERIES` rises from 6 to 8.

```
1 accent   2 secondary   3 warn   4 accent-soft   5 secondary-soft
6 warn-soft   7 info   8 moss
```

Appending rather than reordering is deliberate, and it is the measured choice.
Running the `dataviz` skill's validator against the eight hexes on the `bg-elev`
surface:

| Order | Worst all-pairs CVD ΔE at 4 series | at 5 | at 6 |
| --- | --- | --- | --- |
| Existing six, then `info`, `moss` (chosen) | 5.6 | 5.4 | 5.4 |
| Five base hues first, then the three softs | 5.8 | **2.9** | **2.9** |

Putting `moss` at slot 5 drops the worst pair to ΔE 2.9 (`moss` against
`secondary` under deutan and protan simulation) exactly when a chart is most
likely to have five series. Appending keeps `moss` at slot 8, which real data
almost never reaches. Contrast against the surface passes at 3:1 for all eight
slots in every order.

**The consequence is binding.** No arrangement of these eight brand hexes clears
the validator's ΔE 8 CVD target past three concurrent series, so **hue is never
the sole channel in any chart in this dashboard**. Every chart with two or more
series ships:

1. a legend, always present, never optional;
2. a 2px surface gap between touching fills (already implemented as
   `SEGMENT_GAP` in `StackedWeeklyBars`);
3. direct labels wherever they fit without clipping;
4. an `sr-only` list twin carrying every datum (the pattern
   `ActivityHeatmap` already uses).

The nine **event tones are not a chart palette** and must never be used as one.
The same validator run over all nine returns a worst adjacent pair of ΔE 5.6 and
a normal-vision worst of 6.5. They survive on cards because The
Color-Is-Never-Alone Rule pairs every one of them with an icon and a text label.

### 2.7 Radii, spacing, borders

Straight from `DESIGN.md`, restated as utilities so nothing is hand-tuned.

| Role | Class |
| --- | --- |
| Cards, panels, tooltips | `rounded-md` (6px) |
| Controls, chips, badges, buttons, focus rings | `rounded-sm` (4px) |
| Meter tracks and fills only | `rounded-full` |
| Event card padding | `px-4 py-3` |
| Panel section padding | `p-6 xl:p-8` |
| Gap between major regions | `gap-8 xl:gap-10` |
| Object separator | `border border-border` |
| Section separator inside one object | `border-b border-border-soft` |

`rounded-full` on a badge or chip is prohibited (`DESIGN.md`: never pill-shaped
except where a control is genuinely a toggle chip; nothing in v2 is).

### 2.8 Shared class constants

Declared once, imported everywhere. Put them in
`app/components/Sections/Work/event-meta.ts` for Work-scoped ones and in a new
`app/styles/class-names.ts` for global ones.

```ts
export const focusRing =
  'focus-visible:outline-accent rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2';

export const chartFocusRing =
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1';

export const colorTransition =
  'transition-colors duration-150 ease-out motion-reduce:transition-none';

export const opacityTransition =
  'transition-opacity duration-150 ease-out motion-reduce:transition-none';

export const shellInset =
  'px-4 sm:px-6 xl:px-10 2xl:mx-auto 2xl:max-w-[140rem]';

export const numeric = 'font-mono tabular-nums';
```

**There are two focus rings, and that is deliberate.** `focusRing` is the UI
control ring (2px offset, with `rounded-sm`); `chartFocusRing` is the chart-mark
ring, which section 3's shared chart state table specifies at
`outline-offset-1` so it hugs the mark rather than colliding with its neighbors,
and which takes no radius because the shape is the mark's own. This file listed
five constants through P2 while section 3 required a sixth; K3 added it at P3.
Do not "fix" one into the other, and do not sweep the existing charts onto
`focusRing`.

---

## 3. Component inventory

46 components, C-01 through C-46. Each entry gives its element, its default classes, and all seven
interactive states. Where a state cannot occur, the entry says so and why;
"not applicable" is never a shortcut for "not specified".

Legend for the state tables: **D** default, **H** hover, **F** focus-visible,
**A** active, **X** disabled, **L** loading, **E** error.

### Shell and chrome

#### C-01 AppShell
`<div>`. Not interactive. See §1.2 for its two class strings. It owns exactly one
piece of behavior: choosing `workRegionClass` or `documentRegionClass` from the
active tab. States D only; the shell is a layout container and carries no state.

#### C-02 TopBar
`<header>`. See §1.3. Not interactive itself; its children are. States D only.

#### C-03 ProjectIdentity
`<button type="button">` wrapping logo, project name, project root, freshness.

| State | Treatment |
| --- | --- |
| D | `flex min-w-0 flex-col gap-0.5 text-left` plus `focusRing` |
| H | `hover:[&_h1]:text-fg` (already `text-fg`; no visible change is correct here, the affordance is the cursor) |
| F | `focusRing` |
| A | none; navigation is instant |
| X | Not applicable. The control is always operable once the header renders; before that the skeleton stands in. |
| L | The `TopBarSkeleton` replaces the whole bar. This button has no per-control loading state. |
| E | Not applicable. If `/api/costs` fails, the header renders the skeleton and the error surfaces in the tab panel, because the project name is unknown without that response. |

#### C-04 FreshnessLine
`<p className="text-fg-mute font-mono text-label tabular-nums whitespace-nowrap">`.
Content: `Scanned {n} sessions, {m} specs, updated {relative}`. No live region
(see §8). States D only.

#### C-05 Wordmark
`<img src={gaiaLogo} alt="GAIA" className="h-6 w-auto" />`. Inside C-03, so its
`alt` is redundant with the button's accessible name: set `alt=""` and let the
project name carry the name. States D only.

#### C-06 Icon
`app/components/Icon/index.tsx`. The only place `react-icons` is imported.

```tsx
type Props = {
  className?: string;
  /** Renders role="img" with this label instead of aria-hidden. */
  label?: string;
  name: IconName;
  size?: 14 | 16 | 20 | 24;
};
```

- Default `size={16}`. 14 for inline-with-label-text, 20 for the detail panel
  header, 24 for empty states.
- `aria-hidden={true}` unless `label` is supplied. Icons beside a text label are
  always decorative.
- `strokeWidth={1.5}` passed to the underlying component (`DESIGN.md`: 1.5px,
  round caps). Add a unit test asserting the rendered `<svg>` carries
  `stroke-width="1.5"`. If `react-icons` hardcodes the attribute per path and the
  prop does not take, wrap the icon in
  `<span className="[&_svg]:[stroke-width:1.5]">` and keep the test.
- Color comes from `currentColor`, so a caller sets the tone with `text-*` on the
  icon or an ancestor.
- Names: `spec, plan, debt, audit, fitness, forensics, harden, wiki, review,
  unknown, refresh, chevronRight, externalLink, github, filter, sort`.
- States D only. An icon is never interactive; if something needs to be clickable
  it is a `<button>` containing an icon.

#### C-07 TabStrip
`app/components/Tabs/index.tsx`, restyled. Keeps its WAI-ARIA roving-tabindex
implementation verbatim; only classes change.

```ts
const tablistClass = 'flex items-stretch gap-1 overflow-x-auto lg:-mb-px lg:h-16 lg:overflow-visible';
const tabBaseClass = `text-label flex items-center border-b-2 px-4 py-2 whitespace-nowrap lg:py-0 ${colorTransition} ${focusRing}`;
```

| State | Treatment |
| --- | --- |
| D (inactive) | `border-transparent text-fg-dim` |
| D (active) | `border-accent text-fg` plus `aria-selected={true}`, `tabIndex={0}` |
| H | `hover:text-fg hover:border-border` (inactive only; the active tab's border stays `accent`) |
| F | `focusRing`. Arrow / Home / End move focus and activate, as today. |
| A | `active:text-fg`. No transform, no scale. |
| X | Not applicable. All three tabs are always available; there is no gated tab. |
| L | Not applicable. Tabs are present before data resolves; the panel below carries the loading state. |
| E | Not applicable. A failed resource does not disable its tab; the panel shows `ErrorState` with retry. |

The uppercase, `tracking-[0.15em]`, `font-mono` treatment is removed. Labels are
sentence case at `text-label`.

#### C-08 RefreshButton
Ghost button per `DESIGN.md`.

```ts
const refreshClass = `text-label text-fg-dim inline-flex items-center gap-2 rounded-sm px-3 py-1.5 ${colorTransition} ${focusRing}`;
```

| State | Treatment |
| --- | --- |
| D | `refreshClass`, content `<Icon name="refresh" size={14} />` + `Refresh` |
| H | `hover:bg-bg-elev-2 hover:text-fg` |
| F | `focusRing` |
| A | `active:bg-bg-elev-2` |
| X | `disabled:text-fg-mute disabled:hover:bg-transparent disabled:hover:text-fg-mute`. Disabled while a refetch is in flight. |
| L | `disabled` + label becomes `Refreshing` + icon gets `motion-safe:animate-spin`. Under `motion-reduce` the icon is static and the changed label carries the state. Because the label is the button's accessible name and the button holds focus, the change is announced without a live region. |
| E | The button itself does not show error state. A failed refresh surfaces as `ErrorState` in the affected tab panel; the button returns to D so the user can retry from the bar as well. |

### Event list

#### C-09 EventListPane
`<div className="min-h-0 max-h-[60vh] overflow-y-auto lg:max-h-none lg:overflow-y-auto lg:pb-8">`
containing the sticky filter header (C-10) and the list (C-11). States D only.

#### C-10 EventFilters
`app/components/Sections/Work/EventFilters/index.tsx`. Two native `<select>`
elements plus a count line, in a sticky header.

```tsx
<div className="bg-bg sticky top-0 z-10 flex flex-col gap-3 pb-3">
  <div className="grid grid-cols-2 gap-3">
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-label text-fg-dim">Filter</span>
      <select className={selectClass} …>…</select>
    </label>
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-label text-fg-dim">Sort</span>
      <select className={selectClass} …>…</select>
    </label>
  </div>
  <p className="text-label text-fg-mute" aria-live="polite">
    {n} {n === 1 ? 'event' : 'events'}
  </p>
</div>
```

```ts
const selectClass = `border-border bg-bg-elev text-fg text-label w-full rounded-sm border px-3 py-1.5 ${focusRing}`;
```

Native `<select>` with `<optgroup>`, never a custom popover. `color-scheme: dark`
on `:root` is what makes the native popup match the console; do not restyle
`<option>` per-element.

**The count line pluralizes.** It shipped as the literal `{n} events` and read
"1 events" on a one-event filter. This is the only string the Work tab speaks
aloud, so the plural is the whole message rather than a polish item. Zero takes
the plural (`0 events`), which is correct English and what every locale this
product ships in expects.

**Filter vocabulary**, exactly:

```
All events (145)
── Work ──
  Spec (35)
  Plan (44)
  Debt (33)
── Maintenance ──
  Audit (0)
  Fitness (0)
  Forensics (0)
  Harden (0)
  Wiki (2)
  Review (44)
```

**The numbers above are illustrative, not a contract.** They were measured once
at P0 and `../gaia` is an actively developed repo whose telemetry has grown three
times since. What is binding is the option **order**, the two optgroups, and the
zero-count `disabled` rule. Never assert these literals in a test or an
acceptance check; re-derive them from the response.

Counts are live for the current project. An option whose count is `0` renders
`disabled`: it teaches that the category exists without letting the user navigate
into an empty list. "All events" is the default and is never disabled.

**Sort vocabulary**, exactly: `Date (newest first)`, `Cost (highest first)`,
`Time (longest first)`, `Status`. Status sorts by the explicit rank
`draft, ready, merged, archived, abandoned`, nulls last. A `null` cost or `null`
duration sorts last in every direction, never as zero.

| State | Treatment |
| --- | --- |
| D | `selectClass` |
| H | `hover:border-border` is a no-op on a control that already has `border-border`; instead `hover:bg-bg-elev-2`. |
| F | `focusRing` |
| A | Native; the OS owns the open-popup appearance. Do not restyle it. |
| X | `disabled:text-fg-mute disabled:cursor-default`. Both selects are disabled while the list is loading. |
| L | Both selects render `disabled` inside the skeleton, with their labels visible and the option list reduced to one placeholder option. Never render an enabled sort control over data that has not loaded. |
| E | `aria-invalid` is not applicable: neither control can hold an invalid value (a stale `?filter=` value resets to "All events"). If a deep link names an unknown filter, silently fall back to All and do not surface an error. |

The count line's `aria-live="polite"` is the only live region in the Work tab. It
announces "12 events" after a filter change, which is the one change a keyboard
user cannot otherwise perceive.

#### C-11 EventList
`<ul className="flex flex-col gap-2">` of `<li>` of `<button>` (C-12).

Keyboard model, roving focus:

| Key | Behavior |
| --- | --- |
| `Tab` | Enters the list once, landing on the selected card (the only card with `tabIndex={0}`). Tabbing again leaves the list. |
| `ArrowDown` / `ArrowUp` | Moves selection to the next / previous card, moves DOM focus with it, and updates the detail panel. Does not wrap: at the last card, `ArrowDown` is a no-op. |
| `Home` / `End` | Selects and focuses the first / last card. |
| `Enter` / `Space` | The card is a `<button>`, so this activates it natively. Because selection already follows focus, activation is a no-op re-select. Do not `preventDefault`. |

Selection follows focus, which is correct for a "list drives a detail pane"
pattern and is what makes arrow-key browsing useful. Do **not** add
`role="listbox"` / `role="option"`: a `<button>` inside a listbox is invalid
ARIA. `<ul>` of `<li>` of `<button aria-current>` is the shape.

Arrow-key handling lives on the `<ul>` via a single `onKeyDown`, not on each
button, and does not wrap around the ends (wrapping in a 145-item list is
disorienting; `Home`/`End` is the intended jump).

States: this component has none of its own; each card carries them.

#### C-12 EventCard
See §4 for full composition. States:

| State | Treatment |
| --- | --- |
| D | `border-border bg-bg-elev w-full rounded-md border px-4 py-3 text-left` plus `colorTransition` |
| H | `hover:bg-bg-elev-2`. Border does not change on hover: the tone border is reserved for selection, and moving it on hover makes hover read as selection. |
| F | `focusRing` |
| A | `active:bg-bg-elev-2`. No transform, no scale, no shadow. |
| X | Not applicable. Every card in the list is selectable; a card with no data still has an identity and a detail panel that explains the gap. Never disable a card. |
| L | Not applicable per-card. The whole list renders `EventListSkeleton` (§7.2). |
| E | Not applicable per-card. A failed `/api/costs` means there is no list. |
| **Selected** | `aria-current="true"`, `bg-bg-elev-2`, and `border` replaced by `<tone>.border` from §2.5. A **full 1px border in the event's tone**. A thick `border-left` stripe is prohibited outright. |

Selected and hover share `bg-bg-elev-2`; the tone border is the differentiator,
and it is present at all four widths.

#### C-13 TypeChip
`<span>`, read-only, never clickable.

```
border-border-soft bg-bg-elev-2 text-label inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5
```

plus `<tone>.chipText` for the label text and `<Icon>` in `<tone>.icon`.

The 1px `border-border-soft` is required. Without it the chip disappears when the
card is selected, because a selected card and a chip both sit at `bg-elev-2`.

States: D only. A chip is a marker, not a control. If something needs to be
actionable it is a `<button>`, not a chip.

#### C-14 StatusText
`<span className="text-label text-fg-dim whitespace-nowrap">` rendering
`formatLabel(status)`.

**Status is never colored.** `merged`, `ready`, `abandoned`, and `archived` all
render in `fg-dim`. Color in this system is the categorical event encoding; a
second, semantic color axis on the same card would make both harder to read. The
one exception is the `partial` marker, which is a data-quality caveat rather than
a status (C-15).

A `null` status renders the dash `-` in `text-fg-dim`, the same color as a real
status. Not `text-fg-mute`: a card raises to `bg-elev-2` on hover and when
selected, where `fg-mute` fails AA (§2.2), and a color that changes with card
state is a state signal this component does not have.

States D only.

#### C-15 PartialBadge
`<span className="border-warn-2 text-warn-soft text-label ml-2 inline-block rounded-sm border px-1.5 py-0.5">Partial</span>`.
Amber because it flags an incomplete figure, which is the one thing `warn` means
outside the event scale. States D only.

#### C-16 ArtifactLink
The PR / issue link on a command event. Built as
`https://github.com/{repo}/{type === 'issue' ? 'issues' : 'pull'}/{number}`, with
`repo` read from the record and never hardcoded.

```
text-accent text-label inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:text-accent-soft hover:underline
```
plus `focusRing`, `target="_blank"`, `rel="noreferrer"`, and a trailing
`<Icon name="externalLink" size={14} />`.

Label: `PR #769` or `Issue #412`, so `gaia-forensics` needs no special case beyond
reading the record's `type`.

| State | Treatment |
| --- | --- |
| D | as above |
| H | `hover:text-accent-soft hover:underline` |
| F | `focusRing` |
| A | `active:text-accent-soft` |
| X | Not applicable. A link is either present or absent; **4 of 33 `gaia-debt` rows carry no `github` at all**, and those render no link, not a disabled one. |
| L | Not applicable. The URL is present the moment the record is. |
| E | Not applicable. This is an outbound link; the dashboard cannot verify the target offline and must not try. |

### Detail panel

#### C-17 EventDetail
`<section id="event-detail" aria-labelledby="event-detail-heading" className="border-border bg-bg-elev rounded-md border">`.
One surface, divided by `border-soft` hairlines. Never a grid of cards. See §5.

Each card in the list carries `aria-controls="event-detail"`.

| State | Treatment |
| --- | --- |
| D | as above |
| H, F, A | Not applicable. The panel is a region, not a control; its contents carry their own states. |
| X | Not applicable. |
| L | `EventDetailSkeleton` (§7.3). |
| E | `ErrorState` in place of the whole panel, with retry. |
| **Empty** | Only reachable when the list itself is empty; see §7.1. |

#### C-18 PanelSection
The one primitive every detail section is built from.

```
border-border-soft flex flex-col gap-4 border-b p-6 last:border-b-0 xl:p-8
```

Optional heading: `<h3 className="text-title text-fg">`. No eyebrow above it, no
bordered box around it, no `bg-elev-2` fill behind it. The hairline plus the
padding are the separation. States D only.

#### C-19 DetailHeader
The first `PanelSection`. See §5.1. States D only; its children (C-16, C-20) carry
their own.

#### C-20 IntensityBadge
`<span className="border-border-soft text-fg-dim text-label inline-block rounded-sm border px-1.5 py-0.5">Deep</span>`.
Spec events only; plan audits carry `intensity: null`. Neutral, not toned:
intensity is a setting, not a category. States D only.

#### C-21 MetricStrip
Three values, one row, hairline-divided.

```tsx
<dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border-soft">
  <div className="flex flex-col gap-1 sm:px-6 sm:first:pl-0 sm:last:pr-0">
    <dt className="text-label text-fg-dim">Cost</dt>
    <dd className="text-metric-sm font-mono text-fg tabular-nums">$12.34</dd>
  </div>
  …Elapsed…  …Total tokens…
</dl>
```

Exactly three values, in this order: **Cost, Elapsed, Total tokens**. No fourth.
No token bucket vocabulary anywhere near it.

A missing value renders `-` in `text-fg-mute`, never `$0.00` and never `0m`.
Below `sm` the three stack, and the vertical dividers become gaps (a stacked
`divide-x` renders nothing useful).

States D only. The strip is not interactive.

#### C-22 MetricValue
The `<dd>` above, reused in KPI tiles at `text-metric`. `font-mono tabular-nums`.
`tabular-nums` is kept even at `text-metric` (where the `dataviz` skill would
prefer proportional figures) because the value sits in a fixed screen position
across selections, and equal-width digits stop it jittering as the user
arrow-keys down the list. States D only.

#### C-23 LinkedSessionRow
One row per `entry.sessions[]`, or a single row for a command event's
`sessionId`.

```
border-border-soft flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-b-0
```
Timestamp `text-label font-mono text-fg-mute tabular-nums`, title
`text-body text-fg-dim min-w-0 flex-1 truncate`, duration
`text-label font-mono text-fg-mute tabular-nums`, then the jump link.

| State | Treatment |
| --- | --- |
| D | as above |
| H | on the jump link only: `hover:text-accent-soft hover:underline` |
| F | `focusRing` on the jump link |
| A | `active:text-accent-soft` |
| X | Not applicable. |
| L | When `/api/costs` has resolved but `/api/activity` has not, rows whose `logFound` is true render `LinkedSessionSkeleton`: same row height, shimmer in place of timestamp and title. This preserves v1 behavior and prevents the panel blocking on the slower resource. |
| E | If `/api/activity` fails, rows fall back to the raw `sessionId` with no jump link and no error text. The session list simply cannot be joined; that is a degradation, not a failure of this panel. |

#### C-24 LogMissingBadge
`<span className="border-warn-2 text-warn-soft text-label ml-2 inline-block rounded-sm border px-1.5 py-0.5">Log missing</span>`.
Shown when `linkedSession.logFound === false`. States D only.

#### C-25 JumpLink
`View in sessions`. Same classes as C-16 minus the external-link icon; it is an
in-app navigation, so it renders `<a href={sessionsTabHref(id)}>` with an
`onClick` that calls the router callback and `preventDefault`s, exactly as v1
does. States as C-16.

#### C-26 AuditBlock
See §5.5. A `PanelSection`, not a bordered box. The v1 `border-l-2 pl-3` side
stripe is deleted (prohibited outright). States D only; the gauge inside carries
its own.

#### C-27 LensList
`<ul className="flex flex-wrap gap-2">` of
`<li className="border-border-soft text-label text-fg-dim rounded-sm border px-2 py-0.5">`.
Renders the **full lens name** via `resolveLensName(acronym, phase.kind)`, never
the bare acronym. `COV` is kind-dependent: "Coverage & consistency" on a spec,
"SPEC coverage" on a plan. An unmapped acronym falls back to itself verbatim,
because the upstream vocabulary will grow.

States D only. Lenses are markers, not filters.

#### C-28 RunIdRow
Command events only. `<dl>` row: `<dt>Run id</dt>` at `text-label text-fg-dim`,
`<dd>` at `text-label font-mono text-fg-dim break-all`. States D only.

### Primitives

#### C-29 EmptyState
`app/components/EmptyState/index.tsx`, restyled.

```tsx
<div className="border-border-soft bg-bg-elev flex flex-col items-center gap-2 rounded-md border p-8 text-center">
  <Icon name={icon} size={24} className="text-fg-mute" />
  <p className="text-title text-fg-dim">{title}</p>
  {description && <p className="text-body text-fg-mute max-w-prose">{description}</p>}
</div>
```

`border-dashed` and `font-display` are removed. The description teaches what
would fill the surface; it is never "Nothing here". States D only.

#### C-30 ChartEmpty
New primitive, for a chart whose source data is null or empty. **Not** the same
component as C-29: an empty chart inside a flat panel section must not grow a
bordered box around itself (that would be a card inside a card).

```tsx
<div className="flex min-h-24 flex-col justify-center gap-1">
  <p className="text-label text-fg-dim">{title}</p>
  <p className="text-label text-fg-mute max-w-prose">{reason}</p>
</div>
```

`min-h-24` matches the smallest chart it replaces, so switching between an event
with a donut and one without does not jump the panel. Per-chart copy in §7.4.
States D only.

#### C-31 ErrorState
`app/components/ErrorState/index.tsx`, restyled.

```tsx
<div className="border-warn-2 bg-bg-elev rounded-md border p-6" role="alert">
  <p className="text-title text-warn-soft">{title}</p>
  <p className="text-body text-fg-dim mt-2">{message}</p>
  {onRetry && <button className={retryClass} onClick={onRetry} type="button">Retry</button>}
</div>
```

The uppercase `font-mono tracking-[0.2em]` title is removed. Amber, because this
system has no error red. `retryClass` is the ghost button vocabulary from C-08
plus `border-border border mt-4`.

| State | Treatment |
| --- | --- |
| D | as above |
| H, F, A | on the Retry button, per C-08 |
| X | Retry is disabled while a retry is in flight |
| L | Retry shows `Retrying` and `motion-safe:animate-spin` on its icon |
| E | Not applicable. A failed retry re-renders the same error with an updated message. |

**X and L depend on §10 defect 7 and were not shippable before P4.** The
component takes no prop that could drive them, and no caller could thread
refetch state while `ApiResourceState` had no variant carrying stale data
alongside `status: 'loading'`. P3 shipped D, H, F, A only, deliberately. W12
owns the hook change and these two states together; neither is meaningful
without the other.

#### C-32 Skeleton
`app/components/Skeleton/index.tsx`. Unchanged: the `shimmer` class and the
block component both stay exactly as they are. They are already correct
(`motion-safe:` gated, `aria-hidden`, transparent-text technique). States D only.

#### C-33 AsyncSection
Unchanged. Already correct: stable landmark, `aria-busy`, `role="status"`
announcement, skeleton / error / content. States D only.

#### C-34 KpiTile
`app/components/Sections/KpiRow`, restyled.

```
border-border-soft bg-bg-elev flex flex-col gap-1 rounded-md border p-4
```
Label `text-label text-fg-dim`, value `text-metric font-mono text-fg tabular-nums`,
sublabel `text-label text-fg-mute`, note `text-label text-warn-soft`.

The eyebrow (`font-mono text-xs tracking-[0.2em] uppercase`) becomes a plain
`text-label` label. The value drops `font-display text-2xl font-light` for
`text-metric`. The `TotalTokensTile` `<details>` bucket expander is deleted
outright; the tile becomes a plain number. `RecordedSpendTile`'s sublabel becomes
`Recorded, all GAIA events`.

Optional sparkline (C-38) sits below the sublabel at `h-8 w-full`.

| State | Treatment |
| --- | --- |
| D | as above |
| H, F, A | Not applicable. A KPI tile is not interactive in v2. The one interactive tile (the `<details>` expander) is deleted. |
| X | Not applicable. |
| L | `KpiRowSkeleton`, unchanged in structure: the same tile shell with `shimmer` over real strings. |
| E | The whole row is replaced by `ErrorState` via `AsyncSection`. Individual tiles do not error. |

#### C-35 ParseHealth
Restyled only: eyebrow and `font-display` removed, `text-[0.65rem]` becomes
`text-label`. Behavior unchanged: silent when clean, so it renders directly
rather than through `AsyncSection`. States D only.

### Charts

Full specifications in §6. Inventory entries here give only the state table,
which is identical across all of them because they share the kit's interaction
model.

#### C-36 Donut (new)
#### C-37 Gauge (new, a linear meter)
#### C-38 Sparkline (new)
#### C-39 SegmentedBar (new)
#### C-40 HorizontalBars, C-41 StackedWeeklyBars, C-42 TrendBars, C-43 CalendarHeatmap, C-44 PeriodSpendBars (existing, restyled per §6.6)

Shared chart state table:

| State | Treatment |
| --- | --- |
| D | Marks at full opacity, `<tone>.fill`, hairline solid axes in `stroke-border`, tick text `fill-fg-mute text-label` |
| H | Hovered mark `opacity-80` via `opacityTransition`; every other mark unchanged (never dim the rest, it reads as disabled) |
| F | The transparent hit `<rect>` takes `focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1`, and focus shows the same tooltip hover does |
| A | Not applicable. Chart marks are not activatable; this dashboard has no drill-down-by-click. |
| X | Not applicable. |
| L | The parent section renders `Skeleton` sized to the chart's exact box. A chart never renders a spinner. |
| E | Not applicable at the chart level. A chart either has data (renders), has null data (renders `ChartEmpty`, §7.4), or its whole section failed to load (`ErrorState` above it). |

#### C-45 ChartLegend
Unchanged in structure. One class change: item text steps from `text-xs` to
`text-label`. States D only, except that a legend row cross-highlights to
`text-fg` while its series is hovered in the chart (§6.4).

#### C-46 ChartTooltip
Structure unchanged except two fixes:

- **`shadow-lg` is removed.** It violates The Flat-Forever Rule. Separation comes
  from `border-border bg-bg-elev-2 border`, which is already there.
- A `placement` prop is added, defaulting to `'above'`. When the anchor `y` is
  under 56px, the caller passes `'below'` and the transform becomes
  `translate(-50%, 0.5rem)`. Without this, a chart near the top of the
  independently scrolling detail pane has its tooltip clipped by the pane's
  `overflow-y-auto`.

**The prop ships and is tested; no caller passes it yet.** W9 added it at P3 but
owned no chart that renders a tooltip near the pane top, so `Donut` still calls
`ChartTooltip` without it and the clipping this prop exists to prevent can still
happen. **P4's W11 wires the `Donut` call site** (the centroid y-threshold check
at `Donut/index.tsx:184`). An unwired prop is a defect wearing a fix's clothes;
this note stands until the call site lands.

Text steps from `text-xs` to `text-label`. States D only.

---

## 4. Event card composition

### 4.1 Structure

```tsx
<li>
  <button
    aria-controls="event-detail"
    aria-current={isSelected ? 'true' : undefined}
    className={cardClass}
    tabIndex={isSelected ? 0 : -1}
    type="button"
  >
    {/* Row 1: identity and state */}
    <span className="flex items-center gap-2">
      <TypeChip tone={tone} type={event.type} />
      <span className="flex-1" />
      {event.source.kind === 'command' ?
        <span className="text-label text-fg-dim whitespace-nowrap">
          {event.artifact === null ? NO_DATA_LABEL : artifactLabel(event.artifact)}
        </span>
      : <StatusText status={event.status} />}
    </span>

    {/* Row 2: the handle */}
    <span className="text-title text-fg mt-2 block truncate font-mono">
      {event.label}
    </span>

    {/* Row 3: the subject */}
    <span className="text-body text-fg-dim mt-0.5 line-clamp-2 block">
      {event.title}
    </span>

    {/* Row 4: the figures */}
    <span className="text-label text-fg mt-3 grid grid-cols-[auto_auto_auto] justify-start gap-x-4 font-mono tabular-nums">
      <span><span className="sr-only">Started </span>{formatDateShort(event.at)}</span>
      <span><span className="sr-only">Cost </span>{formatDollarsCell(event.recordedDollars)}</span>
      <span><span className="sr-only">Elapsed </span>{formatDuration(event.durationSeconds)}</span>
    </span>
  </button>
</li>
```

**Two corrections landed at P4, both against shipped code.**

- **Row 1 carries one glyph, not two.** This snippet originally put a standalone
  `<Icon name={event.type} size={16} />` beside a `<TypeChip>` that C-13 already
  fills with the same glyph, so the identical icon rendered twice about 8px
  apart. W8 shipped it literally under the "DESIGN-SPEC wins" rule and asserted
  the doubling in a test rather than hiding it. The standalone icon is dropped:
  §4.2 already names the chip's icon plus word plus tone as the redundant triple,
  and a second copy adds no channel. The chip carries the tone.
- **There is no `ArtifactChip`.** It appeared in this snippet but in no C-01 to
  C-46 inventory entry, and it could not have been built as named: `ArtifactLink`
  (C-16) is an `<a>`, and an `<a>` inside this card's `<button>` is invalid HTML
  and breaks C-11's roving-focus model. The card renders the artifact as
  **non-interactive text** via `artifactLabel()` (`PR #769`, `Issue #412`, or
  `NO_DATA_LABEL` for the 4 of 33 `gaia-debt` rows with no `github`), and the
  clickable link lives in the detail header, where §5.4 row 8 already puts it.
  This is a slot in C-12's row 1, not a component; nothing new enters the
  inventory.

### 4.2 What appears where, and why

| Row | Content | Type step | Rationale |
| --- | --- | --- | --- |
| 1 | Type chip (icon plus word, in tone), status (or artifact text for commands) right-aligned | `text-label` | Category first: the tone plus the icon plus the word is the redundant triple that survives greyscale, and the chip carries all three. |
| 2 | Identifier (`SPEC-032`, `gaia-debt`, or the run id) | `text-title`, mono, `truncate` | The handle the user came looking for, and the largest thing on the card. Mono because it is an identifier, not prose. |
| 3 | Title / intent / subject | `text-body`, `fg-dim`, `line-clamp-2` | The subject, subordinate to the handle. Two lines maximum so card heights stay within one step of each other. |
| 4 | Start date, recorded cost, elapsed | `text-label`, mono, tabular | The three figures the ledger records. Fixed three-track grid, never a flex row: the column positions are what identify a value when it renders as a dash. |

**Row 4 is a `grid`, not a `flex`.** With `null` cost and `null` duration both
rendering `-`, position is the only disambiguator, and only a fixed track
template guarantees position. Each cell carries an `sr-only` label so a screen
reader never has to infer it.

**Row 4 uses `text-fg`, not `text-fg-mute`.** The card raises to `bg-elev-2` on
hover and when selected, where `fg-mute` measures 4.15:1 and fails AA (§2.2).

### 4.3 By breakpoint

| Width | Card |
| --- | --- |
| base | Full width of the single-column grid. All four rows render. `line-clamp-2` on the title. |
| `sm:` | Unchanged. |
| `lg:` | Card width is now 20rem to 26rem. Row 4's three tracks fit at 20rem (`Jul 14, 2026` + `$12.34` + `1h 12m` measures roughly 17rem at `text-label` in mono). If a locale renders a longer date, row 4 wraps to a second grid row; that is acceptable and does not need a breakpoint. |
| `xl:` | Unchanged. |
| `2xl:` | Unchanged; the list pane stays at 26rem. |

### 4.4 Selected state

`aria-current="true"`, `bg-bg-elev-2`, and the full 1px border swapped to
`<tone>.border`. Nothing else changes: no stripe, no shadow, no scale, no glow,
no left accent bar. The tone border is the only colored surface treatment an
event tone is ever allowed.

### 4.5 Ad-hoc review cards

Reviews have no ledger id. Their `label` is `Code review` plus the short
`reviewId` when present, else the truncated `sessionId`. Their `status` is
`null`, so row 1's right slot is a dash. Everything else is identical.

---

## 5. Detail panel composition

One `bg-elev` surface, `rounded-md`, `border border-border`, divided into flat
`PanelSection`s by `border-b border-border-soft` hairlines. **Never a grid of
cards.** If a proposed layout puts a bordered box inside this box, restructure it
as a section.

### 5.1 Header section

```
[Icon size 20 in tone]  [TypeChip]  [IntensityBadge if spec+audit]
<h2 id="event-detail-heading" className="text-title text-fg mt-2 font-mono">SPEC-032</h2>
<p className="text-body text-fg-dim mt-1">{title}</p>
<p className="text-label text-fg-mute mt-2 font-mono tabular-nums">Started {formatDateTime(at)}</p>
<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
  <StatusText /> and/or <ArtifactLink /> and/or <PartialBadge />
</div>
```

The panel's `aria-labelledby` points at this `<h2>`. There is no live region:
selection is user-initiated and the panel's heading is the label, so a
polite announcement on every arrow-key press would be noise.

### 5.2 Metric strip section

C-21, exactly three values: **Cost, Elapsed, Total tokens**. This is the section
the whole feedback is about; it is the second thing in the panel on every event
type, and nothing precedes it except identity.

### 5.3 Chart sections

The model-mix donut and the agent-type bars share **one** `PanelSection`
carrying `gap-8 xl:grid xl:grid-cols-2`. Below `xl:` the two stack inside that
section, separated by space; at `xl:` they sit side by side, because the detail
pane is wide enough that stacking wastes it. Everything else stays full width at
every breakpoint.

This paragraph originally asked for two hairline-separated `PanelSection`s that
merge into one at `xl:`. **CSS cannot express that**: a hairline between two
sections and a two-column grid inside one section are different element trees,
and a media query cannot restructure the DOM. One section with a responsive grid
is the shipped resolution; the cost is that the two charts are separated by space
rather than by a rule at narrow widths, which is the correct trade in a panel
whose whole grammar is hairline-divided sections.

### 5.4 Which sections appear for which event type

| Section | Spec | Plan | Debt | Audit | Fitness | Forensics | Harden | Wiki | Review |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 Header | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| 2 Metric strip (Cost / Elapsed / Total tokens) | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| 3 Model mix donut (`byModel`) | yes | yes | yes | yes | yes | yes | yes | yes | no |
| 4 Agent-type bars (`byAgentType`) | yes | yes | yes | yes | yes | yes | yes | yes | no |
| 5 Phase segmented bar (cost share, elapsed share) | yes | yes | no | no | no | no | no | no | no |
| 6 Adversarial audit block | yes | yes | no | no | no | no | no | no | no |
| 6a Intensity badge (in header) | yes | no | no | no | no | no | no | no | no |
| 6b Audit-share meter | yes | yes | no | no | no | no | no | no | no |
| 6c Lens list (full names) | yes | yes | no | no | no | no | no | no | no |
| 6d "Subset, never added to any total" caveat | yes | yes | no | no | no | no | no | no | no |
| 7 Run id | no | no | yes | yes | yes | yes | yes | yes | no |
| 8 Artifact link (PR / issue) | in header, from execute phase | in header, from execute phase | in header | in header | in header | in header | in header | in header | no |
| 9 Linked sessions | yes | yes | yes (one) | yes (one) | yes (one) | yes (one) | yes (one) | yes (one) | yes (one) |

Rows 3 and 4 render `ChartEmpty` rather than disappearing when their source is
`null`. Rows 5, 6, and 7 are absent entirely for the types marked "no": a section
that can never apply is not shown as empty.

**Ad-hoc reviews get a reduced composition** (header, metric strip, one linked
session) because `adHocReviewSchema` carries no `byModel` or `byAgentType`. A
permanently empty donut on roughly a third of all events would read as a bug. If the contract
later gains those fields, reviews adopt rows 3 and 4 with no other change.

**Entry-level model mix.** `CostEntry` carries `byModel` per phase, not per
entry. The panel merges the scalar maps across phases, skipping `null` phases,
via `mergeScalarMaps(phases, 'byModel')` in `Work/event-meta.ts` (K3 owns it).
When every phase is `null`, render `ChartEmpty`. Backfill rows carry no `byModel`
at all, so this is the common path, not an edge case.

### 5.5 The adversarial audit block

Present only on spec and plan events that have at least one phase carrying
`audit`. Composition, in order:

1. `<h3 className="text-title text-fg">Adversarial audit</h3>`
2. Caveat: `<p className="text-label text-fg-mute">A subset of this phase, shown
   for detail and never added to any total.</p>` (carried forward verbatim from
   v1, which is correct and load-bearing).
3. A three-value `MetricStrip` for the audit itself: Cost, Elapsed, Total tokens.
4. The audit-share meter (C-37, §6.2): the audit's dollars as a share of the
   enclosing phase's dollars, in `secondary` (the confidence hue), with the
   percentage direct-labeled and the caption `of {phase} phase cost`.
5. The lens list (C-27), full names via `resolveLensName(lens, phase.kind)`.

The v1 `border-l-2 pl-3` container is deleted. The block is a `PanelSection`
separated by hairlines like every other section.

**When no phase carries an audit**, the section renders the explicit "No
adversarial audit" state from §7.4 rather than disappearing. Audits are present
on 17 of 35 specs and 25 of 44 plans, so roughly half of all spec and plan events
have none; silence on that many events reads as a bug.

### 5.6 Command event additions

`Run id` renders as a `<dl>` row in the same section as the linked session, both
at `text-label`, the id in `font-mono break-all`. The artifact link lives in the
header (row 8 above), not here, because it is identity rather than detail.

---

## 6. Chart specifications

Every chart follows the existing kit's pattern exactly:

- A presentational SVG component under `app/components/Charts/<Name>/index.tsx`.
- Its geometry in a **sibling pure module** with its own tests, as `bar-path.ts`
  and `scale-helpers.ts` already do.
- Colors expressed as Tailwind utility classes (`fill-accent`, `stroke-border`),
  never CSS variables: **CSS variables do not substitute inside SVG presentation
  attributes**.
- All chart text at `text-label`.
- Axes and gridlines: 1px, **solid**, `stroke-border`. Never dashed.
- Marks: bars capped at 24px thick, 4px rounded data-end, square at the baseline.
- A transparent hit `<rect>` per mark with `tabIndex={0}`,
  `role="graphics-symbol"`, an `aria-label` carrying the value, and
  focus showing exactly what hover shows.
- An `sr-only` list twin of every datum, alongside the chart.
- A legend whenever there are two or more series; none for one series (the title
  names it).

Read `.claude/skills/dataviz/` before touching any of these. The relevant
non-negotiables are: one axis ever (never two y-scales), color follows the entity
and not its rank, and hue is never the sole channel here (§2.6).

### 6.1 Donut

**Encodes.** Share of total tokens per model within one event. Part-to-whole at a
glance, which is the only job a donut is allowed.

**File.** `app/components/Charts/Donut/index.tsx`, geometry in
`app/components/Charts/donut-arc.ts` with tests.

```ts
export type DonutArc = {
  endAngle: number;    // radians, clockwise from 12 o'clock
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
};
export const donutArcPath = (arc: DonutArc) => string;
export const donutSegments = (
  values: {key: string; value: number}[],
  padAngle?: number
) => {key: string; startAngle: number; endAngle: number; share: number}[];
```

**Dimensions.** `viewBox="0 0 160 160"`, outer radius 70, inner radius 46 (ring
thickness 24). Rendered at `size-32 shrink-0 sm:size-40`.

**Segment gap.** `padAngle` default `0.02` radians, which yields roughly 2px of
surface between arcs at r=58. The gap is geometric: never a stroke around a mark.

**Colors.** `buildSeriesColorMap` over `groupTailSeries(rows, 6)`. Five named
models maximum plus `other`, so the ring never exceeds six segments. The tail
folds into `other` in `fill-fg-mute`.

`groupTailSeries`'s `limit` is the **total** segment cap, named keys plus
`other`, not a named-only cap. This paragraph said `5` from P0 through P3 while
claiming six segments, which is an arithmetic error: 5 yields four named plus
`other`. W2 built to the stated outcome and passed 6, which is correct.

**Center.** Total tokens, compact, at
`fill-fg font-mono text-metric-sm tabular-nums` on the first `<text>` and the
caption `tokens` at `fill-fg-mute text-label` on the second, both
`textAnchor="middle"`. Font size on an SVG `<text>` is expressed in user units,
so `text-metric-sm` (1.5rem) renders at 24 of the viewBox's 160 units, which is
the intended proportion at every rendered size.

**Legend.** Always present at two or more segments. To the right at `sm:` and
above, below at base:
`flex flex-col gap-4 sm:flex-row sm:items-center` on the wrapper, the legend as
`<ul className="flex flex-col gap-1.5">`, each row swatch + model name
(`formatModelName`) + compact tokens + share percent, at `text-label`, values in
`font-mono tabular-nums`.

**Tooltip.** Per-segment, on hover and focus. Title = model name, one row =
tokens, one row = share percent. Anchored at the arc's centroid; when the
centroid `y` is under 56px, pass `placement="below"` (C-46).

**Small widths.** The SVG scales with its `size-*` box, so nothing reflows inside
it. Below `sm` the legend goes underneath and the ring centers.

**Degenerate cases.**

| Case | Render |
| --- | --- |
| `byModel === null` or `{}` | `ChartEmpty`, copy in §7.4 |
| Exactly one model | A single-series bar plus the model name, not a donut. A one-slice donut is a filled circle that encodes nothing. |
| Two or more models | The donut |

**The single-model bar is not `SegmentedBar`.** This section originally named
it, which contradicts §6.4: `SegmentedBar` is defined as the three fixed,
ordered phase keys with a fixed ordinal ramp and accepts no arbitrary series.
W9 shipped a local `SingleSeriesBar` in
`Work/EventDetail/ChartSections/index.tsx` that borrows §6.4's visual vocabulary
verbatim (same `h-3` bar, same `rounded-full` fill, same `gap-0.5` surface gap,
same legend row shape) and carries an `aria-label` reading `{model}: {tokens},
100%`. That is the shipped contract.

Widening `SegmentedBar` to take an ordered series list and collapsing the two is
the better end state, but it is a chart-kit refactor reaching into the Work
tab's detail panel, not a restyle. It is **not** P4 work; it belongs to P5
polish or later. Recorded so the duplication reads as a deliberate deferral
rather than an oversight.

### 6.2 Gauge

**Encodes.** One ratio against a whole: the adversarial audit's cost as a share
of its phase's cost.

**Form: a linear meter, not an arc.** The `dataviz` skill's form heuristic sends
"a single ratio against a limit" to a meter with a same-ramp track, and its
anti-patterns explicitly reject a two-slice radial. A semicircular gauge would
also need a visible track, and the only token quiet enough for a track
(`border`, `secondary-2`) sits under 3:1, so an arc's unfilled extent would be
unreadable. A linear meter puts the number in text where it belongs and uses the
track only as context. The component keeps the name `Gauge` because P1/W2 owns
that path; its doc comment must say it renders a linear meter.

**File.** `app/components/Charts/Gauge/index.tsx`, geometry in
`app/components/Charts/gauge-geometry.ts` with tests (`clampShare`,
`meterWidthPercent`, and the "always at least 2% wide when non-zero" rule so a
0.3% share is still visible).

**Dimensions.** Plain HTML, not SVG. Track
`bg-border h-1.5 w-full overflow-hidden rounded-full`, fill
`bg-secondary h-full rounded-full` with `style={{width: '34%'}}`.

**Labels.** Above the track:
`<p className="text-label text-fg-dim">Audit share of phase cost</p>` and
`<p className="text-metric-sm font-mono text-fg tabular-nums">34%</p>`. Below:
`<p className="text-label text-fg-mute">$4.20 of $12.34, execute phase</p>`.

**Accessibility.** `role="meter"` is not broadly supported; use
`role="progressbar"` with `aria-valuemin={0}`, `aria-valuemax={100}`,
`aria-valuenow`, and `aria-valuetext="34 percent of phase cost"`. The value is
also in visible text, so nothing is gated on the role.

**Tooltip.** None. Every value is direct-labeled.

**Small widths.** The track is `w-full` and the labels wrap; no breakpoint needed.

**Degenerate cases.** Phase dollars `null` or `0` means no share can be computed:
render the audit's absolute cost and the copy from §7.4 instead of a meter at 0%.
A `0%` meter would claim the audit cost nothing.

### 6.3 Sparkline

**Encodes.** The shape of a short series over time inside a stat tile. Never a
standalone chart.

**File.** `app/components/Charts/Sparkline/index.tsx`, geometry in
`app/components/Charts/sparkline-path.ts` with tests.

```ts
export const sparklinePath = (
  values: number[],
  box: {height: number; width: number}
) => string;
```

**Dimensions.** `viewBox="0 0 120 32"` on an `<svg className="h-8 w-full">` with
`preserveAspectRatio="none"`, so the line stretches to the tile width. The stroke
must then carry `vectorEffect="non-scaling-stroke"` or non-uniform scaling
distorts it.

**Marks.** One `<path>`, `stroke-accent`, `strokeWidth={2}`,
`strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`. **No separate
end dot**: under `preserveAspectRatio="none"` a circle renders as an ellipse. The
round cap gives a clean terminus and needs no correction.

**Color.** Always slot 1 (`accent`). A sparkline is one series by definition.

**Axis, gridlines, labels.** None. The tile's own value is the direct label; the
sparkline carries shape only.

**Tooltip.** None. Per-point hover on a 120x32 mark inside a KPI tile is a
pinpoint target and fails the hit-size rule. The value is never gated on it,
because the tile's `text-metric` value is the current figure and the `aria-label`
carries the range.

**Accessibility.** `role="img"` with
`aria-label="{n} points, low {min}, high {max}, latest {last}"`.

**Small widths.** `w-full` handles every case; the minimum tile width at a 320px
viewport in a two-column grid is roughly 7rem, and the line simply compresses.

**Degenerate cases.** Fewer than two points renders nothing at all and reserves
no space. A one-point sparkline is a dot pretending to be a trend.

### 6.4 SegmentedBar

**Encodes.** Part-to-whole across the ordered spec, plan, and execute phases, for
one measure at a time.

**Two bars, never one.** Cost share and elapsed share are different scales, so
they get two stacked bars with their own legends. Combining them would be a
dual-axis chart, which is prohibited without exception.

**File.** `app/components/Charts/SegmentedBar/index.tsx`, geometry in
`app/components/Charts/segment-shares.ts` with tests (share computation, the
minimum-visible clamp, and the null-value skip).

**Dimensions.** Plain HTML flex, not SVG, because a `rounded-full` SVG rect under
`preserveAspectRatio="none"` distorts its corners.

```tsx
<div className="flex h-3 w-full gap-0.5">
  {segments.map((s) => (
    <div key={s.key} className={twJoin('min-w-1 rounded-full', s.fillClass, opacityTransition, hovered === s.key && 'opacity-80')}
         style={{flexGrow: s.value}} />
  ))}
</div>
```

`gap-0.5` is the required 2px surface gap between touching fills. `min-w-1`
guarantees a 4px sliver for a sub-1% phase.

**Colors: an ordinal ramp, not categorical slots.** Phases are an ordered
sequence, so they take three steps of one hue, dark to light in phase order:

| Phase | Class |
| --- | --- |
| Spec | `bg-accent-2` |
| Plan | `bg-accent` |
| Execute | `bg-accent-soft` |

This keeps the categorical slots free for model and agent-type series and stops
"plan phase" wearing the Audit event tone. `accent-2` is legal here because it is
a mark, not text (4.27:1 against `bg-elev`, above the 3:1 graphical threshold).

**Legend and labels.** No in-segment labels: a 12px bar cannot hold text without
clipping. A legend list sits beneath the bar, one row per phase:

```
[swatch]  Spec        34%      $4.20
```
at `text-label`, values `font-mono tabular-nums`. Every value is visible, so no
tooltip is needed.

**Interaction.** Hovering or focusing a segment sets `opacity-80` on it and
`text-fg` on its legend row; hovering a legend row does the same to its segment.
Cross-highlighting in both directions, `opacityTransition` and `colorTransition`
respectively. No tooltip.

**Small widths.** The bar is `w-full` at every breakpoint. The legend is a
two-column grid below `sm` and a four-column grid at `sm:` and above.

**Degenerate cases.**

| Case | Render |
| --- | --- |
| Zero phases | `ChartEmpty`, copy in §7.4 |
| One phase | One segment at 100% plus its legend row. Honest, not degenerate. |
| A phase with `null` dollars | Skipped from the cost bar and named in a footnote (`Execute phase recorded no cost`), never treated as zero. |
| Every phase `null` for a measure | That bar is replaced by `ChartEmpty`; the other bar still renders. |

### 6.5 Chart color assignment rules

- **Model and agent-type series** take chart-palette slots in the order
  `groupTailSeries` produces (grand total descending, ties alphabetical), folding
  the tail into `other` in `fill-fg-mute`. This is rank-ordered assignment, which
  the `dataviz` skill's "color follows the entity" rule warns about: a filter that
  drops a series repaints the survivors. In v2 nothing filters a model list, so
  the risk does not materialize; it is recorded here as a known constraint and
  listed in §10.
- **Phase segments** take the accent ordinal ramp (§6.4), fixed by phase, never
  by rank.
- **Event tones** never appear in a chart, with one exception: a chart that plots
  events by type (none exists in v2) would use them, and it would need the
  redundant icon and label treatment on every mark.
- **Single-metric charts** (heatmap, one-series bars, sparkline) stay on the
  accent ramp, unchanged from v1.

### 6.6 Changes to the existing kit

| File | Change |
| --- | --- |
| `chart-palette.ts` | Append `fill-info`, `fill-moss` and `bg-info`, `bg-moss` at slots 7 and 8. `MAX_CONCURRENT_SERIES` 6 to 8. Existing slots 1 through 6 keep their order and their hues (§2.6). |
| `ChartTooltip/index.tsx` | Delete `shadow-lg`. Add `placement`. `text-xs` to `text-label`. |
| `ChartLegend/index.tsx` | `text-xs` to `text-label`. Add optional `activeLabel` for cross-highlighting. |
| `HorizontalBars/index.tsx` | Chart text `text-xs` to `text-label`. Bump `ROW_HEIGHT` 26 to 30 and `labelWidth` default 128 to 148 so 13px labels do not collide. |
| `StackedWeeklyBars/index.tsx` | Tick and week-label text `text-[0.625rem]` to `text-label`. `MAX_WEEK_LABELS` 8 to 6, and `LEFT_MARGIN` 44 to 56, both because 13px ticks need more room. `SEGMENT_GAP` stays 2. |
| `TrendBars/index.tsx` | Edge-label text to `text-label`. `BOTTOM_MARGIN` 20 to 24. |
| `CalendarHeatmap/index.tsx` | Month and weekday label text to `text-label`; thin month labels to every other month if they collide. The all-zero legend collapse stays a known limitation (§10). |
| `PeriodSpendBars/index.tsx` | Label text to `text-label`. |

Every one of these is a class or constant change. No chart's data contract
changes except through the P2 schema work.

---

## 7. Empty, loading, and error states

Null source data is the common path in this product, not an edge case:

- Adversarial audits cover 17 of 35 specs and 25 of 44 plans, so roughly half of
  spec and plan events have none.
- Backfill rows carry no `byModel` and no `byAgentType` at all.
- 4 of 33 `gaia-debt` rows carry no `github`, so the artifact link is optional.
- Command events have no ledger status, ever.

Empty states here teach what would fill them. None of them says "No data".

### 7.1 Event list

| State | Render |
| --- | --- |
| Empty, no events at all | `EmptyState` filling the list pane. Title `No GAIA events yet`. Description `Events appear here as GAIA records specs, plans, reviews, and command runs to this project's cost ledger. A fresh project has none.` Icon `unknown`. |
| Empty after a filter | `EmptyState` inside the list, below the still-visible filter row. Title `No {category} events`. Description `This project has no {category} events yet. Choose "All events" to see everything.` The filter row stays operable; never trap the user in an empty filter. Note that the disabled-zero-count options (C-10) make this state rare by construction. |
| Loading | `EventListSkeleton`: the filter row rendered with both selects `disabled`, then five skeleton cards at the real card's exact dimensions (`px-4 py-3`, four rows, `shimmer` over real placeholder strings). `aria-hidden`; `AsyncSection`'s `role="status"` carries the announcement. |
| Error | `ErrorState` filling the list pane with `onRetry={refresh}`. The detail panel renders nothing in this case (there is no selection to describe). |

### 7.2 Detail panel

| State | Render |
| --- | --- |
| No selection | Only reachable when the list is empty. Renders `EmptyState`, title `Select an event`, description `Choose an event on the left to see what it cost, how long it took, and how many tokens it used.` |
| Deep link to a filtered-out event | Reset the filter to "All events" and select the target. Never show an empty panel because a stale `?filter=` hid the deep-linked event. |
| Deep link to a nonexistent key | Fall back to the most recent event and drop the `?entry=` param. No error; a stale link is not a failure. |
| Loading | `EventDetailSkeleton`: the panel shell with a header block, a three-value metric strip at real dimensions, and two chart-sized `Skeleton` blocks. Same section hairlines as the real panel, so the swap causes zero layout shift. |
| Error | `ErrorState` in place of the panel, `onRetry={refresh}`. |

### 7.3 Skeleton rules

Skeletons are shaped like the content they replace, using the transparent-text
technique over the real strings wherever the string is static (labels, headings,
captions) and `Skeleton` blocks wherever it is dynamic (values, charts, titles).
Never a spinner in the middle of content. The one spinner in the product is on
the refresh button (C-08), and it is on a control.

On refetch, hold the previous render rather than flashing a skeleton:
`AsyncSection` already only shows the skeleton on `status === 'loading'`, and
`useDashboardData` must keep the resolved data while refetching.

This was verified in P1 and it **fails**: see §10 defect 7. `ApiResourceState`
has no variant that carries stale data alongside `loading`, so this requirement
is unimplementable without a change to the union itself. W12 owns that change in
P4. Until it lands, every refresh press blanks the console.

### 7.4 Per-chart empty states

Every one of these renders `ChartEmpty` (C-30), never a hollow chart, never a
zeroed chart, and never nothing at all.

| Surface | Condition | Title | Reason |
| --- | --- | --- | --- |
| Model mix donut | `byModel` null or empty on every phase | `No model breakdown` | `This event was reconstructed from the backfill, which records total cost but not which models did the work.` |
| Agent-type bars | `byAgentType` null or empty on every phase | `No agent-type breakdown` | `This event was reconstructed from the backfill, which records total cost but not which agents did the work.` |
| Adversarial audit block | no phase carries `audit` | `No adversarial audit` | `This {spec\|plan} ran without an adversarial audit pass. When one runs, its cost, elapsed time, and the lenses it applied appear here.` |
| Audit-share meter | phase dollars null or 0 | `Audit share not available` | `The enclosing phase recorded no cost, so the audit's share of it cannot be computed. The audit itself cost {audit dollars}.` |
| Phase segmented bar | zero phases | `No phase breakdown` | `This entry has no recorded phases. Cost and elapsed time are reported at the entry level only.` |
| Phase segmented bar, one measure | every phase null for that measure | `No recorded {cost\|elapsed}` | `No phase on this entry recorded a {figure}. A missing figure is not a zero.` |
| Linked sessions | `sessions` empty | `No linked sessions` | `The ledger recorded this event without a session id, so there is no transcript to link.` |
| Sparkline | fewer than two points | renders nothing, reserves no space | (the tile's value stands alone) |
| Insights section | no costly entries, no long sessions, no active day, no busiest model | `No insights yet` (existing copy, keep) | existing copy, keep |
| Model mix section | no model activity | existing copy, keep | existing copy, keep |
| Activity heatmap | no output on any day | existing copy, retargeted from "output tokens" to "tokens" per the contract change | |
| Sessions list | no sessions | `No sessions yet` | `Sessions appear here once Claude Code writes a session log for this project.` |
| Parse health | clean | renders nothing | silent when there is no problem, existing behavior |

### 7.5 Missing-value rendering

One rule, everywhere: **a missing value renders as a missing value.**

- `null` recorded dollars renders `-`, never `$0.00`.
- `null` duration renders `-`, never `0m`.
- `null` status renders `-`, never `Unknown`.
- Nulls sort last in every direction, so a missing figure never reads as
  "cheapest" or "fastest".
- The dash is `NO_DATA_LABEL` from `app/data/format/units.ts` (moved there by W6),
  never a literal `'-'` typed into a component.

Where more than one figure in a view can be a dash, the view explains it once,
below the content, at `text-label text-fg-mute`: `A dash means the ledger
recorded no figure, never a zero.` Once per surface, never per cell.

### 7.6 New formatter required

`formatDateShort(iso, locale?)` in `app/data/format/units.ts`
(`{dateStyle: 'medium'}`, hoisted formatter, same shape as the existing
`formatDateTime`). The event card's row 4 needs a date without a time; the full
`formatDateTime` is roughly 22 characters and does not fit a 20rem card. W6 owns
this file and must add it alongside the moved formatters.

**Status: it never landed there.** W6 did not write it in P2, and W8 defined it
locally in `Work/EventList/EventCard/index.tsx` at P3 with a comment naming its
intended home, because `app/data/**` was closed to P3. This section is right
about where the function belongs, so the code moves to meet it rather than the
other way round: **P4's W12 moves it verbatim into `app/data/format/units.ts`
and repoints the one import.**

---

## 8. Motion

Motion conveys state. Nothing pulses, nothing celebrates, nothing announces the
page. All transitions land in the 150-250ms band; nothing exceeds it.

| What | Property | Duration | Easing | `motion-reduce` |
| --- | --- | --- | --- | --- |
| Event card hover and selected | `background-color`, `border-color` | 150ms | `ease-out` | `transition-none`; the color still changes, instantly |
| Tab active and hover | `color`, `border-color` | 150ms | `ease-out` | `transition-none` |
| Refresh button hover | `background-color`, `color` | 150ms | `ease-out` | `transition-none` |
| Select hover | `background-color` | 150ms | `ease-out` | `transition-none` |
| Link hover | `color` | 150ms | `ease-out` | `transition-none` |
| Chart mark hover | `opacity` | 150ms | `ease-out` | `transition-none` |
| Legend cross-highlight | `color` | 150ms | `ease-out` | `transition-none` |
| Segmented-bar cross-highlight | `opacity` | 150ms | `ease-out` | `transition-none` |
| Skeleton shimmer | `background-position` | 2s linear loop | linear | already `motion-safe:` gated; renders a static block |
| Refresh in flight | `transform: rotate` | 1s linear loop | linear | `motion-safe:animate-spin` only; the `Refreshing` label carries the state |
| Deep-link scroll | scroll position | browser default | browser default | pass `behavior: 'auto'` when `matchMedia('(prefers-reduced-motion: reduce)').matches` |

Use `colorTransition` and `opacityTransition` from §2.8. Do not hand-write the
class string; a `motion-reduce:transition-none` omitted once is an accessibility
regression that no test will catch.

**Deliberately absent motion**, each for a reason:

- **No transition on the detail panel swap.** Selection changes on every arrow
  key. A 200ms crossfade would fight rapid browsing and would make the panel feel
  laggy. The panel changes instantly.
- **No focus-ring transition.** A focus indicator that fades in is a focus
  indicator that is briefly invisible.
- **No tooltip transition.** A delayed tooltip on rapid hover reads as lag.
- **No entrance or reveal animation anywhere.** No staggered list, no
  scroll-triggered reveal, no page-load sequence. Product loads into a task.
- **No layout-property animation.** Nothing animates `height`, `width`, `top`, or
  `grid-template-rows`. The v1 accordion's `grid-template-rows` transition dies
  with `CostTable`.
- **No transform, scale, lift, or glow on any state.** The Flat-Forever Rule.

---

## 9. Retirement list

What is deleted or rewritten, and what replaces it. Each line is a
grep-verifiable target.

### 9.1 The eyebrow, banned outright

The pattern
`text-fg-mute font-mono text-[0.65rem] tracking-[0.15em] uppercase` and its
variants (`tracking-[0.2em]`, `text-[0.6rem]`, `text-[0.625rem]`, and every
`uppercase` in `app/components/**`). It appears in **13 files**:

`Tabs`, `Insights`, `KpiRow`, `AdHocReviews`, `CostTable`,
`CostTable/ExpandedDetail`, `ModelMix`, `ActivityHeatmap`, `SessionsList`,
`ParseHealth`, `DashboardHeader`, `CostTrend`, `ErrorState`.

**Replacement:** a plain sentence-case label at `text-label text-fg-dim`. Not one
uppercase treatment survives; v2 spends zero of its one-per-surface allowance.

**Sentence case means sentence case, including Title Case survivors.** The
eyebrow sweep replaced the class strings but left one string's capitalization
alone: `ModelMix`'s `Model Usage`, which is also the section's `aria-label` and
is asserted verbatim by four tests. It becomes **`Model usage`** in P4, owned by
W11, along with the region label in `App/index.tsx` and those assertions. Any
other Title Case heading found under `app/components/**` gets the same
treatment; proper nouns and identifiers (`SPEC-032`, `GAIA`, `PR`) keep their
capitalization.

**Acceptance grep, must return nothing:**
```bash
grep -rn "uppercase\|tracking-\[" app/components/ | grep -v "/tests/"
```

### 9.2 The display font

- `--font-display` deleted from `@theme`.
- The `h1, h2, h3 { @apply font-display font-light }` base block deleted.
- `font-display text-2xl font-light` replaced by `text-title text-fg` in
  `Insights`, `AdHocReviews`, `ModelMix`, `ActivityHeatmap`, `SessionsList`,
  `ParseHealth`, `CostTrend`.
- `font-display text-2xl font-light` on values replaced by `text-metric` in
  `KpiRow` and `AdHocReviews`.
- `font-display text-xl font-light` replaced by `text-title` in
  `DashboardHeader` and `Insights`'s `statValueClassName`.
- `font-display text-lg font-light` replaced by `text-title` in `EmptyState`.
- The Fraunces `<link>` block plus both `preconnect` links deleted from
  `index.html`. They are a Google Fonts fetch that fails offline, and
  `npx gaia-dashboard` must render correctly with the network off.

**Acceptance grep, must return nothing:**
```bash
grep -rn "font-display\|fonts.googleapis\|fonts.gstatic" app/ index.html
```

### 9.3 Deleted components and hooks

| Path | Replaced by |
| --- | --- |
| `app/components/Sections/CostTable/**` | `Sections/Work/EventList` and `Sections/Work/EventDetail` |
| `app/components/Sections/AdHocReviews/**` | Review events in the same unified list |
| `app/hooks/useCollapse.ts` | Nothing. There is no accordion in v2. Delete if nothing else references it. |
| `CostTable`'s `ViewToggle` (specs / plans) | The filter select's Work optgroup |
| `CostTable`'s `TotalsSummary` | The KPI row, which already reports recorded spend |
| `CostTable`'s `targetRowClass` (`bg-accent/5 ring-accent/40 ring-1 ring-inset`) | The selected-card treatment (§4.4) |
| `KpiRow`'s `TotalTokensTile` `<details>` bucket expander | A plain number tile |
| `CostTable/format.ts` | `app/data/format/units.ts` (moved by W6) |
| `sumBuckets`, `modelTotal`, `bucketRows` | Deleted with the contract change |

### 9.4 Banned markup that survives into v2 and must be fixed

| Location | Violation | Fix |
| --- | --- | --- |
| `app/components/Charts/ChartTooltip/index.tsx:29` | `shadow-lg` breaks The Flat-Forever Rule | delete it; the existing `border-border bg-bg-elev-2 border` already separates the tooltip |
| `app/components/Sections/CostTable/ExpandedDetail/index.tsx:107` | `border-l-2` side stripe, prohibited outright | dies with `CostTable`; the audit block becomes a hairline-divided `PanelSection` |
| `app/components/EmptyState/index.tsx:9` | `border-dashed` is template scaffolding | solid `border-border-soft` |
| `app/components/Sections/SessionsList/index.tsx` `badgeClassName` | `rounded-full` badge, prohibited outside genuine toggle chips | `rounded-sm` |
| `app/styles/tailwind.css:3` | `@custom-variant dark` is dead; there is not one `dark:` utility in `app/` | delete |
| `app/styles/tailwind.css:67` | base link hover `text-accent-2` measures 4.27:1 on `bg-elev` and fails AA | `hover:text-accent-soft` |

### 9.5 Bucket vocabulary, removed structurally

No component may name a token bucket. The contract change in P2 makes this
structural rather than a rendering convention, but the components still have to
be cleaned:

- `KpiRow`'s `bucketRows` (`Fresh input`, `Cache write`, `Cache read`, `Output`).
- `ExpandedDetail`'s `BreakdownTable` and `PhaseRow`'s "output tokens".
- `AuditDetail`'s `Tokens` row (keeps the row, drops the bucket sum).
- `ActivityHeatmap`'s tooltip rows and `HeatmapAccessibleSummary`, both of which
  enumerate all four buckets. The tooltip keeps total tokens plus session count
  only; the accessible summary matches it.
- `ModelMix`'s "Output tokens by model" headings become "Tokens by model".
- `Insights`'s `output` references become total tokens.

**Acceptance grep, must return nothing:**
```bash
grep -rn "Fresh input\|Cache write\|Cache read\|cacheRead\|outputByModel" app/components/
```

---

## 10. Defects found, not fixed

Recorded here rather than fixed, per the shaping brief's constraint. Each entry
carries its current status; four of the seven are now closed.

1. **RESOLVED in P1.** **`ChartTooltip` carries `shadow-lg`**
   (`ChartTooltip/index.tsx:29`), which had violated The Flat-Forever Rule since
   v1. Fix is in §9.4; W2 deleted it and the P1 integrator confirmed the grep.
2. **RESOLVED in P1.** **The base link hover fails AA on elevated surfaces.**
   `a:hover` resolved to `accent-2` at 4.27:1 against `bg-elev`. K1 stepped it to
   `accent-soft` per §2.4.
3. **RESOLVED in P3.** **`fg-mute` fails AA on `bg-elev-2`** at 4.15:1. It was
   latent in v1 wherever `text-fg-mute` sat on a `bg-elev-2` table header or chip
   (`CostTable`'s `TableHead`, `Insights`'s `statTileClassName`,
   `ExpandedDetail`'s `auditLensClass`). Most died with the retirement list;
   `Insights` did not, and the P3 integrator stepped its stat-tile captions to
   `fg-dim`. **P4 must not re-route this to W11 as open work.** The rule it comes
   from (§2.2, no `fg-mute` on any surface that can raise to `bg-elev-2`) stays
   binding on every new component.
4. **Chart series colors are assigned by rank**, not by entity
   (`buildSeriesColorMap` maps palette slots to position in a total-sorted key
   list). Nothing in v2 filters a model list, so no recolor-on-filter can occur,
   but the constraint is real and should be revisited if model filtering is ever
   added.
5. **`CalendarHeatmap`'s legend collapses to duplicate "over 0" labels** on
   all-zero data. `ActivityHeatmap` works around it by rendering an empty state
   instead of the chart. The kit limitation is unfixed and stays unfixed in v2.
6. **The README's audit-coverage figure and the shaping brief disagree.** The
   README states coverage is "17/35 specs and 25/44 plans"; the brief handed to
   this agent said "17 of 35 specs and 19 of 44 plans have **no** audit". This
   spec follows the README, so §5.5 and §7 say roughly half of spec and plan
   events have no audit. If the exact figure matters to any copy, re-derive it
   from `../gaia/.gaia/local/telemetry/cost.jsonl` before P3.
7. **CONFIRMED REAL in P1, owned by W12 in P4.** **`useApiResource` flashes
   skeletons on every refresh.** `refetch()` calls `setState({status:
   'loading'})` synchronously, and `ApiResourceState` is a discriminated union
   with **no variant carrying stale data alongside `loading`**, so holding the
   previous render is structurally impossible, not merely unimplemented.
   `useDashboardData.refresh()` calls it for both resources, so one press blanks
   the whole console. This contradicts §7.3 and it is a hook and type change
   (`app/hooks/useApiResource.ts`, `app/hooks/useDashboardData.ts`), not a
   component tweak. It is also the prerequisite for C-31's X and L states. It was
   unowned from P1 through P3; **P4's W12 owns it.**

---

## 11. Judgment calls

Decisions made where a genuine gap remained. Each is implemented in the spec
above and listed here so the orchestrator can surface it at the P0 checkpoint.

1. **The top bar is not `position: sticky`; it sits outside a flex-column scroll
   region.** Functionally identical (always visible), and it removes every
   sticky-offset magic number from the build: the list pane sticks at `top-0` of
   its own container. The trade is that the Work tab's panes scroll internally at
   `lg` and up rather than the page scrolling, which is exactly what
   `logistics-dashboard.jpg` does. Reversible: making the header `sticky top-0
   z-20` and dropping the fixed-height shell would need a measured offset.
2. **The project root truncates at `lg` and above, with a `title` attribute, and
   wraps in full below `lg`.** The v1 code has a comment insisting it is never
   truncated. Keeping that in a single-row 4rem bar is not possible alongside the
   name, freshness, tabs, and refresh. The project *name* does the "am I looking
   at the right project" job; the root is disambiguation.
3. **Status text is never colored.** Only the `partial` marker takes `warn`. A
   second semantic color axis alongside the nine event tones would make both
   harder to read, and the status word is already fully legible.
4. **Review's chip text is `fg-dim`, not its tone.** `fg-mute` has no `-soft`
   variant and fails AA on `bg-elev-2` at 4.15:1. The icon keeps `fg-mute`
   (non-text, clears 3:1). The Review event still reads as the quietest type.
5. **The type chip gains a 1px `border-border-soft`.** `DESIGN.md` specifies
   `bg-elev-2` for the chip and `bg-elev-2` for the selected card; without a
   hairline the chip vanishes on selection. The border is the minimum addition
   that keeps one chip vocabulary across both surfaces.
6. **`Gauge` renders a linear meter, not an arc.** The `dataviz` form heuristic
   sends a single ratio to a meter, its anti-patterns reject two-slice radials,
   and no token in this palette is quiet enough to serve as a visible arc track
   above 3:1. The component keeps the runbook's filename.
7. **The chart palette appends `info` and `moss` at slots 7 and 8 rather than
   inserting them after the base hues.** Measured: inserting drops the worst
   all-pairs CVD separation to ΔE 2.9 at five series (`moss` against
   `secondary`); appending holds 5.4 through six. It also avoids repainting every
   existing chart.
8. **Phase segments use an accent ordinal ramp, not categorical slots.** Phases
   are ordered, and using slots 1 through 3 would put the Audit event tone on the
   plan phase.
9. **Ad-hoc reviews get a reduced detail composition** (no donut, no agent-type
   bars) because `adHocReviewSchema` carries no `byModel` or `byAgentType`.
   Rendering two permanently empty charts on roughly a third of all events would
   read as a bug. This is the same judgment as the README's "fold reviews into Maintenance"
   call and should be confirmed at the same checkpoint.
10. **The detail panel swap is instant, with no crossfade.** Selection follows
    arrow-key focus, so any transition would fire on every keypress.
11. **Zero-count filter options render `disabled`.** They teach that the category
    exists without letting a user navigate into a guaranteed-empty list. The
    "empty after filter" state is still specified (§7.1) because a stale deep link
    can still reach it.
12. **Selection follows focus in the event list.** Arrow keys move both the
    selection and the detail panel, and there is no separate "activate" step. This
    is what makes arrow-key browsing worth having; the alternative (focus moves,
    Enter selects) doubles the keystrokes for the primary task.
13. **The count line is the Work tab's only `aria-live` region.** A filter change
    is otherwise imperceptible to a screen reader user. Selection changes are not
    announced, because the user initiated them and the panel heading labels the
    region.
14. **All chart text steps to `text-label` (13px), and charts thin their labels
    rather than shrinking them.** This costs tick density (`MAX_WEEK_LABELS` drops
    from 8 to 6, margins grow) and buys the "larger font sizes" the feedback asked
    for, with zero arbitrary type sizes left in the codebase.
15. **`tabular-nums` is kept at `text-metric`**, against the `dataviz` skill's
    preference for proportional figures on large standalone numbers.
    `DESIGN.md`'s Numerals-Are-Mono Rule is explicit, and the metric strip's values
    sit in a fixed screen position across selections, where equal-width digits stop
    the panel jittering as the user arrow-keys down the list.
