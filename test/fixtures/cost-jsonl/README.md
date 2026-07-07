# cost-jsonl fixtures (W1)

`cost.jsonl`: hand-authored, sanitized cost-ledger sample asserting the SPEC
section 4.1 contract. 14 lines:

| Lines | Scenario                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| 1-3   | SPEC-100 execute, cumulative seq 0..2 (totals 9100/13650/17000); `final:true` on seq 1, NOT the max-seq row. Rows carry `session_cwd` and `by_model`/`by_agent_type` satisfying the equality invariant |
| 4-6   | PLAN-001 execute, seq 0..2, no `final:true` anywhere: max-seq fallback. Pre-SPEC-024 shape: no `session_cwd` key, no breakdowns, `dollars` null                                                        |
| 7-8   | SPEC-101 spec, same session: native row (total 150) + backfill row (total 154) colliding on one group; native must win and the collision is noted                                                      |
| 9     | Spec-attributed backfill (SPEC-102): null spans, duration present, dollars null                                                                                                                        |
| 10-11 | Slug-attributed backfill (`plan_slug: "legacy-plan"`, both ids null): plan phase with dollars + duration, execute phase with both null                                                                 |
| 12    | Both-null degraded native row (total 709, `partial: true`, `session_cwd: null`): kept as unattributed                                                                                                  |
| 13    | Unknown `kind: "review"` with an unknown `future_field`: passes through verbatim                                                                                                                       |
| 14    | `schema_version: 2`: unsupported, rejected and counted in parse health                                                                                                                                 |

All paths are neutral placeholders (`/Users/you/projects/my-app`). Consumed by
`app/data/schemas/tests/cost-record*.test.ts` and
`app/data/parse/tests/cost-ledger.test.ts`.
