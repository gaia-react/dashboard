# Quality Gate

Before reporting any change as done, run:

```bash
pnpm typecheck
pnpm lint
pnpm test:ci
```

All three must exit clean. `pnpm lint` runs `eslint --fix` with Prettier wired in as an ESLint rule, so it also normalizes formatting, don't hand-fix style issues it will auto-correct.

Fix failures before reporting the task done. If a failure is pre-existing and unrelated to your change, surface it rather than suppressing or working around it.
