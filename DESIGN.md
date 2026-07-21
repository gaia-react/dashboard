---
name: GAIA Dashboard
description: Dark, full-bleed operations console for a single GAIA project's cost, time, and activity.
colors:
  bg: '#141413'
  bg-elev: '#1f1e1d'
  bg-elev-2: '#262624'
  bg-tint: '#181c1e'
  fg: '#faf9f5'
  fg-dim: '#b0aea5'
  fg-mute: '#87867f'
  accent: '#d97757'
  accent-2: '#c96442'
  accent-soft: '#efa58e'
  secondary: '#5b8a8a'
  secondary-2: '#436c6c'
  secondary-soft: '#8eb4b4'
  warn: '#d9a857'
  warn-2: '#b88a3f'
  warn-soft: '#ecc781'
  info: '#6183ad'
  info-2: '#4a688c'
  info-soft: '#9db6d6'
  moss: '#7a9463'
  moss-2: '#5f764c'
  moss-soft: '#a8bf94'
  border: '#3d3d3a'
  border-soft: '#2e2e2b'
typography:
  metric:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    fontSize: '2.25rem'
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: '-0.02em'
    fontFeature: 'tabular-nums'
  metric-sm:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    fontSize: '1.5rem'
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '-0.01em'
    fontFeature: 'tabular-nums'
  title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 'normal'
rounded:
  xs: '2px'
  sm: '4px'
  md: '6px'
  full: '9999px'
spacing:
  hair: '4px'
  tight: '8px'
  snug: '12px'
  base: '16px'
  loose: '24px'
  section: '32px'
components:
  event-card:
    backgroundColor: '{colors.bg-elev}'
    textColor: '{colors.fg}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
  event-card-hover:
    backgroundColor: '{colors.bg-elev-2}'
    textColor: '{colors.fg}'
  event-card-selected:
    backgroundColor: '{colors.bg-elev-2}'
    textColor: '{colors.fg}'
    rounded: '{rounded.md}'
  type-chip:
    backgroundColor: '{colors.bg-elev-2}'
    textColor: '{colors.fg-dim}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '2px 8px'
  select-control:
    backgroundColor: '{colors.bg-elev}'
    textColor: '{colors.fg}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '6px 12px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.fg-dim}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '6px 12px'
  button-ghost-hover:
    backgroundColor: '{colors.bg-elev-2}'
    textColor: '{colors.fg}'
  metric-block:
    backgroundColor: 'transparent'
    textColor: '{colors.fg}'
    typography: '{typography.metric}'
    padding: '0'
---

# Design System: GAIA Dashboard

**This file governs the dashboard only.** It inherits `../studio/branding/DESIGN.md`
(the GAIA studio brand document: burnt orange primary, slate teal secondary, amber
semantic, dark neutral surfaces, no purple, no cool grays, no dedicated success green)
and records three deviations sanctioned by the product owner for this surface:

1. **System sans instead of Fraunces.** `--font-display` is removed. This is a numbers
   dashboard read in a task, not an editorial surface; a display serif in UI labels is
   a product-register ban. No webfont is loaded at all, because `npx gaia-dashboard`
   must render correctly offline.
2. **`react-icons` (Lucide set) instead of hand-coded SVG.** Lucide is stroke-based,
   1.5px, round-capped, which is the style the studio document already describes, so
   this is a sourcing change rather than a visual one. All icons pass through a single
   `Icon` component.
3. **Two added hues, `info` and `moss`.** The dashboard encodes nine event types as a
   categorical scale; three hues cannot carry nine categories. Both new hues are
   **categorical only**. `moss` in particular is never a success state, so the studio
   document's no-success-green rule still holds.

Everything not listed above follows the studio document.

## 1. Overview

**Creative North Star: "The Mission Console"**

A wide, dark operations surface. On the left, the roster of everything that has
happened on this project; on the right, the one thing you selected, rendered large
enough to read across a desk. The console fills the browser edge to edge because the
data is the point and margins are not; it is calm because an operator glancing at it
needs to find one figure, not admire a composition.

The system is flat in the sense that matters: nothing casts a shadow, nothing is made
of glass, nothing pretends to float. Depth is communicated by **tone** (a three-step
neutral ramp from the page field up to interactive objects) and by **space** (padding
generous enough that a region reads as a region without needing chrome around it).
Color is a data encoding, never a finish: nine event types carry nine hues, warm for
Work and cool for Maintenance, and each hue appears only on an icon, a small chip, and
the selected card's border. A hue never fills a surface and never marks an inactive
state.

This system explicitly rejects three things. It is **not the GAIA marketing site**: no
display serif, no editorial hero pacing, no brand-first composition. It is **not a
generic admin template**: no Inter, no blue accents, no `gray-800` cards, no default
component-library look. And it is **not an observability chart-wall**: no uniform grid
of same-sized panels where everything is equally important. Every surface has one
primary answer and a hierarchy that says which one it is.

**Key Characteristics:**

- Full-bleed dark field, capped only at the very largest viewports.
- One type family (system sans) plus one mono, used for numerals only.
- Numerals are the largest thing on any surface.
- Tonal layering, zero shadows, zero gradients, zero glass.
- Color is categorical data; every colored thing also has an icon and a text label.
- Motion reports state changes and does nothing else.

## 2. Colors

A warm dark neutral field carrying a restrained categorical scale: three inherited
brand hues, two added for category headroom, and nothing decorative.

### Primary

- **Burnt Orange** (`accent`): the brand's voice and the interface's only "primary"
  color. Links, primary actions, focus rings, the current selection, and the
  single-hue ramp every one-metric chart uses. On the event scale it marks **Spec**,
  the highest-value event type. Kept under ~10% of any screen; its rarity is what
  makes it read as important.

### Secondary

- **Slate Teal** (`secondary`): the confidence hue. Plays the "yes / verified /
  checkmark" role that a success green would play in another system, because this
  system has no success green. On the event scale it marks **Audit**.
- **Amber** (`warn`): partial states, warnings, missing-data notices, and the
  "estimated rather than recorded" marker. On the event scale it marks **Debt**.

### Tertiary

Added for this surface. Categorical only; neither hue carries semantic meaning.

- **Muted Blue** (`info`): a desaturated steel blue that sits cool against the warm
  neutrals without reading as a link or as a system-info banner. Marks **Harden**.
- **Moss** (`moss`): a grey-green, deliberately dulled so it cannot be mistaken for a
  success state. Marks **Fitness**.

### Neutral

- **Warm Charcoal** (`bg`): the page field. Everything sits on it.
- **Raised Charcoal** (`bg-elev`): cards, panels, and any surface holding an
  interactive object.
- **Top Charcoal** (`bg-elev-2`): the hover and selected state of a raised surface,
  plus table headers and chips.
- **Slate Tint** (`bg-tint`): the cool-shifted alternate surface, used for alternating
  rows and for regions that should feel adjacent to but distinct from the main field.
- **Bone** (`fg`): primary text and every data value.
- **Warm Ash** (`fg-dim`): secondary text, labels, and axis text.
- **Stone** (`fg-mute`): captions, missing-data dashes, disabled text. On the event
  scale it marks **Review**, the deliberately quietest event type.
- **Iron** (`border`) and **Charcoal Rule** (`border-soft`): the 1px vocabulary.
  `border` separates objects, `border-soft` separates sections inside one object.

### Named Rules

**The Categorical Nine Rule.** The event scale is exactly nine tones and they are
fixed: Spec `accent`, Plan `accent-soft`, Debt `warn`, Audit `secondary`, Harden
`info`, Fitness `moss`, Wiki `secondary-soft`, Forensics `warn-soft`, Review
`fg-mute`. Warm hues are Work, cool hues are Maintenance, so the grouping is legible
before the label is read. An unrecognized event type degrades to `fg-mute` and a
generic icon; it never invents a tenth tone.

**The Soft-On-Elevated Rule.** Base hues clear AA body contrast on the page field but
not on raised surfaces: on `bg-elev`, `info` measures 4.25:1 and `secondary` 4.32:1,
both under 4.5. Therefore **body-size colored text on any elevated surface uses the
`-soft` variant.** Base hues are for icons, borders, chips, and text at 18px or above.
The `-2` variants are borders and hover states only; none of them clears body
contrast, and none of them may carry body text.

**The No-Fill Rule.** An event hue colors an icon, a chip, a border, or a chart mark.
It never fills a card background, never fills a button, and never appears on an
inactive or disabled state. Heavy saturation on a resting surface is prohibited.

**The Color-Is-Never-Alone Rule.** Every color-coded element carries a redundant
non-color signal: an icon and a text label at minimum. The interface must survive
greyscale, color blindness, and a screenshot.

## 3. Typography

**Body Font:** system sans (`ui-sans-serif, system-ui, sans-serif`)
**Label/Mono Font:** system mono (`ui-monospace, SFMono-Regular, Menlo, Monaco,
Consolas, monospace`)
**Display Font:** none. Deliberately removed.

**Character:** One family carries headings, labels, buttons, and body. The mono exists
for one job only: numerals, always with `tabular-nums` so columns of figures align and
a changing value does not reflow its neighbors. The pairing has real contrast
(humanist sans against a technical mono) rather than two similar sans faces, and the
mono's presence is what makes the surface read as an instrument rather than a
document.

### Hierarchy

A fixed rem scale. No `clamp()`, no fluid type: users view this at consistent DPI, and
a headline that shrinks inside a panel looks worse, not better.

- **Metric** (mono, 400, 2.25rem, 1.05, `-0.02em`, tabular): the one number a surface
  exists to report. KPI tiles and the detail panel's headline figures. At most three
  per surface.
- **Metric small** (mono, 400, 1.5rem, 1.1, `-0.01em`, tabular): card-level numbers
  and the detail panel's three-value metric strip.
- **Title** (sans, 500, 1.25rem, 1.25, `-0.01em`): section and panel headings, and the
  selected event's name in the detail header.
- **Body** (sans, 400, 0.9375rem, 1.5): default text, card titles, table cells,
  descriptions. Prose caps at 65-75ch; data and dense UI may run wider.
- **Label** (sans, 500, 0.8125rem, 1.2): every label, chip, select, badge, axis, and
  caption. **Sentence case, never uppercase, never letter-spaced.**

### Named Rules

**The No-Eyebrow Rule.** The tiny uppercase letter-spaced label above a section
(`text-[0.65rem] tracking-[0.15em] uppercase`) is prohibited. It is the single most
saturated AI tell in interface generation, and this codebase currently has it above
nearly every block. Labels are plain sentence case at the Label step. At most **one**
deliberate uppercase treatment may exist per surface, and it must be defensible as a
choice rather than a reflex.

**The Numerals-Are-Mono Rule.** Any figure a user might compare against another figure
(dollars, durations, token counts, dates, counts, percentages) is set in mono with
`tabular-nums`. Prose numbers inside a sentence stay in the sans.

**The Two-Step Rule.** Adjacent text steps sit at a 1.15-1.2 ratio, which is the tight
product-UI spacing that keeps a dense surface from turning into noise. The jump from
Body to Title (1.33) and from Metric small to Metric (1.5) are deliberate: those are
heading and display roles, not text roles, and they need to separate cleanly from the
label-and-body mass around them.

## 4. Elevation

**This system has no shadows.** Not one. Depth is carried entirely by tonal layering
and by space, and any `box-shadow`, `drop-shadow`, gradient, or `backdrop-filter` in a
component is a defect.

The neutral ramp is the elevation vocabulary. `bg` is the page field and the default
for everything that is not an object. `bg-elev` raises a surface that holds an
interactive object (an event card, the detail panel, a KPI tile). `bg-elev-2` is the
next step up and is reserved for **state**: the hover and selected appearance of a
raised surface, plus chips and table headers, which read as objects sitting on an
object. A fourth step does not exist; if a design seems to need one, the composition is
too nested.

Borders do the rest. `border` (1px, Iron) separates two objects. `border-soft` (1px,
Charcoal Rule) separates two sections inside one object, and it is the tool that makes
the detail panel work: flat sections divided by hairlines on a single surface, rather
than a grid of cards.

### Named Rules

**The Flat-Forever Rule.** Surfaces are flat at rest and flat in every state. A state
change moves a surface up the tonal ramp or changes a border color; it never adds a
shadow, a lift, a scale transform, or a glow. If it looks like a 2014 app, a shadow
got in.

**The No-Nested-Cards Rule.** A card inside a card is always wrong. The event list is a
legitimate card list because each card is a discrete selectable object. The detail
panel is **not** a grid of cards: it is one surface divided by rules. If a proposed
layout puts a bordered box inside a bordered box, restructure it as sections.

## 5. Components

### Buttons

- **Shape:** slightly softened corners (`rounded-sm`, 4px). Never pill-shaped except
  where a control is genuinely a toggle chip.
- **Primary:** burnt orange background, page-field text, 6px vertical by 12px
  horizontal padding at the Label step. Used sparingly; most of this interface is
  navigation and selection, not action.
- **Ghost (the default here):** transparent background, Warm Ash text, no border.
  Hover fills to Top Charcoal and lifts text to Bone. This is the refresh button, the
  tab strip, and most chrome.
- **Hover / Focus:** 150ms color transition, `motion-reduce` removing it entirely.
  Focus is a 2px burnt orange outline at 2px offset, never a background change alone.
- **States:** every button ships default, hover, focus-visible, active, disabled, and
  where it triggers work, loading. Disabled drops to Stone text with the default
  cursor and no hover response.

### Chips

- **Style:** Top Charcoal background, Warm Ash text at the Label step, `rounded-sm`,
  2px by 8px padding. The event **type chip** additionally takes its event hue as text
  color (the `-soft` variant, per The Soft-On-Elevated Rule) and pairs with the type
  icon in the same hue.
- **State:** chips here are read-only markers, not controls. A chip is never clickable;
  if it needs to be actionable it is a button.

### Cards / Containers

- **Corner Style:** 6px (`rounded-md`) for cards and panels, 4px for controls and
  chips.
- **Background:** `bg-elev` at rest, `bg-elev-2` on hover and when selected.
- **Shadow Strategy:** none. See Elevation.
- **Border:** 1px `border` at rest. **Selected takes a full 1px border in the event's
  own tone plus the raised surface.** A thick colored `border-left` stripe is
  prohibited outright.
- **Internal Padding:** 12px vertical by 16px horizontal on list cards; 24px on
  panels; 32px between major regions. Padding is the primary separator, which is what
  lets the surfaces stay flat.

### Inputs / Fields

- **Style:** native `<select>` and native inputs, styled with `bg-elev` background, 1px
  `border`, `rounded-sm`, Label-step text. Filter and sort are native selects with
  `<optgroup>`; custom popovers are prohibited for these because native elements
  already carry keyboard and screen-reader behavior that a rebuild would have to
  re-earn.
- **Focus:** 2px burnt orange outline at 2px offset. Never a glow, never a border-color
  shift alone.
- **Error / Disabled:** error borders take Amber with a text message beside the field,
  never color alone. Disabled drops to Stone text on the unchanged surface.

### Navigation

One sticky top bar carrying the wordmark, project identity, freshness line, refresh
button, and the tab strip; header and tabs are consolidated rather than stacked, so
vertical space goes to data. Tabs are ghost buttons; the active tab carries Bone text
and a 2px burnt orange underline, and inactive tabs stay Warm Ash with no fill.
Below `lg`, the two-pane console stacks: list above, detail below.

### Event Card (signature component)

The unit the whole Work surface is built from. A `<button>` inside a `<ul>`, carrying
in one glance: the type icon and type chip in the event's tone, the identifier
(`SPEC-032`, `gaia-debt`) in mono, the title in body sans, and a metric line of start
date, recorded cost, elapsed time, and status (or the linked artifact for command
events). Selected state is `aria-current="true"` plus the tonal border and raised
surface. Arrow keys move between cards, `Home` and `End` jump to the ends, and the
detail panel is labelled by the selected card.

### Detail Panel (signature component)

One `bg-elev` surface divided by `border-soft` hairlines into flat sections: header,
then a three-value metric strip (cost, elapsed, total tokens), then charts, then
event-specific sections. Not a grid of cards. Every chart in it has a defined empty
state, because null source data is normal here, and an empty donut reads as a bug.

## 6. Do's and Don'ts

### Do:

- **Do** use the full browser width. Horizontal padding `px-4 sm:px-6 xl:px-10`, capped
  only at `2xl:max-w-[140rem] 2xl:mx-auto`. The old `max-w-6xl` cap is gone.
- **Do** set every comparable figure in mono with `tabular-nums`.
- **Do** write labels in plain sentence case at 0.8125rem.
- **Do** give the selected event card a **full** 1px border in its own tone plus
  `bg-elev-2`.
- **Do** pair every hue with an icon and a text label.
- **Do** use the `-soft` variant for body-size colored text on any elevated surface.
- **Do** keep transitions in the 150-250ms band and give every one of them a
  `motion-reduce` alternative.
- **Do** ship all seven states for every interactive component: default, hover, focus,
  active, disabled, loading, error.
- **Do** use skeletons for loading, shaped like the content they replace.
- **Do** write empty states that teach what would fill them.
- **Do** render a missing value as a missing value. A null cost is a dash, never `$0`,
  and it sorts last rather than as zero.

### Don't:

- **Don't** put a tiny uppercase letter-spaced eyebrow above a section. This is the
  prohibition with the most existing violations in this codebase; they get removed, not
  preserved.
- **Don't** use `border-left` or `border-right` above 1px as a colored accent stripe.
  Prohibited on cards, list items, callouts, and alerts without exception.
- **Don't** nest a card inside a card. Compose flat sections separated by
  `border-soft` rules instead.
- **Don't** add a shadow, gradient, glass blur, or lift transform anywhere.
- **Don't** look like **the GAIA marketing site**: no Fraunces, no `font-display`, no
  editorial hero pacing on a data surface.
- **Don't** look like a **generic admin template**: no Inter, no blue accents, no
  `gray-*` utilities, no invented semantic aliases like `bg-body`.
- **Don't** look like an **observability chart-wall**: no uniform grid of same-sized
  panels. Every surface states which answer is the primary one.
- **Don't** fill a card or a resting surface with a saturated hue, and never color an
  inactive or disabled state.
- **Don't** write a hex literal in a component. Tokens only, opacity modifiers allowed
  (`bg-accent/15`).
- **Don't** introduce a light theme, a `dark:` variant, or a theme toggle. There is one
  surface.
- **Don't** show bucket-level token vocabulary (fresh input, cache write, cache read)
  anywhere in the UI. Users asked for dollars, elapsed time, and total tokens.
- **Don't** reinvent a standard control. Native `<select>`, native `<button>`, real
  links, real focus order.
- **Don't** load a webfont. The dashboard must render correctly with the network off.
