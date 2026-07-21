# Test fixtures

Small, sanitized, committed sample files that the data-layer suites run against.
Fixtures assert the **data contract** (SPEC section 4); the live `../gaia` project
asserts reality (P3/P6). A divergence between the two is an upstream bug to
report, never a reason to weaken a fixture.

## Hard rules

- **Never** read `../gaia` or the real `~/.claude` from a test. Point every test
  at a file under `test/fixtures/`.
- No machine-specific absolute paths in fixtures or the tests that load them;
  resolve fixture paths relative to the test file
  (`new URL('...', import.meta.url)`), never a `/Users/...` literal.
- No real secrets, tokens, or personal paths. Sanitize `session_cwd` and any
  sample paths to neutral placeholders (`/Users/you/projects/my-app`).
- **Raw telemetry keeps `buckets`; client-response fixtures never do.** See
  "Phase 8 v2: buckets are a raw-telemetry concept only" below before touching
  any `.jsonl` fixture or any fixture shaped like a `CostsResponse` /
  `ActivityResponse`.

## Phase 8 v2: buckets are a raw-telemetry concept only

The v2 redesign removed granular token buckets (`fresh_input` / `cache_write` /
`cache_read` / `output`) from every **client-facing** shape (`app/data/schemas/api.ts`):
a scalar `totalTokens` replaces every bucket breakdown, and per-model /
per-agent-type maps carry a token scalar per key instead of a bucket object per
key. This is a client-contract change ONLY. Two fixture populations exist, and
they must never be confused:

- **Raw telemetry (`.jsonl` files GAIA itself writes to `cost.jsonl`)**: these
  MUST keep their `buckets` field, on every row, forever. `app/data/pricing/rates.ts`
  prices `fresh_input` / `cache_write` / `cache_read` / `output` at four
  different per-token rates; stripping buckets from a raw fixture silently
  destroys pricing-layer test coverage, and the failure will not surface until
  a rate bug ships, phases later. The fixtures that must keep buckets:
  `test/fixtures/cost-entries/cost.jsonl`, `test/fixtures/cost-jsonl/cost.jsonl`,
  `test/fixtures/cost-ledger/cost.jsonl`, and
  `test/fixtures/mini-project/project/.gaia/local/telemetry/cost.jsonl`. (Nothing
  under `jsonl/`, `ledgers/`, or `sessions/` carries this bucket concept at all;
  they exercise a different layer and were untouched by this migration.)
- **Client-response fixtures (anything schema-parsed through `costsResponseSchema`
  / `activityResponseSchema`, i.e. anything under `api/`, `activity-heatmap/`,
  `cost-table/`, `cost-trend/`, `header-kpi/`, `insights/`, `model-mix/`, or
  `sessions-list/`)**: these correctly DROP `buckets`/`totalBuckets`/
  `outputByModel` and carry `totalTokens` / `tokensByModel` instead, matching
  `app/data/schemas/api.ts`. If you are editing one of these and see a
  `buckets` key, that fixture is stale against the contract, not intentionally
  bucket-shaped; convert it, don't preserve it.

Who touched what in this migration:

- **W3** (`app/data/parse/cost-ledger.ts`) added `test/fixtures/cost-ledger/cost.jsonl`
  (new): `command` and `review` as known kinds, all three `github` shapes (pr,
  issue, absent), `run_id` keying/fallback. Raw telemetry; keeps buckets.
- **W4** (`app/data/aggregate/cost-entries.ts`) extended
  `test/fixtures/cost-entries/cost.jsonl`: added `github` to two SPEC-200
  execute rows (proving most-recent-wins tiebreak) and three `kind: "command"`
  rows. Raw telemetry; keeps buckets. The integrator later added a fourth
  command row (`gaia-harden`) whose `buckets` deliberately sum to a different
  number than its own `total`, so `buildCommandEvents`/`sumRowTotals` reading
  the row's own `total` field is provably a passthrough, not a bucket re-sum
  that happens to agree.
- **W7** (`app/components/**`) converted every fixture under
  `activity-heatmap/`, `cost-table/`, `cost-trend/`, `header-kpi/`, `insights/`,
  `model-mix/`, and `sessions-list/` from the old bucket-shaped client response
  to the scalar contract, and engineered `activity-heatmap/populated.json` and
  `model-mix/populated.json` so total tokens genuinely diverge from output
  tokens (proving the heatmap and per-model metrics moved to total, not output).
- **Integrator** converted `test/fixtures/api/costs.json` and `activity.json`
  the same way (`buckets`/`totalBuckets`/`outputByModel` -> `totalTokens` /
  `tokensByModel`, added the now-required `github` field on cost entries).
  This directory was not claimed by any Phase 8 task file even though
  `app/components/App/tests/index.test.tsx` and
  `app/hooks/tests/useDashboardData.test.ts` read it directly; flagging the gap
  here so the next fixture migration checks this directory's ownership
  explicitly instead of assuming it is covered.
- **K2** (`app/data/schemas/api.ts`, `cost-record.ts`) did not touch any
  fixture; it defined the scalar contract every fixture above now matches.

## Layout

Each workstream owns and authors the fixtures for its slice. Drop files here:

| Directory       | Owner | Asserts                                                                                                                                                                                                                                           |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonl/`        | P0    | Streaming reader: malformed-line capture, blank-line skip                                                                                                                                                                                         |
| `cost-jsonl/`   | W1    | cost.jsonl: cumulative seq snapshots, `final:true`/max-seq fallback, native-over-backfill, backfill rows (spec- and slug-attributed, with/without dollars + duration), both-null degraded row, unknown `kind`, `by_agent_type` equality invariant |
| `ledgers/`      | W2    | specs/plans ledger.json in old and post-SPEC-024 shapes, unknown `status`, ID-sequence gap                                                                                                                                                        |
| `sessions/`     | W3    | Session jsonl slices: duplicate `message.id`, `<synthetic>` line, sidechain file, ai-title/last-prompt variants, worktree-cwd line                                                                                                                |
| `rate-table/`   | W4    | token-rates.json: intro window + sticker rate, model missing from table, non-`claude-` key                                                                                                                                                        |
| `mini-project/` | P2    | Composite fixture project (`.gaia/local` + fake claude-projects dirs) for end-to-end handler tests, plus an empty-project variant                                                                                                                 |
| `empty-project/`| P2    | Fresh-adopter composite: rate table only, no `.gaia/local`, two ad hoc sessions; handlers must render empty-but-intentional                                                                                                                       |
| `cost-entries/` | W5    | Cost-entries aggregation: multi-session spec totals, slug-row titling/ordering traps, per-source badges, cumulative no-final groups                                                                                                               |
| `cost-ledger/`  | Phase 8 W3 | cost.jsonl: `command`/`review` as known kinds, all three `github` shapes (pr/issue/absent), `run_id` keying and its no-`run_id` fallback                                                                                                     |
| `api/`          | W9    | Canned PLAN section 3 `CostsResponse`/`ActivityResponse` envelopes for data-hook and page-shell tests                                                                                                                                             |
| `charts/`       | W8    | Chart-kit input slices: heatmap days, model totals, weekly stacks, trend entries                                                                                                                                                                  |

## Present fixtures

### `jsonl/` (P0)

- `jsonl/malformed-lines.jsonl`: 4 valid rows, 2 malformed lines (lines 3, 6),
  1 blank line. Drives the `streamJsonl` capture-and-continue test.
- `jsonl/blank.jsonl`: whitespace only; the reader must report zero lines and
  never invoke the callback.

### `cost-jsonl/` (W1)

- `cost-jsonl/cost.jsonl`: 14 lines covering cumulative seq 0..2 snapshots with
  `final:true` on a non-max seq, a max-seq fallback group with no final row, a
  native+backfill collision on one group, spec- and slug-attributed backfill
  rows (with and without dollars/duration), a both-null degraded partial row,
  an unknown `kind`, an unsupported `schema_version: 2` row, and rows with and
  without `session_cwd` / `by_agent_type` (the section 4.1 equality invariant).
- `cost-jsonl/README.md`: line-by-line scenario map for the fixture above.

### `ledgers/` (W2)

- `ledgers/specs-ledger.json`: mixed `source` values (allocated, backfilled,
  and the out-of-vocabulary `imported`), status progression plus unknown
  `superseded`, the SPEC-004 ID gap, an empty `intent`, and an over-long
  `intent` for defensive title bounding.
- `ledgers/plans-ledger-post-spec-024.json`: post-SPEC-024 shape with `status`
  and `completed_at`; PLAN-002 reads `allocated` for both `source` and
  `status`, PLAN-003 is an ID gap, PLAN-004 carries unknown status `paused`.
- `ledgers/plans-ledger-old-shape.json`: pre-SPEC-024 shape lacking `status`
  and `completed_at`, including an empty `subject`.

### `sessions/` (W3)

Fake `$CLAUDE_CONFIG_DIR/projects/` tree under `sessions/projects/`:

- `-Users-you-projects-my-app/`: the confirmed root project directory.
  - `11111111-...jsonl`: duplicate `message.id` (last-seen smaller usage),
    `<synthetic>` line, usage-less line, two `ai-title` lines plus a
    `last-prompt`, and a mid-file `gitBranch` switch.
  - `11111111-.../subagents/agent-abc123.jsonl` (+ `.meta.json`): sidechain
    transcript whose tokens attribute to the parent session.
  - `22222222-...jsonl`: no `ai-title`, over-long `last-prompt` (truncation).
  - `33333333-...jsonl`: no title lines at all (uuid fallback).
- `-Users-you-projects-my-app-other/`: prefix-collision sibling project whose
  first `cwd` is outside the root; confirmation must reject it.
- `-Users-you-projects-my-app--claude-worktrees-spec-001-demo/`: worktree
  directory whose `cwd` is inside the root; confirmation must accept it.
- `-Users-you-projects-my-app-nocwd/`: no `cwd` on any line; rejected.

### `rate-table/` (W4)

- `rate-table/token-rates.json`: default cache multipliers, a dated intro
  window plus undated sticker entry (inclusive `effective_through` edge), and
  a flat-rate model for cross-model summation.
- `rate-table/token-rates-custom-multipliers.json`: non-default multipliers,
  proving pricing reads `cache_multipliers` from the table.
- `rate-table/token-rates-unparseable.json`: invalid JSON; loader degrades to
  `status: 'unparseable'` (estimates off).
- `rate-table/token-rates-wrong-shape.json`: valid JSON, wrong shape; same
  degradation.

### `mini-project/` and `empty-project/` (P2)

Composite fixture projects for end-to-end handler and reconciliation tests.
Never point a handler at these directories directly: the SPEC 4.4 directory
encoding covers the absolute session cwd, so committed `claude/projects/*`
names cannot match a real checkout path. Always go through
`test/helpers/fixture-project.ts` (`materializeFixtureProject('mini-project')`),
which copies the tree to a temp dir, re-encodes directory names, and rewrites
the neutral `/Users/you/projects/my-app` placeholder. Details and the full
scenario map: `mini-project/README.md`.

- `mini-project/`: `.gaia/local` with `telemetry/cost.jsonl` (10 rows + 1
  malformed line: native SPEC-100 with `by_model`/`by_agent_type` and a
  worktree `session_cwd`, max-seq-fallback PLAN-001, spec- and slug-attributed
  backfill, an unknown `review` kind making SPEC-102 mixed), specs/plans
  ledgers, a rate table pricing both transcript models, and a fake
  `claude/projects` tree (root dir with ad hoc + attributed +
  midnight-straddling sessions, one subagent transcript, one worktree-cwd
  dir, one prefix-collision sibling that discovery must reject).
- `empty-project/`: fresh-adopter state; rate table only, no `.gaia/local`,
  two ad hoc sessions. Handlers must yield structurally valid,
  empty-but-intentional responses.

### `cost-entries/` (W5)

- `cost-entries/cost.jsonl` + `specs-ledger.json` + `plans-ledger.json`:
  aggregation traps for `buildCostEntries`: SPEC-200 spans three
  (kind, session) groups including a cumulative seq 0..1 group with no
  `final:true` row (terminal rows sum across groups, never within), SPEC-201
  mixes native and backfill sources, `slug:vintage-plan` puts its earliest
  backfill `ts` on the execute phase to trap wrong-phase slug ordering, and
  SPEC-202/PLAN-010 carry no cost at all (`source: none`).
- `cost-entries/README.md`: scenario map plus the hand-computed expected
  totals the tests assert.
- Phase 8 v2 additions (see "Phase 8 v2" above for the raw-vs-response
  distinction): `github` on two execute rows, four `kind: "command"` rows
  (one deliberately `buckets`-sum-diverges-from-`total`), all documented in
  `cost-entries/README.md`. Raw telemetry; keeps buckets throughout.

### `cost-ledger/` (Phase 8 W3)

- `cost-ledger/cost.jsonl`: 8 rows proving `command` and `review` are known
  `kind` values (a genuinely unknown `triage` kind still surfaces), two
  `command` rows sharing a session but different `run_id` (two groups), a
  `command` row with no `run_id` (base-key fallback), and all three `github`
  artifact shapes (`pr`, `issue`, absent). Raw telemetry; keeps buckets.

### `api/` (W9)

- `api/costs.json`: canned `/api/costs` response (project identity, rate-table
  status, coverage, KPIs, cost entries) driving `useDashboardData` and page-shell
  tests.
- `api/activity.json`: canned `/api/activity` response (scan metadata, token
  KPIs, heatmap days, model mix, sessions) for the activity resource tests.
- Both fixtures are full, schema-valid `CostsResponse` / `ActivityResponse`
  envelopes (Phase 5 trued them up against `costsResponseSchema` /
  `activityResponseSchema` in `schemas/api.ts`, including the real
  `parseHealth` shape); the App composition test round-trips both through
  their schemas at load time so a future drift fails loudly.
- Phase 8 v2: the integrator converted both from the bucket-shaped response
  shape (`totals.buckets`, `kpis.totalBuckets`, `modelWeekly[].outputByModel`)
  to the scalar contract (`totalTokens`, `tokensByModel`), and added the
  now-required `github: null` on the cost entry. Unlike every other directory
  in this table, no Phase 8 task file claimed this one, even though
  `App/tests/index.test.tsx` and `useDashboardData.test.ts` read it directly
  and do NOT parse it through the schema first (no honesty check), so a stale
  fixture here fails as a confusing runtime `TypeError` deep in a component,
  not a clear Zod error at fixture load.

### `charts/` (W8)

- `charts/heatmap-days.json`: ISO day/value entries spanning multiple weeks and
  a month boundary; drives `CalendarHeatmap` grid placement and ramp tests.
- `charts/model-totals.json`: labeled totals for `HorizontalBars` rendering and
  value-label tests.
- `charts/weekly-stacks.json`: 8-series weekly rows; proves tail-grouping past
  6 series into "other" (fold, legend, neutral fill) in `StackedWeeklyBars`.
- `charts/trend-entries.json`: mixed spec/plan entries, some measured in
  dollars and some in tokens, for `TrendBars` dual-encoding tests (each unit
  normalized to its own max, never a shared $-axis).
