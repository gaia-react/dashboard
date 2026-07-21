# Product

## Register

product

## Users

Two people, both running the dashboard locally against a GAIA project they already
have on disk. There is no anonymous or public audience.

- **The GAIA adopter.** Has been running specs and plans on their own repo and wants
  to know what that actually cost. Opens the dashboard occasionally, usually right
  after finishing a piece of work or when a bill looks larger than expected. Their
  job: _"What did this spec cost me, in dollars and time? Is spec cost trending up?"_
- **The GAIA maintainer.** Reads it habitually while building GAIA itself. Their job:
  _"Which models are doing the work? When is work happening? How much of this is ad
  hoc versus attributed to a spec or plan? Which GAIA commands are earning their
  keep?"_

Both are technical, both are looking at their own data, and both are in a diagnostic
frame rather than a browsing one: they arrive with a question, and the dashboard's
job is to answer it and get out of the way. Nobody is being sold anything here.

## Product Purpose

A local-first, read-only dashboard that visualizes the work done on a single GAIA
project: every GAIA event (spec, plan, debt, audit, fitness, forensics, harden, wiki,
ad-hoc review) with what it cost in dollars, how long it took, and how many tokens it
burned, joined against the project's overall Claude Code session activity.

It reads two local sources and writes to neither: GAIA's own `.gaia/local` cost ledger
and Claude Code's `~/.claude` session logs. The end goal is `npx gaia-dashboard` from
inside any GAIA project, which makes offline correctness a product requirement rather
than a nicety.

Success looks like: a user opens it, finds the event they were thinking about within a
few seconds, understands what it cost without reading a manual, and trusts the number.
Failure looks like a wall of numbers that all seem equally important, or a figure the
user cannot tell is recorded versus estimated.

## Brand Personality

**Precise, calm, unfussy.** An instrument panel, not a product tour.

- **Precise.** Every figure states its basis. Recorded dollars and estimated dollars
  never share a label. A missing value renders as a missing value, never as zero.
- **Calm.** Restraint is the personality. Color is a data encoding, not decoration;
  motion conveys state, not delight. Nothing pulses, nothing celebrates.
- **Unfussy.** The tool disappears into the task. Standard affordances, no invented
  controls, no ceremony between the user and the number they came for.

Voice in the UI: plain sentence case, direct, no marketing register. Labels say what
the thing is (`Recorded, all GAIA events`), not how it feels. Empty states teach what
would fill them.

This is GAIA's own product surface, so it carries GAIA's colors and wordmark, but it
speaks in the product register, not the studio's editorial one.

## Anti-references

- **The GAIA marketing site.** Fraunces display headings, editorial hero composition,
  brand-first pacing. That register sells GAIA; this one operates it. The v2 redesign
  makes the split explicit by dropping `--font-display` entirely.
- **Generic admin templates.** Inter, blue accents, `gray-800` cards, shadcn defaults,
  the neutral scaffold baseline. If it looks like it could be any SaaS admin panel, the
  identity has leaked out.
- **Observability chart-walls.** Grafana / Datadog: a uniform grid of same-sized panels
  where everything is equally important, so nothing is. Every surface here has one
  primary answer and a hierarchy that says so.

**Positive reference, with a caveat:** `../dashboard-feedback/flat-design.jpg` is the
flatness and scale reference (full-bleed surfaces, no depth chrome, numbers large
enough to read across a desk). Its palette and its chunky pastel card costume are not
adopted; GAIA's restrained dark palette governs.

## Design Principles

1. **Recorded truth over inferred confidence.** Show what the data records, mark what
   is estimated, and leave blank what is unknown. Never derive a status the source
   cannot verify; never let a null sort or render as a zero. A gap is information.
2. **The number is the interface.** Dollars, elapsed time, total tokens. Those three
   answer the user's question; everything else on screen exists to locate, qualify, or
   compare them. Granularity that no user asked for is noise, and noise is removed at
   the contract, not hidden in the CSS.
3. **Earned familiarity.** Users are fluent in Linear, Stripe, and their terminal. Use
   the affordance they already know: native selects, real buttons, real links, real
   focus order. Strangeness without purpose is the failure mode, not plainness.
4. **Color carries data, never decoration.** The event palette is a categorical
   encoding: warm hues for Work, cool for Maintenance. Every color-coded thing also
   carries an icon and a text label, so meaning survives color blindness, greyscale,
   and a screenshot.
5. **Local, offline, read-only.** No network at runtime, no webfonts, no telemetry, and
   never a write outside this repo. The dashboard is a guest in someone else's project
   and behaves like one.

## Accessibility & Inclusion

**Target: WCAG 2.2 AA, keyboard-complete.**

- All text meets AA contrast against its surface (4.5:1 body, 3:1 large). New palette
  hues are contrast-verified against `--color-bg` before they are committed, not after.
- Every interactive surface is fully operable from the keyboard: tab reaches filters
  and sorts, arrow keys move within the event list, `Home`/`End` jump to the ends, and
  focus is always visible.
- Color is never the sole carrier of meaning. Event type is icon plus label plus tone;
  status is text.
- `prefers-reduced-motion` is honored by every transition. Transitions stay in the
  150-250ms band so they never gate the task.
- Dark-only surface by design (single theme, no light pairing). Numerals use
  `tabular-nums` so columns of figures stay scannable.
