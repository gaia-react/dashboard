---
paths:
  - 'app/**'
---

# Repo-Relative Paths (repo-wide)

**Standing policy: no hardcoded machine-specific absolute paths anywhere in the repo.** Not in source, tests, docs, runbooks, comments, or config.

## Rule

Use a repo-relative path when the command or reference runs from the repo root (the executing agent's working directory always is):

- `app/i18n.ts` — never `/Users/<name>/…/app/i18n.ts`.

When an absolute path is genuinely required (a command that first `cd`s elsewhere, or a subshell that inherits the value), derive the root once and interpolate it:

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
# …then reference "$PROJECT_ROOT/app/components/Example"
```

Illustrative comment / test / doc examples that must *show* an absolute path use a neutral placeholder, never a real machine path: `/Users/you/projects/my-app`, `/Users/username/…`, `<repo-root>`, `foo` / `bar`.
