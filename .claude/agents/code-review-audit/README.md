# code-review-audit Extensions

This directory contains library-specific audit rules for the `code-review-audit` agent (`.claude/agents/code-review-audit.md`).

## How it works

At startup the agent Globs `*.md` files in this directory (skipping this README), reads each one, parses its `subagents:` frontmatter field, and injects the file's content into the matching specialist subagent's prompt before dispatching.

If this directory is empty or missing, the agent runs its generic review without library-specific checks.

## Extension file format

```yaml
---
subagents: [react-patterns, typescript]
library: package-name
---
```

Valid `subagents` values map to the two specialist subagents:

- `react-patterns` → Subagent 1 (`.tsx` files: hooks, components, accessibility)
- `typescript` → Subagent 2 (`.ts` + `.tsx` files: types, architecture, conventions)

These values are **rule-injection labels** (metadata selecting which specialist prompt receives this file's rules), NOT skill or command names. The agent dispatches each specialist via the Agent (Task) tool, never via the Skill tool, and there is no `subagent:<name> files:<paths>` argument string.

`library` is documentation only, it identifies which dependency this file covers.

## When to update

| Event                                                                           | Action                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Add a library with audit-worthy patterns (styling, state management, etc.)      | Create a new extension file                         |
| Remove a library                                                                | Delete its extension file                           |
| Replace a library                                                               | Delete the old file, create one for the replacement |
| Library has a major API change that invalidates its rules                      | Update the file                                     |

## Current extensions

| File                 | Library              | Subagents  |
| -------------------- | --------------------- | ---------- |
| `tailwind-merge.md`  | `tailwind-merge`      | typescript |
