# empty-project composite fixture (P2 kickoff)

The mini-project tree shape for a FRESH GAIA adopter: no `.gaia/local/` at all
(no cost.jsonl, no ledgers; a legal state, not an error), but the committed
`.gaia/scripts/token-rates.json` is present and a couple of ad hoc sessions
exist. Drives the empty-state exit criteria: every dashboard section must look
intentional, and handlers must return structurally valid, empty-but-honest
responses (activity history predating cost tracking is normal).

Use it through the same helper as mini-project (see
`../mini-project/README.md` for why direct paths cannot work):

```ts
materializeFixtureProject('empty-project');
```

## Layout

```
project/
  .gaia/scripts/token-rates.json   # rate table only; .gaia/local is absent
claude/projects/-Users-you-projects-my-app/
  77777777-...jsonl                # 2026-05-05, two turns, ai-title present
  88888888-...jsonl                # 2026-05-06, one turn, no title, no gitBranch (uuid fallback)
```

All paths are neutral placeholders; no real data.
