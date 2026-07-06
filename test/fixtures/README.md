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

## Present fixtures (P0)

- `jsonl/malformed-lines.jsonl` — 4 valid rows, 2 malformed lines (lines 3, 6),
  1 blank line. Drives the `streamJsonl` capture-and-continue test.
- `jsonl/blank.jsonl` — whitespace only; the reader must report zero lines and
  never invoke the callback.
