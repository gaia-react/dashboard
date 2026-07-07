# GAIA Dashboard, v1 Implementation Plan

Companion to `SPEC.md` (requirements, data contracts) and `OVERVIEW.md` (product brief). This plan sequences the build, fixes the module layout and API shapes, and records the decisions SPEC §10 left to planning. Execution is orchestrated with Workflow-driven agent teams (§5 below); nothing here changes scope, SPEC §1 and §9 remain the contract.

---

## 1. Decision records (SPEC §10, settled)

### D1. Visualization: hand-rolled SVG chart kit, zero chart dependencies

Evaluated against SPEC §6's four chart types and §7's constraints:

| Chart                      | Marks needed                                                 |
| -------------------------- | ------------------------------------------------------------ |
| Activity heatmap (§6.4)    | Positioned rects on a week/day grid, month labels, legend    |
| Model mix totals (§6.5)    | Horizontal bars                                              |
| Model mix weekly (§6.5)    | Stacked vertical bars on a week band scale                   |
| Cost-per-spec trend (§6.7) | Vertical bars, two visually distinct encodings ($ vs tokens) |

Every mark is a rectangle plus text. No curves, no brushing, no zoom, no polar coordinates.

- **Recharts**: rejected. Its theming is prop-based with its own DOM structure for axes/tooltips, which fights the tokens-only rule (§7: no hex literals in components) and the DESIGN.md typography for axis labels. Bundle cost is real, and the calendar heatmap would be hand-rolled anyway.
- **visx**: closer fit (headless, modular), but for band + linear scales and rect marks it buys us ~100 lines of scale math at the price of 8-10 packages and their upgrade surface. We would still hand-compose every chart.
- **Hand-rolled**: the heatmap is hand-rolled regardless (SPEC §8), the remaining three charts are rect layout over two trivial scale helpers (linear, band). Full token theming for free, matches DESIGN.md's hand-coded ethos, zero bundle cost.

Verdict: a small internal chart kit in `app/components/Charts/`: `scale-helpers.ts` (linear + band), `date-helpers.ts` (local-tz week/month grid math via `Intl`), shared `ChartTooltip` and `ChartLegend` components, and the four chart components. Read the `dataviz` skill before building any of it (SPEC §7). Escape hatch: if a post-v1 chart ever needs curves or interaction physics, revisit visx; nothing in the kit's public props precludes swapping internals.

### D2. API granularity: two endpoints, split by cost of production

One `/api/summary` blob would block first paint on the cold session scan (~15 s budget, SPEC §4.5). Per-section endpoints (7+) would multiply handler surface without reducing work, since heatmap, model mix, sessions, and activity KPIs all derive from the same scan. The natural seam is data source cost:

- **`GET /api/costs`**: ledgers + cost.jsonl + rate-table status. A handful of small files, sub-100 ms always. Unblocks header, cost KPIs, cost table skeleton-to-content, and the trend chart immediately.
- **`GET /api/activity`**: the session-log scan and everything derived from it, including the attribution join (the server already holds the cost store; the join is server-side). Slow cold, < 1 s warm via the per-file cache.

This _is_ the §4.5 lazy-aggregation answer: cost sections paint at once, activity sections show skeletons (per the `skeleton-loaders` skill) until the scan lands. First paint is never blocked, and the 15 s cold budget only gates the activity sections. No further laziness needed at 393 sessions / ~660 MB; if a future project blows the budget, the fallback is splitting `sessions` out of `/api/activity` behind pagination, which the handler layout below permits without reshuffling.

### D3. Refresh UX: keep the button, no invalidation endpoint

The server cache is keyed by `(path, mtime, size)`, so a plain re-fetch of both endpoints _is_ a refresh: changed files re-parse, unchanged files hit cache. The refresh button therefore costs one client-side refetch hook and nothing server-side. Keep it. No `POST /api/refresh`, no cache-bust query param. (The `size` component of the key catches same-mtime rewrites; note in code that sub-second mtime granularity is the residual blind spot, acceptable for append-only logs.)

### D4. Timezone handling for day-bucketed aggregates

SPEC §6.4 requires one heatmap cell per _viewer-local_ day, but aggregation is server-side. Rule: the per-file cache stores hourly-UTC bucket totals (cheap: ~9k rows/year of numbers); handlers fold hours into local days per request using an IANA timezone passed by the client (`?tz=Asia/Tokyo`), defaulting to UTC. Cache entries stay timezone-independent. Known imprecision: 30/45-minute-offset zones misassign up to 45 minutes at day boundaries; accepted for v1.

### D5. Sessions list: paginated, no virtualization dependency

~400 rows today. Client-side pagination (50/page) with the §6.6 filters applied before paging. Simplicity first; `@tanstack/react-virtual` is the escape hatch if a real project makes pagination feel bad.

### D6. No new runtime dependencies

D1-D5 together mean v1 ships on the existing dependency set (React 19, Zod 4, tailwind-merge). Any agent that believes it needs a new package must stop and surface it rather than adding one.

---

## 2. Module layout

Per SPEC §8's suggested shape, refined. Conventions: PascalCase component folders with `index.tsx` + `tests/`, camelCase hooks, kebab-case elsewhere, ~400-line ceiling.

```
server/
  plugin.ts                  # Vite plugin: mounts handlers under /api/* on the dev server
  adapter.ts                 # Node req/res -> HandlerContext -> JSON (the only Vite/Node coupling)

app/data/                    # framework-agnostic, Node-side; client imports types only
  config.ts                  # env resolution: GAIA_DASHBOARD_PROJECT (default ../gaia), CLAUDE_CONFIG_DIR
  cache.ts                   # per-file memo keyed by (path, mtime, size)
  schemas/
    cost-record.ts           # Zod: cost.jsonl row (loose, schema_version gate, unknown-kind tolerant)
    ledgers.ts               # Zod: specs/plans ledger.json, old + post-SPEC-024 shapes
    session-lines.ts         # Zod: assistant / ai-title / last-prompt lines (loose)
    rate-table.ts            # Zod: token-rates.json
    api.ts                   # Zod + inferred TS types for CostsResponse / ActivityResponse
  parse/
    jsonl-stream.ts          # line-by-line streaming reader, per-line error capture
    cost-ledger.ts           # cost.jsonl: grouping, terminal-row rule, backfill semantics
    ledgers.ts               # ledger.json readers
    discover.ts              # cwd encode(), candidate-dir confirm, session_cwd forward-encode
    session-scan.ts          # transcript parse: message.id dedupe, sidechains, <synthetic> excl., hourly-UTC buckets
  pricing/
    rates.ts                 # window selection (inclusive effective_through), multipliers, estimate + degrade
  aggregate/
    cost-entries.ts          # ledger rows + slug groups -> CostEntry[] (tiers, phases, badges)
    activity.ts              # heatmap fold (tz), model mix, weekly stacks, activity KPIs
  reconcile/
    attribution.ts           # session_id join, attributed/ad hoc partition, "log missing"
    parse-health.ts          # skip/unknown counters, both sources
  handlers/
    costs.ts                 # pure: (ctx, query) -> CostsResponse
    activity.ts              # pure: (ctx, query) -> ActivityResponse

app/hooks/
  useApiResource.ts          # fetch + state machine (loading / error / data), refetch()
  useDashboardData.ts        # composes costs + activity + refresh

app/components/
  Charts/                    # kit: scale-helpers.ts, date-helpers.ts, ChartTooltip/, ChartLegend/,
                             #      CalendarHeatmap/, HorizontalBars/, StackedWeeklyBars/, TrendBars/
  Sections/                  # DashboardHeader/, KpiRow/, CostTable/, ActivityHeatmap/,
                             #      ModelMix/, SessionsList/, CostTrend/, ParseHealth/
  App/                       # page composition (exists; grows a section grid)

test/fixtures/               # committed, sanitized; per SPEC §8 fixture list (see phase tables)
```

`app/data/**` and `server/adapter.ts` respect the npx constraint (SPEC §3): handlers are `(ctx, query) => typed JSON` with zero Vite imports; only `server/plugin.ts` touches Vite, and a future thin Node server mounts the same handlers beside `vite build` output.

---

## 3. API design

Two GET endpoints, JSON, localhost-only (dev server). Errors: non-200 with `{error: {code: string, message: string}}`. All timestamps UTC ISO-8601; the client renders local time (SPEC §5).

### `GET /api/costs`

```ts
type Buckets = {
  freshInput: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
};

type CostsResponse = {
  project: {name: string; root: string; claudeConfigDir: string};
  rateTable: {status: 'ok' | 'missing' | 'unparseable'; id: string | null};
  coverage: {costSince: string | null}; // earliest cost row ts, for §6.1 disclosure
  kpis: {
    recordedDollars: number; // tiers 1+2 only (SPEC §5 rule 3)
    specs: {merged: number; total: number};
    plans: {total: number};
  };
  entries: CostEntry[]; // §6.3 rows, chronological
  parseHealth: ParseHealthSlice; // cost-side counters
};

type CostEntry = {
  key: string; // "SPEC-023" | "PLAN-001" | "slug:plan"
  entryType: 'spec' | 'plan' | 'plan-slug';
  id: string | null; // null for slug rows
  title: string; // intent / subject / slug
  status: string | null; // pass-through, unknown values rendered verbatim
  sortAt: string; // allocated_at, or earliest backfill ts for slug rows
  source: 'native' | 'backfill' | 'mixed' | 'none';
  partial: boolean;
  totals: {
    buckets: Buckets;
    recordedDollars: number | null;
    durationSeconds: number | null;
  };
  phases: PhaseRollup[]; // expanded-row detail
  sessions: LinkedSession[];
};

type PhaseRollup = {
  kind: string; // 'spec' | 'plan' | 'execute' | unknown verbatim
  source: 'native' | 'backfill';
  buckets: Buckets;
  recordedDollars: number | null;
  durationSeconds: number | null;
  byModel: Record<string, ModelBuckets> | null; // null on backfill / pre-attribution rows
  byAgentType: Record<string, ModelBuckets> | null;
};

type LinkedSession = {sessionId: string; kind: string; logFound: boolean};
```

### `GET /api/activity?tz=<IANA>`

```ts
type ActivityResponse = {
  scan: {
    sessionCount: number;
    fileCount: number;
    scannedAt: string;
    activitySince: string | null;
  };
  kpis: {
    totalBuckets: Buckets; // all activity, token-denominated
    activeDays: number; // in requested tz
    estimatedAdHocDollars: {value: number; lowerBound: boolean} | null; // null when rate table unusable
  };
  heatmap: {
    date: string /* YYYY-MM-DD local */;
    buckets: Buckets;
    sessionCount: number;
  }[];
  modelTotals: {model: string; buckets: Buckets}[];
  modelWeekly: {weekStart: string; outputByModel: Record<string, number>}[];
  sessions: SessionSummary[]; // reverse-chronological, full set (client paginates)
  parseHealth: ParseHealthSlice; // session-side counters
};

type SessionSummary = {
  sessionId: string;
  title: string | null; // ai-title, else lastPrompt (truncated), else null -> uuid
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  models: string[];
  buckets: Buckets;
  turnCount: number;
  gitBranch: string | null;
  attribution: {entryType: 'spec' | 'plan' | 'plan-slug'; key: string} | null; // null = ad hoc
  dollars: {
    basis: 'recorded' | 'estimated';
    value: number;
    lowerBound: boolean;
  } | null;
};
```

Client-side join: `CostEntry.sessions[].sessionId` -> `SessionSummary` enriches expanded cost-table rows (title, date, duration, jump-link) once activity arrives; until then the expanded detail shows a skeleton. `ParseHealthSlice` from both responses merges in the §6.8 footer.

---

## 4. Phases

Every phase ends with the quality gate clean (`pnpm typecheck && pnpm lint && pnpm test:ci`). TDD throughout per `.claude/skills/tdd/SKILL.md`: schema/parser/pricing/aggregation work is red-green-refactor against committed fixtures; tests never read `../gaia` or the real `~/.claude`. Each workstream authors the fixtures it owns.

### Phase 0: Groundwork (sequential, 1 agent)

| Task                                | Notes                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `app/data/config.ts`                | Env resolution, `../gaia` default expressed repo-relative               |
| `app/data/cache.ts`                 | (path, mtime, size) memo, unit-tested with temp files                   |
| `app/data/parse/jsonl-stream.ts`    | Streaming line reader, per-line error capture for parse health          |
| Rewrite `.claude/rules/tailwind.md` | Dark-only reality per SPEC §7; remove stale light/dark pairing guidance |
| `test/fixtures/` scaffold           | Directory layout + fixture README (what each fixture asserts)           |

**Exit criteria:** gate clean; jsonl streamer handles a malformed-line fixture without throwing and reports the skip; tailwind rule no longer mentions light-mode pairing.

### Phase 1: Data layer parsers (parallel, 4 workstreams)

Disjoint files; independently testable. Interfaces are fixed by §3's types (author `schemas/api.ts` types in W1's first commit or as a shared pre-task in Phase 0 if contention appears).

| WS  | Scope                                                                                                                                                                                                                                                                                                      | Owned fixtures (SPEC §8 list)                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `schemas/cost-record.ts`, `parse/cost-ledger.ts`: cumulative-not-delta grouping, `final: true` / max-`seq` fallback, backfill semantics, native-over-backfill, both-null degraded rows, `schema_version` gate                                                                                              | Hand-trimmed cost.jsonl: cumulative seq snapshots, final/fallback pair, rows with/without `session_cwd`, backfill rows (spec- and slug-attributed, with/without dollars and duration), degraded row, unknown `kind` |
| W2  | `schemas/ledgers.ts`, `parse/ledgers.ts`: specs + plans, old and post-SPEC-024 shapes, unknown status tolerance, defensive title rendering                                                                                                                                                                 | Ledger samples in both shapes; unknown `status`; gap in ID sequence                                                                                                                                                 |
| W3  | `parse/discover.ts`, `schemas/session-lines.ts`, `parse/session-scan.ts`: encode/confirm heuristic, `session_cwd` forward-encode, `message.id` dedupe (last-seen usage wins), sidechain inclusion attributed to parent, `<synthetic>` + usage-less exclusion, hourly-UTC bucketing, derived session fields | Session jsonl slices: duplicate `message.id`, `<synthetic>` line, sidechain file, ai-title/last-prompt variants, worktree-cwd line                                                                                  |
| W4  | `schemas/rate-table.ts`, `pricing/rates.ts`: window selection (inclusive `effective_through`, day granularity), cache multipliers, TTL-split pricing, lower-bound / silent-ignore / disabled degradation                                                                                                   | token-rates.json with intro window + sticker rate; model missing from table; non-`claude-` key                                                                                                                      |

**Exit criteria:** gate clean; the §4.1 `by_agent_type` equality invariant has a passing fixture test (W1); the `session_cwd` forward-encode and the prefix-collision case (`-Users-x-gaia-other` vs `-Users-x-gaia`) have passing tests (W3); the inclusive `effective_through` edge has a passing test (W4).

### Phase 2: Aggregation, reconciliation, handlers (parallel, 3 workstreams after a shared kickoff)

Depends on all of Phase 1. Kickoff task (30 min, sequential): land `schemas/api.ts` so all three workstreams build to the same response types.

| WS  | Scope                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W5  | `aggregate/cost-entries.ts` + `handlers/costs.ts`: entries assembly, tier/source badges, slug-row grouping and sorting, phase rollups, spec-level totals across (kind, session) groups |
| W6  | `aggregate/activity.ts` + `handlers/activity.ts`: tz fold, heatmap, model mix, weekly stacks, KPIs, session summaries with estimated/recorded dollars                                  |
| W7  | `reconcile/attribution.ts` + `reconcile/parse-health.ts`: join, attributed/ad hoc partition, "log missing", health counters wired into both handlers                                   |

**Exit criteria:** gate clean; `handlers/costs.ts` and `handlers/activity.ts` produce full Zod-valid responses from a composite fixture project (a `test/fixtures/mini-project/` with `.gaia/local` + fake claude-projects dirs); never-sum-dollars rule asserted (recorded and estimated figures never combined in any response field); an empty-project fixture yields structurally valid, empty-but-intentional responses.

### Phase 3: Server wiring + live validation (sequential, 1 agent)

`server/plugin.ts`, `server/adapter.ts`, wire into `vite.config.ts`. Then the first contact with real data: run against `../gaia`.

**Exit criteria:** `GAIA_DASHBOARD_PROJECT=../gaia pnpm dev` serves both endpoints; responses Zod-validate; SPEC-023 shows native dollars + model/agent breakdowns and historical entries show backfill phases (SPEC §9.1's data half); cold scan < 15 s, warm refresh < 1 s (log timings); `git status` clean in `../gaia` and no new files under `~/.claude` after a scan (SPEC §9.5); gate clean.

### Phase 4: UI foundation (parallel, 2 workstreams)

| WS  | Scope                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W8  | Chart kit (read `dataviz` skill first): scale/date helpers, ChartTooltip, ChartLegend, CalendarHeatmap, HorizontalBars, StackedWeeklyBars, TrendBars. Component tests on fixture data; tokens-only styling; `prefers-reduced-motion` honored; >6-series tail grouped into "other" |
| W9  | `useApiResource` / `useDashboardData` hooks, page shell in `App/`, skeleton components (read `skeleton-loaders` skill), error and empty-state primitives                                                                                                                          |

**Exit criteria:** gate clean; chart kit components render fixture data in tests with zero hex literals (lint enforces); page shell shows skeletons then live cost data against `../gaia`.

### Phase 5: Dashboard sections (parallel, up to 7 workstreams)

Depends on Phases 3+4. One agent per section, each TDD with component tests including its §6-defined empty state. `App/index.tsx` composition is NOT touched by section agents (integration agent wires sections in at fan-in, avoiding merge conflicts).

| WS  | Section                                | Notes                                                                                |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| W10 | DashboardHeader (§6.1) + KpiRow (§6.2) | Freshness line, coverage disclosure, refresh button; KPI basis labels                |
| W11 | CostTable (§6.3)                       | The centerpiece; largest scope: expandable rows, phase detail, badges, session links |
| W12 | ActivityHeatmap (§6.4)                 | Wraps CalendarHeatmap; tooltip with buckets + session count                          |
| W13 | ModelMix (§6.5)                        | HorizontalBars + StackedWeeklyBars                                                   |
| W14 | SessionsList (§6.6)                    | Pagination, filters (attribution, model), badges linking to cost rows                |
| W15 | CostTrend (§6.7)                       | TrendBars, dual encoding, never both on one $-axis                                   |
| W16 | ParseHealth (§6.8)                     | Collapsed footer, merges both response slices                                        |

**Exit criteria:** gate clean; every section has component tests for populated and empty states; integration agent has composed all sections into `App/` and the full page renders against `../gaia` and against the empty-project fixture served through the real API.

### Phase 6: Acceptance + hardening (sequential, 1 integrator + verify agents)

Walk SPEC §9 end to end:

1. §9.1-9.3 against live `../gaia` (all sections, attribution consistency, worktree sessions resolving).
2. §9.4 empty-project run (point at a bare GAIA-shaped temp fixture dir, not `../gaia`).
3. §9.5 read-only audit repeated after full UI use.
4. §9.6 perf re-check with the UI attached (no freeze during scan).
5. §9.8 one-time manual parity check: estimated-dollar math vs `token-rollup.sh` on one shared fixture input; record the result in the PR description.
6. Accessibility pass per `.claude/rules/accessibility.md`; `react-doctor` skill run; `pnpm build` succeeds (npx-compat smoke: handlers importable without Vite).
7. Final quality gate + `pnpm audit` advisory per `.claude/rules/dep-audit.md`.

**Exit criteria:** every SPEC §9 item checked off with evidence (timings, git status output, parity numbers) recorded in the PR body.

---

## 5. Execution orchestration: Workflow fan-out

Execution MUST use the Workflow tool to fan out agent teams, phase by phase, parallel wherever the dependency graph allows. Do not run the parallel phases as one long solo session.

**Model policy (user-set 2026-07-07):** the orchestrator session runs on Opus; every spawned agent (build, verify, integrate, sequential phases) runs on Sonnet via `model: 'sonnet'` in the `agent()` opts. Escalate a single agent to Opus only when it repeatedly fails its exit criteria or an integration cannot converge, and record the escalation in the checkpoint report. (P0-P2 and P4 predate this policy and ran on Fable.)

**Checkpoint policy (user-approved 2026-07-05):** run continuously, but STOP and wait for user review after P1 (parsers proven on fixtures), after P3 (first live `../gaia` contact: report perf timings and read-only audit results), and after P5 (full UI composed: user reviews the rendered dashboard before acceptance). Other phase boundaries advance without approval once exit criteria pass. Hard blockers (new dependency needed, perf budget failure, unresolvable gate failure, contract mismatch vs real data) stop execution at any point.

**Dependency graph:**

```
P0 ──> P1 {W1 ∥ W2 ∥ W3 ∥ W4} ──> P2 {W5 ∥ W6 ∥ W7} ──> P3 ──┐
                                                              ├──> P5 {W10 ∥ … ∥ W16} ──> P6
P4 {W8 ∥ W9} may start after P0 (needs only tokens + fixtures) ┘
```

P4 can run concurrently with P1-P3 (UI foundation depends on design tokens and fixture data, not on live parsers). P5 requires both P3 and P4.

**Per-phase pattern** (one Workflow invocation per parallel phase):

- `phase('Build')`: `parallel()` of one `agent()` per workstream. Each agent prompt must include: the SPEC sections it implements, its row from the phase table above (scope + owned fixtures + exit criteria), the TDD mandate (`.claude/skills/tdd/SKILL.md`), the no-new-dependencies rule (D6), and the instruction to run the quality gate on its slice before returning. Use `isolation: 'worktree'` for any phase where workstreams could touch shared files (P5 especially; P1's file sets are disjoint enough to run in-tree, but worktrees are the safe default if in doubt).
- `phase('Verify')`: pipeline each finished workstream into an independent reviewer agent that checks the diff against the workstream's exit criteria and the SPEC contract semantics (e.g. for W1: "prove the terminal-row rule and native-over-backfill are tested, try to construct a fixture that breaks them"). Findings go back to the owning agent or the integrator, not silently fixed by the reviewer.
- Fan-in: a single integrator agent merges worktrees (where used), resolves composition points (`App/index.tsx` in P5, `vite.config.ts` in P3), runs the full quality gate on the merged tree, and confirms the phase exit criteria before the orchestrator advances.

**Sequential phases** (P0, P3, P6) are single `agent()` calls, still followed by a verify agent for P3 and P6 (P3's read-only audit and perf numbers, P6's acceptance evidence, deserve independent eyes).

**Hard rules for every spawned agent:**

- Never write under `../gaia` or `~/.claude`; tests run on `test/fixtures/` only.
- Quality gate before reporting done; a pre-existing unrelated failure is surfaced, not suppressed.
- No em dashes in any authored text. No hex literals in components. No new dependencies without stopping to surface it.
- Read the relevant project skills before the corresponding work: `tdd` (all TDD work), `dataviz` (W8, W12, W13, W15), `skeleton-loaders` (W9), `tailwind`/`react-code`/`typescript` (all UI work).

---

## 6. Risks and escape hatches

| Risk                                                            | Mitigation / escape hatch                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold scan blows the 15 s budget on the real data                | Parse only needed fields per line (already the design); parallelize per-file parsing with a small worker pool in `session-scan.ts`; last resort per D2, split `sessions` behind pagination |
| Vite middleware proves insufficient (SPEC §3 caveat)            | Handlers are framework-agnostic; mount them on a bare `node:http` server spawned by a small plugin instead. Decision point: end of P3                                                      |
| Hand-rolled tooltip/axis polish eats time                       | Tooltip is one shared component; axes on these charts are minimal (band labels + a few gridlines). If W8 overruns its scope, cut gridlines before cutting tests                            |
| Hourly-UTC fold misassigns tokens in 30/45-min-offset timezones | Accepted for v1 (D4), documented in `aggregate/activity.ts`                                                                                                                                |
| `../gaia` data drifts from fixtures during the build            | Fixtures assert the contract, P3/P6 assert reality; a divergence is an upstream bug to report per SPEC §4.3, never a reason to weaken a fixture                                            |

## 7. SPEC §9 acceptance mapping

| §9 item                                                        | Covered by                             |
| -------------------------------------------------------------- | -------------------------------------- |
| 1. All sections render vs `../gaia`, native + backfill visible | P3 (data), P5 (UI), P6.1               |
| 2. Attributed vs ad hoc consistent across KPI/list/detail      | W7 join tested in P2; P6.1 cross-check |
| 3. Worktree sessions resolve (session_cwd + heuristic)         | W3 tests; P3 live check; P6.1          |
| 4. Zero-cost project renders intentionally                     | P2 empty-fixture exit criterion; P6.2  |
| 5. Read-only guarantee                                         | P3 + P6.3 audits                       |
| 6. Cold < 15 s, warm < 1 s, no UI freeze                       | P3 timings; P6.4                       |
| 7. Gate clean + fixture-driven suites                          | Every phase exit criterion             |
| 8. Parity with token-rollup.sh                                 | P6.5 (manual, recorded in PR)          |
