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
  `dark:` variant. There is one theme; style it directly.
- **Do not** use neutral-gray template utilities (`bg-gray-*`, `text-gray-*`,
  `border-gray-*`) or invent semantic aliases like `bg-body` / `text-secondary`.
  Those belong to the fresh-scaffold baseline, not this GAIA product surface.

## Use the GAIA tokens

Reference the `@theme` tokens from `app/styles/tailwind.css` (backed by
`DESIGN.md`). No hex literals in components, ever, tokens only.

| Role                         | Tokens                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces                     | `bg-bg`, `bg-bg-elev` (cards), `bg-bg-elev-2` (table headers), `bg-bg-tint` (slate-tinted / alt rows)                                                               |
| Text                         | `text-fg` (primary), `text-fg-dim` (secondary), `text-fg-mute` (captions, table dashes)                                                                             |
| Primary brand (burnt orange) | `text-accent` / `bg-accent`, `accent-2` (hover), `accent-soft` (eyebrows on warm sections)                                                                          |
| Secondary (slate teal)       | `secondary`, `secondary-2` (borders/hover), `secondary-soft` (eyebrows on cool sections). Plays the "yes / checkmark / confidence" role, there is no success green. |
| Semantic (amber)             | `warn`, `warn-2` (borders), `warn-soft` (titles). Partial states, "coming soon", warnings.                                                                          |
| Borders                      | `border-border` (primary), `border-border-soft` (inner rules, subtle dividers)                                                                                      |

Chart palette in series order (SPEC section 7): `accent`, `secondary`, `warn`,
then `accent-soft`, `secondary-soft`, `warn-soft`; neutrals (`fg-mute`,
`border`) for axes and grids. Single-metric encodings (heatmap, one-series bars)
stay on the accent ramp. More than ~6 concurrent series means group the tail
into "other".

## No arbitrary colors

Palette tokens only, with opacity modifiers where needed (`bg-accent/15`). No hex
literals in `[]`. Follow `DESIGN.md`: no purple, no cool grays, no Inter, no
dedicated success green, no fourth coequal hue.

## Not covered here

Light-mode support, theme toggling, and semantic light/dark aliases are out of
scope for v1. If a light palette is ever added, define it in `DESIGN.md` first,
then propagate, per the design-system source-of-truth rule.
