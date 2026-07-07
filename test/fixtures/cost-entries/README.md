# cost-entries aggregation fixtures (W5)

Inputs for `app/data/aggregate/tests/cost-entries.test.ts`, exercising the
SPEC section 6.3 row-assembly semantics on top of the W1/W2 parsers. All
paths are neutral placeholders; no real data.

## cost.jsonl scenario map

| Lines | Scenario                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1-2   | SPEC-200 execute, session `20000001-...`, cumulative seq 0..1, no `final:true`: terminal is max-seq (total 200, dollars 1, duration 200). Never summed within the group. |
| 3     | SPEC-200 execute, session `20000002-...`, `final:true`, `by_model`/`by_agent_type` present (dollars 2.5, duration 300): multi-session spec, totals sum terminal rows across sessions. |
| 4     | SPEC-200 spec phase, session `20000003-...`, `partial:true`, null spans/duration, no breakdowns (pre-attribution native).           |
| 5     | SPEC-201 spec phase, native with `by_model`/`by_agent_type`, dollars null: camelCase breakdown mapping.                              |
| 6     | SPEC-201 execute phase, backfill (dollars 4.25, duration 500): SPEC-201 badges `mixed`; backfill rollup has null breakdowns.        |
| 7     | Slug-attributed backfill (`plan_slug: "vintage-plan"`), plan phase, dollars 3, duration 600, ts 2026-06-05.                          |
| 8     | Slug-attributed backfill, execute phase, dollars/duration null, ts 2026-06-04: the slug row sorts by THIS earlier ts.               |

## Ledgers

- `specs-ledger.json`: SPEC-200 (merged), SPEC-201 (draft), SPEC-202 (draft,
  no cost rows anywhere: source badge `none`).
- `plans-ledger.json`: PLAN-010 (completed, no cost rows: `none`).

## Expected derived facts

- Entry order (chronological): SPEC-200 (06-01T08:00), SPEC-201 (06-03T07:00),
  `slug:vintage-plan` (06-04T11:00, earliest backfill ts), PLAN-010
  (06-06T10:00), SPEC-202 (06-10T08:00).
- SPEC-200 totals: buckets {26, 52, 78, 104}, recordedDollars 3.5 (1 + 2.5,
  terminal rows only), durationSeconds 500, partial true, source `native`.
- SPEC-201: source `mixed`, recordedDollars 4.25.
- `slug:vintage-plan`: source `backfill`, recordedDollars 3, duration 600.
- Aggregate recordedDollars 10.75; costSince 2026-06-01T09:00:00Z (line 4 ts,
  null started_at falls back to ts).
