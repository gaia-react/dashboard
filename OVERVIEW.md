# GAIA Dashboard: Overview

A local-first dashboard for GAIA adopters and maintainers to visualize the work they've done on a GAIA project: what specs/plans cost, which models ran, when work happened, and how it trends over time.

Inspired by [ocodista/claude-usage](https://github.com/ocodista/claude-usage) and [phuryn/claude-usage](https://github.com/phuryn/claude-usage), which both parse `~/.claude` session logs into token/cost dashboards. GAIA Dashboard borrows their data-visualization ideas but narrows the focus to a single GAIA project: what did _this_ project's specs and plans actually cost, not just raw Claude Code usage.

## End goal

Zero-install launch from inside any GAIA project:

```
npx gaia-dashboard
```

During development we run it locally (`pnpm dev`) instead of through the npx path.

## Data sources

Two kinds of local data, read-only, never written to:

1. **GAIA's own cost tracking** (the project being visualized), under `.gaia/local/`:
   - `telemetry/cost.jsonl`: append-only ledger, one line per cost snapshot, keyed by `spec_id`/`plan_id`, with token buckets (`fresh_input`, `cache_write`, `cache_read`, `output`), per-model and per-agent-type breakdowns, `dollars`, and timing. Treat this as the source of truth.
   - `plans/**/*/cost.md` and `specs/**/*/cost.md`: human-readable per-plan/per-spec rollups (planning vs. execution phases, elapsed time, cost) rendered from the same underlying data. The dashboard does not parse these; GAIA SPEC-024 backfilled the vintage cost.md history into `cost.jsonl`, which is the single machine-readable source (see `SPEC.md` §4.3).
   - `plans/ledger.json` / `specs/ledger.json`: the allocation ledger (id, intent, allocated/merged timestamps, status). Useful for joining cost data back to human-readable spec/plan titles and outcomes.

   Cost tracking on the GAIA side is new, so history is shallow; expect gaps. Tool usage tracking will expand beyond specs/plans over time; today specs and plans are all there is.

2. **Claude Code's own session logs**, under `~/.claude/projects/<encoded-project-path>/*.jsonl`: one line per turn, `assistant`-type lines carry `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) and `message.model`. This is the same data the two inspiration projects read. It gives full session/model/activity history for the launching project even where GAIA-side spec/plan cost data doesn't (yet) exist.

**Reconciliation is the hard part.** A GAIA project will have Claude Code session history going back further than its `.gaia/local` cost data, and not every session maps to a spec or plan (ad hoc sessions, one-off plans, exploration). The dashboard needs to gracefully show both "attributed" work (tied to a spec/plan) and general session/model activity, without pretending the two datasets fully overlap.

## Design direction

The dashboard now carries its own design documents at the repo root, written during the
v2 redesign (Phase 8) and governed by the `impeccable` skill:

- **`PRODUCT.md`**: register (product), users, purpose, brand personality, anti-references, design principles, accessibility bar (WCAG 2.2 AA, keyboard-complete).
- **`DESIGN.md`**: the dashboard's visual system. Distinct from `../studio/branding/DESIGN.md`, which it inherits.

Baseline:

- GAIA wordmark: `app/assets/gaia-logo.svg`.
- Color palette and design tokens: `../studio/branding/DESIGN.md` (burnt orange primary, slate teal secondary, amber semantic, dark neutral surfaces). Mirror those tokens into `app/styles/tailwind.css` rather than forking values.
- Not a copy of either inspiration project's look: borrow their feature ideas (activity heatmaps, cost breakdowns, model usage, timelines), not their visual design.
- This is a GAIA-branded product surface, not the neutral-gray template baseline used by fresh GAIA app scaffolds.

### Sanctioned deviations from the studio brand document

Three, all at the product owner's direct request and all recorded in `DESIGN.md`:

1. **System sans instead of Fraunces.** `--font-display` is removed and no webfont is loaded. Rationale: this is a numbers dashboard read inside a task, and a display serif in UI labels is a product-register anti-pattern. It also removes a Google Fonts fetch that fails offline, which matters because the end goal is `npx gaia-dashboard` in any project. Larger type throughout (a semantic `--text-*` scale) came with the same change.
2. **`react-icons` (Lucide set) instead of hand-coded SVG.** Lucide is stroke-based, 1.5px, round-capped, which is the style the studio document already describes, so this is a sourcing change rather than a visual one. All icons pass through `app/components/Icon`, the single import surface.
3. **Two added hues, `info` (muted blue) and `moss`.** The Work tab encodes nine event types as a categorical scale, and three hues cannot carry nine categories. Both are **categorical only**; `moss` is never a success state, so the no-success-green rule still holds. Whether these should be promoted into the shared studio palette is an open question for that repo, which this project never edits.

## Tech stack

- Vite + React 19 + TypeScript, source in `app/` (not `src/`, not a React Router project; this is a plain SPA).
- Tailwind 4 (`@tailwindcss/vite`, `@theme`/`@utility` in CSS, no `tailwind.config.ts`).
- Zod 4 for parsing/validating the JSONL data.
- `@gaia-react/lint` for ESLint, customized: only the bundles that apply to a router-less Vite SPA (`base`, `react`, `styleHygiene`, `guardrails`, `betterTailwind`, `prettier`, `testing`); no `storybook`/`playwright` bundles until those tools are actually adopted.
- Visualization library: **none.** Charts are a hand-rolled SVG kit in `app/components/Charts/`, presentational components with their geometry in pure sibling modules. Recharts and visx were evaluated and rejected; the v2 redesign extends the kit rather than replacing it.
- Icons: `react-icons` (Lucide set), imported only through `app/components/Icon`.

## Read-only test project

`../gaia` (the GAIA product repo itself) is the reference project for reading real `.gaia/local` and `~/.claude` data during development. **Never edit anything under `../gaia`**; dashboard code only reads from it.

## Status

Project foundation (package.json, Vite/TS/Tailwind/lint scaffold, stub page) is in place. Data parsing, reconciliation, and the actual dashboard UI are not yet built. Requirements, data contracts, and feature scope are specified in `SPEC.md`; sequencing belongs to the implementation plan (not yet written).
