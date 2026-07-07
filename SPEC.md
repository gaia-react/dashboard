# GAIA Dashboard, v1 Specification

Companion to `OVERVIEW.md` (product brief, tech stack, data-source rationale). This document is the input to the implementation-planning session: it fixes requirements, data contracts, feature scope, and design constraints, and lists the decisions deliberately left to planning.

GAIA's cost tracking is unreleased and exists to feed this dashboard. The authoritative producer documentation lives in the GAIA repo: `wiki/concepts/Cost Data Contract.md` (full cost.jsonl schema, reader rules, archived shapes) and `wiki/concepts/Token Cost Readout.md` (pricing surfaces, committed rate table); `.gaia/scripts/token-tally.sh` is the source of truth when docs and script disagree. Everything in "Data contracts" below was verified against those pages and real files in the reference project (`../gaia`) on 2026-07-05, then reconciled against GAIA SPEC-024 (see §11), which accepted all five of this spec's upstream asks. This document describes the post-SPEC-024 contract; SPEC-024 merging in the GAIA repo is a build prerequisite (§9).

---

## 1. Purpose and scope

Visualize what a single GAIA project's specs and plans actually cost, plus the project's overall Claude Code activity, from two read-only local data sources. One project per dashboard instance: the project the dashboard is pointed at (eventually the cwd of `npx gaia-dashboard`).

**v1 delivers:** data-access layer, parsers, reconciliation, and a single-page dashboard with the sections in §6.

**v1 non-goals** (explicitly out, do not design for them beyond noted compatibility):

- Writing or mutating any data. The dashboard never writes outside its own repo.
- Multi-project aggregation or project switching in the UI.
- The `npx gaia-dashboard` packaging itself (the end goal; v1 runs via `pnpm dev`). The server design must not preclude it: see §3.
- Live tailing / file watching. Manual refresh (reload or a refresh button) is enough.
- Authentication, remote access, telemetry of our own. Localhost only.
- Storybook / Playwright (not adopted; lint bundles already exclude them).
- Historical Claude Code pricing accuracy for unattributed sessions (see §5.4).

## 2. Users and jobs

| User            | Job                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| GAIA adopter    | "What did this spec/plan cost me, in dollars and time? Is spec cost trending up?"                                |
| GAIA maintainer | "Which models are doing the work? When is work happening? How much activity is ad hoc vs. spec/plan-attributed?" |

Both run the dashboard locally against a project they have on disk. There is no anonymous/public audience in v1.

## 3. Architecture

A browser SPA cannot read `~/.claude` or `.gaia/local` from the filesystem. v1 therefore has two halves:

1. **Client:** the Vite + React 19 SPA in `app/`, per the existing scaffold.
2. **Data layer:** a local HTTP JSON API that discovers, parses, validates, and aggregates the files server-side, exposed in dev as Vite dev-server middleware (a Vite plugin registering routes under `/api/*`). Node 22+, no extra server framework unless planning finds middleware insufficient.

Rationale for server-side aggregation rather than shipping raw files to the browser: the reference project has 393 top-level session files totaling ~660 MB including subagent transcripts. Raw transfer and in-browser parsing are non-starters. The server streams JSONL line-by-line, keeps only aggregates, and caches per-file results keyed by (path, mtime, size) so refreshes only re-parse changed files.

**npx compatibility constraint:** keep the API handlers as plain framework-agnostic functions (request in, typed JSON out) so a later thin Node HTTP server can mount the same handlers next to the static `vite build` output. Do not couple parsing/aggregation code to Vite APIs.

**Configuration** (env vars, all optional):

- `GAIA_DASHBOARD_PROJECT`: absolute or repo-relative path to the target GAIA project root. Dev default: `../gaia` (the read-only reference project). The npx path will later default this to `process.cwd()`.
- `CLAUDE_CONFIG_DIR`: Claude Code home. Default `~/.claude` (same variable Claude Code itself honors).

**Read-only guarantee:** the data layer opens all target-project and `~/.claude` files with read-only intent, never creates/renames/deletes anything under either root. `../gaia` must never be modified (standing project rule). Tests never touch `../gaia` at all; they run on fixtures (§8).

**Zod 4** validates at the data-layer boundary: every parsed record passes through a schema before aggregation. Unknown fields pass through (`.loose()` / passthrough semantics); unknown enum-ish values (a new `kind`, a new ledger `status`) must not crash parsing, they degrade to "unknown" and are surfaced in a parse-health report (§6.8).

## 4. Data contracts (observed)

### 4.1 `.gaia/local/telemetry/cost.jsonl` (source of truth for attributed cost)

Append-only JSONL. One line per cost snapshot. Observed record (abridged):

```json
{
  "schema_version": 1,
  "kind": "execute",
  "spec_id": "SPEC-023",
  "plan_id": null,
  "plan_slug": "plan",
  "session_id": "3158fe6d-4480-42d3-8e70-1c4ecbfc2057",
  "buckets": {
    "fresh_input": 60546,
    "cache_write": 854188,
    "cache_read": 13369755,
    "output": 57898
  },
  "total": 14342387,
  "by_model": {
    "claude-opus-4-8": {
      "fresh_input": 60546,
      "cache_write_5m": 699577,
      "cache_write_1h": 154611,
      "cache_read": 13369755,
      "output": 57898
    }
  },
  "by_agent_type": {"main": {"...": "same shape as by_model values"}},
  "dollars": 14.35352375,
  "rate_table_id": "sha256:6d17ab141d05c333",
  "partial": false,
  "started_at": "2026-07-04T16:01:52.562Z",
  "ended_at": "2026-07-04T16:30:07.031Z",
  "duration_seconds": 1695,
  "duration_available": true,
  "session_cwd": "/Users/you/projects/my-app/.claude/worktrees/spec-023-cost-artifacts",
  "git_branch": "spec-023-cost-artifacts",
  "project": "sha256:e8a9fc325f102fc0",
  "seq": 0,
  "final": false,
  "ts": "2026-07-04T16:30:16Z"
}
```

**Critical semantics (per the Cost Data Contract page, cross-checked against the file):**

- **Execute snapshots are cumulative, not deltas.** An execute action appends one cumulative row per commit; rows sharing a `session_id` have increasing `seq` and monotonically growing buckets. Never sum rows. Reader rule: take the `final: true` row per (attribution key, `kind`, `session_id`) group, falling back to the max-`seq` row when none is marked final (the append-time rewrite that flips prior rows' `final` to false is best-effort and can fail open). `spec` and `plan` kinds write one row per session with `seq: 0`.
- **`kind` enum: `"spec" | "plan" | "execute"`.** All three phases emit ledger rows; only `execute` appears in the reference file because the tally shipped mid-SPEC-023. Parser still accepts any string (additive evolution rule below); UI labels known kinds and shows others verbatim.
- **Attribution key:** `spec_id` and `plan_id` are never both set (spec identity wins a tiebreak upstream). Both null is a legal degraded row: bucket it as "unattributed telemetry", never drop it, with one exception: a both-null **backfill** row with a non-null `plan_slug` is a pre-ledger archived plan, grouped and titled by that slug (§6.3). Outside that case, `plan_slug` is display-only, never a key.
- **`session_cwd`** (`string | null`, SPEC-024): the tally's live working directory. Forward-encode it with Claude Code's `/` and `.` to `-` transform to name the exact `~/.claude/projects` transcript directory, no reverse-decode heuristic (§4.4). Present (value or null) on all new rows including degraded and worktree paths; **absent** on pre-SPEC-024 rows and backfill rows, where the directory-scan heuristic still applies.
- **Backfill rows** (`source: "backfill"`, SPEC-024): one row per vintage archived cost.md phase section, kind mapped from the section heading (`## SPEC` → `spec`, `## Planning` → `plan`, `## Execution` → `execute`; `## Total` never emits a row). Each carries the section's four buckets, plus `session_id`, `ts` (from the section's UTC generated stamp), `duration_seconds` (parsed from the human duration token), and recorded `dollars`, each only where the source actually had it; `started_at`/`ended_at` are always null; no `by_model`/`by_agent_type`, no `session_cwd`. The backfill is idempotent per (attribution key, kind, session_id), and native rows win over backfill rows for the same group.
- **Totals across sessions:** a spec/plan may span multiple sessions and kinds. Spec-level total = sum over (kind, session_id) groups of each group's terminal row.
- **`by_model` / `by_agent_type` are omitted entirely when attribution fails** (never `{}`); a missing `by_model` means "predates per-model attribution", and `dollars` is null on that path. `by_agent_type` keys: `main`, sub-agent `agentType` values (e.g. `general-purpose`), `auto-compaction`, `unknown`. Contractual invariant, worth a fixture test: collapsing each entry's `cache_write_5m + cache_write_1h` and summing across `by_agent_type` reproduces `buckets`/`total` exactly.
- `dollars` is GAIA-priced at tally time from `by_model` against the committed rate table identified by `rate_table_id` (§5.4); recorded dollars are authoritative wherever present.
- `partial: true` means: session id was empty, the main transcript matched no file, or a matched file failed to parse. Badge it, do not exclude the record. `duration_available` is independent of `partial`.
- **Schema evolution is additive-only** without a `schema_version` bump; breaking changes bump the version. Zod schemas therefore pass unknown fields through and hard-fail only on a `schema_version` we do not support.
- History: after SPEC-024's one-off backfill, every archived cost.md phase section in the reference project is represented as a ledger row, making cost.jsonl the single attributed-cost source (§4.3). A feature with no archived cost.md at all (e.g. SPEC-003) has no cost from any source; that is a real gap, rendered as "no data".

### 4.2 `.gaia/local/{specs,plans}/ledger.json` (titles, status, chronology)

```json
// specs/ledger.json
{"version": 1, "specs": [{"id": "SPEC-001", "allocated_at": "2026-05-05T23:25:51Z", "source": "backfilled", "status": "merged", "intent": "GAIA CI auto-maintenance system...", "merged_at": "2026-05-09T08:22:10Z"}]}
// plans/ledger.json (post-SPEC-024 shape)
{"version": 1, "plans": [{"id": "PLAN-001", "allocated_at": "2026-07-04T08:49:05Z", "source": "allocated", "status": "completed", "completed_at": "2026-07-04T10:12:00Z", "subject": "Reframe /gaia-plan worktree isolation prompt: ..."}]}
```

- Specs carry `intent` + `status` + optional `merged_at`. Plans carry `subject` plus (SPEC-024) a lifecycle: `status` (canonical vocabulary `allocated | completed | abandoned`; `abandoned` is reserved with no writer yet) and `completed_at` (null/absent until completed). The plan `status` field is distinct from the pre-existing `source` field even though both can read `"allocated"`: `source` is provenance, `status` is lifecycle.
- `intent`/`subject` are the display titles. Post-SPEC-024 they are the full first sentence or a word-boundary-safe bounded prefix ending in an ellipsis, and the previously truncated existing rows were repaired in place; still render defensively (the repair is best-effort by contract).
- Observed spec `source`: `allocated`, `backfilled`. Spec `status` passes through `draft`/`specified` before `merged`. Tolerate and render unknown values; gaps in the ID sequence are normal (SPEC-020 absent from `specs/archived/`).

### 4.3 `.gaia/local/{specs,plans}/**/cost.md` (not parsed)

OVERVIEW left "is cost.md parsing worth it" open. **Final answer: no. The dashboard does not parse cost.md.** The earlier draft of this spec scoped a lenient Markdown parser to vintage history; GAIA SPEC-024 (ask U4, accepted) instead backfills every archived cost.md phase section into cost.jsonl as `source: "backfill"` rows (§4.1), and since the cost feature is unreleased, `../gaia` was the only project in existence with vintage-only history. cost.md remains what it was designed to be: a human-readable rendering of data the ledger already carries.

If the build ever finds an archived phase that the backfill missed, that is an upstream data bug: surface it in parse health (§6.8) and report it to the GAIA repo; do not resurrect a Markdown parser for it.

### 4.4 Claude Code session logs (`$CLAUDE_CONFIG_DIR/projects/...`)

**Directory discovery.** Project dirs encode the session cwd with `/` and `.` replaced by `-` (e.g. `/Users/x/gaia` → `-Users-x-gaia`). The encoding is lossy, so prefix matching alone is unsafe (`-Users-x-gaia-other` prefix-matches `-Users-x-gaia`). Rule:

1. Candidate dirs: name equals `encode(projectRoot)` or starts with `encode(projectRoot) + "-"`.
2. Confirm each candidate by reading the first `cwd` field found in its jsonl lines and checking the decoded path is `projectRoot` or inside it.

This matters because GAIA runs spec/plan work in git worktrees: dirs like `-Users-x-gaia--claude-worktrees-spec-022-tokens-cost-line` hold much of the attributed session history (encoded from `<root>/.claude/worktrees/<branch>`). Excluding them would orphan most cost.jsonl/cost.md session references.

SPEC-024's `session_cwd` field (§4.1) makes attributed-session lookup a deterministic forward-encode for new rows: apply the `/` and `.` to `-` transform to `session_cwd` and the result names the transcript directory. The two-step heuristic above remains for pre-SPEC-024 rows, backfill rows (no `session_cwd`), and for discovering unattributed sessions, which by definition have no ledger row pointing at them.

**File layout per project dir:** top-level `<session-uuid>.jsonl` (main transcript) plus optional `<session-uuid>/subagents/agent-*.jsonl` (subagent transcripts, real cost, `isSidechain: true`) and `<session-uuid>/tool-results/` (ignore). Include subagent transcripts in all token aggregation, attributed to the parent session id (dir name).

**Line types observed** (one project, Claude Code 2.1.x): `assistant`, `user`, `system`, `attachment`, `mode`, `file-history-snapshot`, `last-prompt`, `ai-title`, `pr-link`. Older versions differ; the parser reads only what it needs and skips everything else:

- `assistant` lines: `timestamp` (ISO), `sessionId`, `cwd`, `gitBranch`, `version`, `isSidechain`, `requestId`, and `message` with `id`, `model`, `usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}` (plus `usage.cache_creation.ephemeral_{5m,1h}_input_tokens`).
- `ai-title` lines: `aiTitle`, the session display title (last one wins).
- `last-prompt` lines: `lastPrompt`, fallback display text when no title exists.

**Extraction rules:**

- Bucket mapping to GAIA's vocabulary: `fresh_input = input_tokens`, `cache_write = cache_creation_input_tokens`, `cache_read = cache_read_input_tokens`, `output = output_tokens`.
- **Dedupe before summing:** a single API message can appear on multiple lines (streaming/tool-use continuations sharing `message.id`). Count each distinct `message.id` once, taking the last-seen usage for that id. Both inspiration projects hit this; verify against real data during build (fixture with a duplicated id).
- Exclude `message.model == "<synthetic>"` (error placeholders) and lines without `usage`.
- Session-level derived fields: first/last assistant `timestamp` (span + duration), set of models, per-model bucket totals, turn count, `gitBranch`, title.

### 4.5 Scale and freshness facts (reference project, 2026-07-05)

393 top-level sessions / ~660 MB across the main dir + 5 worktree dirs; specs ledger SPEC-001..023 (20 archived); 1 plan in ledger + 5 pre-ledger plan folders; cost.jsonl: 7 lines, 1 spec; cost.md coverage partial. Budget parsing for this size: full cold scan target < 15 s on a laptop, warm refresh (mtime cache) < 1 s. If cold scan cannot hit that, aggregate lazily per dashboard section rather than blocking first paint.

## 5. Reconciliation model

The two datasets overlap but neither contains the other. The dashboard shows three tiers honestly:

1. **Attributed, native** (cost.jsonl rows without the backfill marker): spec/plan cost with dollars, per-model, per-agent-type, durations, and (new rows) `session_cwd`. Highest fidelity.
2. **Attributed, backfill** (cost.jsonl `source: "backfill"` rows): per-phase bucket totals, with `session_id` / `duration_seconds` / recorded dollars where the vintage source had them. No model or agent-type breakdown, no `session_cwd`.
3. **Unattributed activity** (session logs not referenced by tier 1 or 2): everything else, token-denominated (with estimated dollars per §5.4).

Rules:

- **Join key is `session_id`** → session log file of the same uuid, located via `session_cwd` forward-encoding where present, else the directory-scan heuristic (§4.4). A referenced session that has no log file (deleted/pruned) still counts in spec cost; badge it "log missing".
- **A session is "attributed"** if any tier-1 or tier-2 record references it. All other sessions are ad hoc.
- **Never sum dollars with token-derived estimates.** Recorded-dollar KPIs come only from `dollars` fields and say "recorded cost"; token KPIs cover everything. Native rows win over backfill rows for the same (attribution, kind, session) group (the backfill is idempotent, so a collision is an upstream bug: prefer native, note it in parse health).
- **Do not force overlap:** session-log activity that predates GAIA cost tracking is normal (activity heatmap goes back further than any spec cost). Empty-state copy must explain this, not look broken.
- Timestamps: store UTC, render in the viewer's local timezone.

### 5.4 Dollars for unattributed sessions (resolved: price them with GAIA's own rate table)

An earlier draft recommended token-only for ad hoc sessions to avoid the dashboard maintaining a pricing table. Moot: GAIA ships its rate table to every adopter as a **committed** file, `.gaia/scripts/token-rates.json` in the target project, with documented semantics (per-model per-MTok `input`/`output` rates; cache multipliers `read × 0.1`, `write_5m × 1.25`, `write_1h × 2.0` applied to the input rate; effective-dated intro-pricing windows selected by the session's run-time anchor, `effective_through` inclusive, final undated entry is the open-ended sticker rate).

The dashboard reads the target project's table and re-implements that arithmetic in TypeScript (in `app/data/`, fixture-tested) to price unattributed sessions from their per-model, TTL-split usage (§4.4 gives the 5m/1h split from `usage.cache_creation`). Rules:

- Every such figure is labeled **estimated**, visually distinct from recorded dollars, and the two never sum into one number (§5 rule 3 stands).
- Degrade exactly like GAIA's own readout, never fabricate: a `claude-*` model missing from the table makes the figure a named lower bound; non-`claude-` model keys are ignored silently; a missing/unparseable rate table disables estimates entirely while token figures still render.
- Pricing maintenance stays upstream where it already lives; the dashboard tracks the table's shape as a contract (ask U5, §11).

## 6. Feature spec (single page, sections top to bottom)

Every section defines its empty state; with a fresh GAIA project (no cost data, few sessions) the page must still look intentional.

### 6.1 Header

GAIA wordmark (`app/assets/gaia-logo.svg`), project name (basename of project root) and path, data-freshness line ("scanned N sessions · M specs · just now"), refresh button. Coverage disclosure when datasets diverge, e.g. "Cost tracking began 2026-07-03; activity history goes back to 2026-05-05."

### 6.2 KPI row

Recorded spend (sum of authoritative dollars, tiers 1+2), estimated ad hoc spend (§5.4, separate tile, "estimated" in the label, lower-bound marker when applicable), specs merged / total, plans, sessions, total tokens (with bucket split on hover/expand), active days. Each KPI states its basis (recorded vs. estimated vs. all-activity) via its label or sublabel, per §5 rule 3.

### 6.3 Specs & plans cost table (the centerpiece)

One row per ledger entry, plus one row per distinct `plan_slug` among slug-attributed backfill rows (the pre-ledger archived plans, titled by slug). Chronological by `allocated_at`; slug-only rows sort by their earliest backfill `ts`. Columns: id (or slug), title (intent/subject), status (specs: draft/specified/merged etc.; plans: allocated/completed/abandoned; slug rows: none), total tokens, output tokens, recorded $, elapsed (summed phase durations), source badge (`native` / `backfill` / `none`), partial badge when applicable. Missing cost renders as an em-free "no data" dash with the gap explained once above the table, not per-cell noise.

Expandable row detail: per-phase table (spec/planning/execution buckets, duration, $); for native rows, per-model and per-agent-type breakdowns (backfill rows have none, by design); linked sessions (title, date, duration, jump-link to §6.6 entry; "log missing" badge where applicable).

### 6.4 Activity heatmap

GitHub-style calendar, full session-log history, one cell per local-tz day. Metric: output tokens (primary interest: model work performed); tooltip shows all buckets + session count. Color ramp: transparent → `--color-accent` (single-hue ramp per dataviz guidance). Weeks columns, months labeled, legend with the bucket thresholds.

### 6.5 Model mix

Totals per model (horizontal bars, output tokens, with bucket detail on hover) and a stacked by-week output-tokens time series per model. Series colors from the brand chart palette (§7). Include subagent traffic; exclude `<synthetic>`.

### 6.6 Sessions list

Reverse-chronological, virtualized or paginated (hundreds of rows). Per session: title (`ai-title`, fallback `lastPrompt` truncated, fallback uuid), start date/time, duration, models, output + total tokens, estimated $ (§5.4; recorded $ instead where the session is priced by cost.jsonl), branch, attribution badge (SPEC-nnn / PLAN-nnn / ad hoc; badge links to the spec row). Filters: attribution (all/attributed/ad hoc), model. This is where "attributed vs. ad hoc" becomes tangible.

### 6.7 Cost-per-spec trend

Chronological bar chart, one bar per spec/plan with any cost data: recorded $ where priced, otherwise total tokens on a secondary token-denominated encoding, visually distinguished (never both on one $-axis). Answers "are specs getting more or less expensive."

### 6.8 Parse health (footer, collapsed)

Counts of skipped/unparseable lines and files per source, unknown `kind`/`status` values encountered, cost.md files that yielded nothing. Keeps data problems diagnosable without polluting the dashboard proper.

## 7. Design constraints

- **Dark-only in v1.** The GAIA tokens in `app/styles/tailwind.css` are a dark surface; DESIGN.md defines no light palette. Consequence: the scaffold-era guidance in `.claude/rules/tailwind.md` (light/dark pairing, `bg-body`-style semantic utilities) is stale for this repo; update that rule as part of the build so future agents don't reintroduce template-baseline utilities.
- Follow `../studio/branding/DESIGN.md` throughout: Fraunces 300 headings, system sans body, mono uppercase eyebrows for section labels; hand-coded stroke icons (1.5px, round caps); no Inter, no purple, no cool grays, no dedicated success green, no hex literals in components (tokens only); focus rings per spec; honor `prefers-reduced-motion`.
- **Chart palette** (derived from tokens, in series order): `--color-accent`, `--color-secondary`, `--color-warn`, then `--color-accent-soft`, `--color-secondary-soft`, `--color-warn-soft`; neutrals (`--color-fg-mute`, `--color-border`) for axes/grids. Single-metric encodings (heatmap, one-series bars) stay on the accent ramp. More than ~6 concurrent series means the chart is overloaded: group the tail into "other".
- Layout: wide-breakout container (~72rem) for data-dense sections, DESIGN.md paddings/gaps, `md:` single-column collapse.
- Read the `dataviz` skill before building any chart; charts must be theme-consistent SVG, tooltips and axes styled with the same tokens.

## 8. Engineering constraints

- Stack as scaffolded: Vite 8, React 19, TS 6, Tailwind 4 (`@theme` in `app/styles/tailwind.css`), Zod 4, `@gaia-react/lint` (existing bundle set), source under `app/`, `~/` alias.
- **Visualization library: decided during planning**, against the needs above (calendar heatmap, stacked bars, horizontal bars; SVG; token-based theming; modest bundle). Candidates to evaluate: hand-rolled SVG (heatmap is trivial by hand; per DESIGN.md's hand-coded ethos), Recharts, visx. A calendar heatmap is not native to most libs; assume it is hand-rolled regardless.
- File conventions per `.claude/rules/coding-guidelines.md` (PascalCase component folders with `index.tsx` + `tests/`, camelCase hooks, kebab-case elsewhere, ~400-line ceiling). Suggested top-level shape (planning may refine): `app/data/` shared parsing/aggregation + Zod schemas (framework-agnostic, npx-reusable), `server/` the Vite middleware plugin wiring, `app/components/` UI, `app/hooks/` client data fetching.
- TDD (project rule): parsers, reconciliation, and pricing are the high-value test surface. Fixtures are small, sanitized, committed files: hand-trimmed cost.jsonl with cumulative seq snapshots, a `final: true`/fallback pair, rows with and without `session_cwd`, and backfill rows (spec-attributed and slug-attributed variants, with/without dollars and duration); ledger samples in the post-SPEC-024 shape (plan `status`/`completed_at`) and the old shape (tolerance); session jsonl slices with duplicate `message.id`, a `<synthetic>` line, a sidechain file; and a token-rates.json with an intro-window + sticker-rate model. Test the contract's `by_agent_type` equality invariant (§4.1), the rate-window selection edge (inclusive `effective_through`), and the `session_cwd` forward-encode. Never read `../gaia` or the real `~/.claude` in tests.
- Quality gate before any "done": `pnpm typecheck && pnpm lint && pnpm test:ci`.
- No absolute machine paths anywhere in the repo (`.claude/rules/repo-relative-paths.md`); the `../gaia` default is expressed relative to the repo root.

## 9. Acceptance criteria (v1 done means)

Prerequisite: GAIA SPEC-024 merged in `../gaia`. **Satisfied and verified 2026-07-05** against the live reference data: backfill rows present across all three kinds (12 of 23 ledger rows, including slug-attributed pre-ledger plans), SPEC-023's native execute rows untouched with its spec phase backfilled and a `final: true` terminal row, repaired ledger titles (full sentence or word-safe prefix with ellipsis), PLAN-001 at `status: completed` with `completed_at`, and `session_cwd` present on post-merge native rows only.

1. `GAIA_DASHBOARD_PROJECT=../gaia pnpm dev` (or the defaulted equivalent) renders all §6 sections against the live reference project, with the SPEC-023 row showing native dollars/model/agent breakdowns and historical specs/plans showing backfill-sourced phase totals (including the slug-titled pre-ledger plans).
2. Attributed vs. ad hoc session counts are visible and consistent between KPI row, sessions list, and spec detail links.
3. Worktree-dir sessions are included: attributed session ids resolve to transcript files via `session_cwd` where present and the directory-scan heuristic otherwise.
4. A GAIA project with zero `.gaia/local` cost data still renders: activity heatmap, model mix, sessions list populated; cost sections show intentional empty states.
5. Nothing under the target project or `$CLAUDE_CONFIG_DIR` is created, modified, or deleted by running the dashboard (verify: `git status` clean in `../gaia`, no new files in `~/.claude`).
6. Cold scan of the reference project under ~15 s, warm refresh under ~1 s, no UI freeze during scan.
7. Quality gate clean; parsers, reconciliation, and pricing covered by fixture-driven Vitest suites.
8. Estimated-dollar math agrees with GAIA's own `token-rollup.sh` output for one shared fixture input (one-time manual parity check during build, not CI).

## 10. Open questions for the planning session

1. **Visualization library** (§8): pick after sketching the four chart types.
2. **API endpoint granularity** (§3): one `/api/summary` blob vs. per-section endpoints; decide with the lazy-aggregation question in §4.5.
3. **Refresh UX**: reload-only vs. refresh button invalidating the server cache (spec assumes the button; cut if it drags).
   (Resolved since the first draft: the SPEC-024 merge check, verified 2026-07-05 (§9); `partial`/`plan_slug` semantics, `kind` coverage, and the `final`-flag reader rule via the upstream contract docs; the §5.4 pricing question via the committed rate table; the cost.md and pre-ledger-plan-folder questions via SPEC-024's backfill.)

## 11. Upstream change requests: status (accepted as GAIA SPEC-024)

This section originally listed five requests to the GAIA producer side. All five were accepted in **GAIA SPEC-024, "Cost-Contract Amendments for the GAIA Dashboard"** (`../gaia/.gaia/local/specs/SPEC-024/SPEC.md`, immutable, with adversarial audit; execution in progress as of 2026-07-05). Everything below is folded into §4-§6 above; this section records the landed shape and the deltas from what was asked, for traceability.

| Ask                    | Outcome             | Landed shape                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 session locator     | Accepted            | `session_cwd` (string or null) on every new cost.jsonl record, captured from the tally's live working directory; reader forward-encodes it to the transcript directory. Absent on pre-SPEC-024 and backfill rows (heuristic retained for those).                                                                                                                                                                                            |
| U2 untruncated titles  | Accepted + extended | Go-forward stamping uses full-first-sentence / word-safe bounded prefix with ellipsis, and a one-off repair fixes the existing broken rows in place (re-derived from SPEC.md / SUMMARY.md sources).                                                                                                                                                                                                                                         |
| U3 plan lifecycle      | Accepted            | `status` (`allocated \| completed \| abandoned`) + `completed_at` on PLAN-NNN rows, written through a guarded chokepoint; archival stamps `completed`; PLAN-001 repaired. `abandoned` is vocabulary-only for now (no writer). Pre-ledger slug folders get no status.                                                                                                                                                                        |
| U4 vintage backfill    | Accepted + extended | One `source: "backfill"` row per archived cost.md phase section, idempotent per (attribution, kind, session). Richer than asked: also carries `duration_seconds` and recorded `dollars` where the vintage source had them; `started_at`/`ended_at` stay null. Slug-named folders backfill as `plan_id` null + `plan_slug` = folder slug. Consequence: the dashboard ships **no cost.md parser** (§4.3).                                     |
| U5 rate-table contract | Accepted, relocated | Documented as a public read contract on one authoritative wiki page (Token Cost Readout, which already owned the rate-table section) with Cost Data Contract cross-linking, rather than duplicated onto the contract page as literally requested. Covers shape, multipliers, inclusive `effective_through` at day granularity, and the `rate_table_id` recipe (sha256 of the committed file's raw bytes, first 16 hex, `sha256:`-prefixed). |

Consumer-visible consequences already reflected above: no cost.md parsing (§4.3), backfill-row semantics and `session_cwd` (§4.1), tier definitions (§5), repaired titles and plan lifecycle (§4.2), table sourcing and badges (§6.3), and the SPEC-024 merge prerequisite (§9).
