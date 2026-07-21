# cost-entries aggregation fixtures (W4)

Inputs for `app/data/aggregate/tests/cost-entries.test.ts`, exercising the
SPEC section 6.3 row-assembly semantics on top of the W1/W2 parsers, plus the
Phase 8 v2 scalar-token contract, `github` sourcing, and `commandEvents`. All
paths are neutral placeholders; no real data.

## cost.jsonl scenario map

| Lines | Scenario                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1-2   | SPEC-200 execute, session `20000001-...`, cumulative seq 0..1, no `final:true`: terminal is max-seq (total 200, dollars 1, duration 200, `github` #10). Never summed within the group. |
| 3     | SPEC-200 execute, session `20000002-...`, `final:true`, `by_model`/`by_agent_type` present (dollars 2.5, duration 300, `github` #20, later than session 1's): multi-session spec, totals sum terminal rows across sessions; the entry's `github` takes the most recent of the two. |
| 4     | SPEC-200 spec phase, session `20000003-...`, `partial:true`, null spans/duration, no breakdowns (pre-attribution native).           |
| 5     | SPEC-201 spec phase, native with `by_model`/`by_agent_type`, dollars null, SPEC-032 audit (buckets collapse to totalTokens 390): camelCase scalar-total mapping. |
| 6     | SPEC-201 execute phase, backfill (dollars 4.25, duration 500, no `github`): SPEC-201 badges `mixed`; backfill rollup has null breakdowns and the entry's `github` is null (no execute row carries one). |
| 7     | Slug-attributed backfill (`plan_slug: "vintage-plan"`), plan phase, dollars 3, duration 600, ts 2026-06-05.                          |
| 8     | Slug-attributed backfill, execute phase, dollars/duration null, ts 2026-06-04: the slug row sorts by THIS earlier ts.               |
| 9     | Ad-hoc `code-review-audit` review (SPEC-032), null spec/plan, `review_id agent-aggadhoc01`, total 51, dollars 0.9.                   |
| 10    | `kind: "command"` row, `gaia-debt`, full shape: `run_id`, `github`, `by_model`, `by_agent_type`, dollars 1.1, total 100.             |
| 11    | `kind: "command"` row with NO `command` field (falls back to `run_id`), no `github`/breakdowns, dollars null, total 4: earliest command event. |
| 12    | `kind: "command"` row, `gaia-wiki`, has `by_model` but no `by_agent_type` and no `github`, dollars 0.4, total 20: latest command event before line 13. |
| 13    | `kind: "command"` row, `gaia-harden`, buckets sum to 8 but `total` is 500 (deliberately divergent): proves `buildCommandEvents` passes through the row's own `total` rather than re-summing its buckets. Dollars null (no effect on `recordedDollars`); latest command event overall. |

## Ledgers

- `specs-ledger.json`: SPEC-200 (merged), SPEC-201 (draft), SPEC-202 (draft,
  no cost rows anywhere: source badge `none`).
- `plans-ledger.json`: PLAN-010 (completed, no cost rows: `none`).

## Expected derived facts

- Entry order (chronological): SPEC-200 (06-01T08:00), SPEC-201 (06-03T07:00),
  `slug:vintage-plan` (06-04T11:00, earliest backfill ts), PLAN-010
  (06-06T10:00), SPEC-202 (06-10T08:00).
- SPEC-200 totals: totalTokens 260 (200 + 50 + 10, each row's own `total`),
  recordedDollars 3.5 (1 + 2.5, terminal rows only), durationSeconds 500,
  partial true, source `native`, github #20 (most recent execute row).
- SPEC-201: source `mixed`, recordedDollars 4.25, github null.
- `slug:vintage-plan`: source `backfill`, recordedDollars 3, duration 600.
- Command events sort chronologically: the no-`command` row (07-08, falls
  back to its `run_id`), `gaia-debt` (07-10), `gaia-wiki` (07-12), `gaia-harden`
  (07-15, the bucket/total-divergence row).
- Aggregate `recordedDollars` 13.15: 10.75 (cost-table entries) + 0.9 (the
  ad-hoc review) + 1.5 (the two priced command events; the third has null
  dollars). Phase 8 v2 removed the SPEC-032 carve-out that used to exclude
  ad-hoc reviews (and now command events) from this KPI, since every event is
  visible in one list.
- costSince 2026-06-01T09:00:00Z (line 4 ts, null started_at falls back to
  ts); unaffected by the later (2026-07) command rows.
