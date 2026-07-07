# mini-project composite fixture (P2 kickoff)

A complete, sanitized GAIA-shaped project plus a fake `$CLAUDE_CONFIG_DIR`,
shared by the W5/W6/W7 handler tests. Authored in one place (the P2 kickoff) to
avoid a parallel-write race. Rows are reused from the P1 workstream fixtures
(`cost-jsonl/`, `ledgers/`, `sessions/`, `rate-table/`) so the composite stays
consistent with the per-slice suites.

## Use it via the materialize helper

The SPEC section 4.4 directory encoding covers the ABSOLUTE session cwd, so the
committed `claude/projects/*` names (encoded from the neutral placeholder root
`/Users/you/projects/my-app`) can never match a real checkout path. Do not
point a handler at this directory directly. Instead:

```ts
import {materializeFixtureProject} from '../../helpers/fixture-project';

const {claudeConfigDir, cleanup, projectName, projectRoot} =
  materializeFixtureProject('mini-project');
```

The helper copies the tree into a temp directory, re-encodes the
`claude/projects/*` names for the temp root, and rewrites every placeholder
path inside the files, so discovery, `session_cwd` forward-encoding, and
`.gaia/**` reads all line up. Call `cleanup()` when done.
`test/helpers/tests/fixture-project.test.ts` asserts this end to end.

## Layout

```
project/                      # the GAIA project root (ctx.projectRoot)
  .gaia/
    local/
      telemetry/cost.jsonl    # 10 rows + 1 malformed line (scenarios below)
      specs/ledger.json       # SPEC-100, SPEC-102, SPEC-103 (SPEC-101 ID gap)
      plans/ledger.json       # PLAN-001 (post-SPEC-024 shape)
    scripts/token-rates.json  # prices claude-opus-4-8 + claude-sonnet-4-6
claude/                       # fake $CLAUDE_CONFIG_DIR (ctx.claudeConfigDir)
  projects/
    -Users-you-projects-my-app/                                    # root dir
    -Users-you-projects-my-app--claude-worktrees-spec-100-fixture/ # worktree
    -Users-you-projects-my-app-other/                              # sibling, must be rejected
```

## cost.jsonl scenario map

| Lines | Scenario                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1-3   | PLAN-001 execute, cumulative seq 0..2, no `final:true` anywhere: max-seq fallback (terminal total 3390, duration 900, dollars null). Pre-SPEC-024 shape: no `session_cwd`, no breakdowns. Session `bbbbbbbb-...` has a transcript in the root dir (heuristic lookup) |
| 4-6   | SPEC-100 execute, cumulative seq 0..2, `final:true` on seq 1 NOT the max (terminal total 13650, dollars 1.37, duration 700). Carries `session_cwd` (worktree) + `by_model`/`by_agent_type` satisfying the section 4.1 equality invariant. Session `aaaaaaaa-...` lives in the worktree dir via forward-encode |
| 7     | SPEC-102 spec-attributed backfill: null spans, duration present, dollars null. Session `dddddddd-...` has NO transcript ("log missing") |
| 8     | Slug-attributed backfill (`plan_slug: "legacy-plan"`, both ids null): plan phase with dollars 13.58 + duration                          |
| 9     | Slug-attributed backfill, execute phase: dollars and duration both null                                                                 |
| 10    | Unknown `kind: "review"` native row on SPEC-102 (no breakdowns): SPEC-102 becomes source `mixed`, kind rendered verbatim. Session `abababab-...` has no transcript |
| 11    | Malformed (truncated) line: `streamJsonl` captures it for parse health                                                                  |

## Expected derived facts (for handler assertions)

- Cost-entry rows: SPEC-100 (`native`), SPEC-102 (`mixed`), SPEC-103 (`none`,
  no cost from any source), PLAN-001 (`native`), `slug:legacy-plan`
  (`backfill`, sorts by earliest backfill ts `2026-07-04T08:59:10Z`).
- Attributed sessions: `aaaaaaaa` (log found, worktree), `bbbbbbbb` (log
  found, root), `dddddddd`, `eeeeeeee`, `ffffffff`, `abababab` (no logs, "log
  missing").
- Ad hoc sessions with no cost row: `11111111-...` (duplicate `message.id`,
  `<synthetic>` line, usage-less line, subagent transcript, title/branch
  switches; copied from `sessions/`) and `22222222-...` (spans
  2026-06-25T23:30Z to 2026-06-26T00:30Z: straddles UTC midnight for tz-fold
  tests).
- `-Users-you-projects-my-app-other/` first `cwd` is outside the root, so
  discovery confirmation must reject it.

All paths are neutral placeholders; no real data.
