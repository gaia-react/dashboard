# Known Issues

Tracked defects, deferred findings, and contract decisions carried out of the
GAIA Dashboard v1 build. None are hard blockers: the full gate is clean and
every stated exit criterion is met. Items here are low/medium severity or
documented design tradeoffs, recorded so they are not rediscovered as surprises.

Last updated: M7 close-out (commit `2d61cd1`).

## Resolved since Phase 5

Fixed by the M1-M6 feature commits, no longer applicable; kept here as a
paper trail rather than silently dropped.

- **CostTable (W11).** The `byAgentType`/`byModel` nesting is gone (the two
  checks are now independent siblings, see `ExpandedDetail/index.tsx`); the
  linked-sessions lookup is a `useMemo`'d `Map` (`CostTable/index.tsx`); and
  `CostTable/tests/format.test.ts` now directly unit-tests the non-null paths
  of `formatDollars` / `formatDuration` / `formatTokens` / `formatDateTime`.
- **ParseHealth (W16).** The note list is deduped with a `Set` before
  rendering (no more identical-value key collision), and the counters list
  keys on `counter.source`, which costs and activity counters never share
  (disjoint source vocabularies by contract). No key-collision warning is
  reachable through the real pipeline.
- **`CostTableSkeleton`'s header row (Work-tab round 2).** `TableHead` /
  `SortableHeaderCell` grew a `disabled` mode (`CostTable/index.tsx`): the
  skeleton passes `disabled` and gets a plain, non-focusable `<span>` label
  instead of reusing the live sort `<button>`, so no focusable control sits
  inside the `aria-hidden` wrapper anymore. The live (non-skeleton) header is
  unchanged.

Note: the M5/M6 commits (`b877e44` rename `?session`→`?id` + fix the reverse
jump-link's dead same-page hash; `d85015e` Work-tab sorting/totals/deep-link)
fixed bugs found during active development, not items that were ever tracked
in this file, so there is nothing to move for those beyond this note.

## Deferred findings (surface at P5, left unfixed by mandate)

These came out of the adversarial verify pass. The integrator's fix mandate was
blocker/high severity plus any weak or missing exit criterion; everything below
is low/medium and flips no stated criterion, so it was intentionally left.

### Accessibility (M7 react-doctor pass)

- **`ExpandedDetail`'s skeleton row (false positive).** `no-aria-hidden-on-
focusable` flagged `<tr aria-hidden={true}>` in `SessionSkeletonRow`. Not
  reachable: neither the row nor its `Skeleton` children are focusable (plain
  `aria-hidden` divs, no tabIndex/interactive role). Noted inline at the site.

### Intl formatter hoisting (M7 react-doctor pass)

`formatDayLabel` / `formatWeekLabel` (`Charts/date-helpers.ts`),
`formatCompactNumber` (`Charts/scale-helpers.ts`), `formatDollars` /
`formatDateTime` (`CostTable/format.ts`), `formatDollars`
(`KpiRow/format-kpi.ts`), and `TrendBars`' inline dollars formatter were
rebuilding an `Intl` formatter on every call despite `locale`/`timeZone`
being undefined on every real call site (only tests pass one, for
determinism). Each now hoists a module-level default-locale/timezone
formatter for that common path, falling back to a fresh instance only when a
caller explicitly passes one. Left unhoisted, by design:

- `buildMonthLabels` / `buildWeekdayLabels` (`Charts/date-helpers.ts`) already
  build one formatter and reuse it across their own internal loop; the
  residual cost is once per component render, not once per grid cell, and a
  cross-render cache would need `useMemo` at the call site (out of scope for
  a plain utility module).
- `resolveTimeZone` (`data/handlers/activity.ts`) runs once per API request
  (not a loop) against an arbitrary caller-supplied IANA timezone with no
  single dominant value to hoist as a default.
- `formatLocalDate` (`DashboardHeader/format-header.ts`) has the same
  react-doctor finding, but `DashboardHeader/**` is fenced off this pass (a
  round-2 header change is in flight there in parallel); left untouched.

### ModelMix (W13)

- `escapeSeriesKey` does not handle a model literally named `other.model`
  colliding with its own escape sequence. Not reachable through the real
  pipeline (see the server-side cap note below).
- `app/data/aggregate/activity.ts` caps `modelTotals` / `modelWeekly` at 6
  series server-side, which compounds with the chart kit's own tail-fold cap.
  Flagged to that module's owner; not touched during P5.

### DashboardHeader / KpiRow (W10)

- Contradictory copy is possible when `estimatedAdHocDollars` is simultaneously
  `$0` and `lowerBound: true` (renders a "lower bound" marker on a zero value).
- No negative test proving the lower-bound marker is absent when
  `lowerBound: false`.
- Cosmetic: `text-align` and `truncate` interact awkwardly on very long project
  paths.

## Design decisions and contract gaps (by review, not defects)

### pnpm-workspace supply-chain hardening is deferred

react-doctor's `require-pnpm-hardening` rule wants `minimumReleaseAge` and
`trustPolicy` in `pnpm-workspace.yaml`. Verified and reverted (M7): adding
`minimumReleaseAge: 10080` makes `pnpm install --frozen-lockfile` fail, since
several exact-pinned lockfile entries (e.g. `@gaia-react/lint`, the
`@oxc-resolver` bindings) were published within the 7-day window. Frozen-
lockfile installs are how CI and fresh clones install, so this cannot land
until the lockfile's pinned versions all clear the age window (or the policy
ships with an exemption for already-pinned exact versions). Intentionally
left out.

### Section chrome is inconsistent across sections

Most sections (e.g. ActivityHeatmap, W12) render their own eyebrow/heading card;
CostTrend (W15) renders only the bare chart plus EmptyState with no heading
wrapper. The task files assigned chrome ownership unevenly and the fan-in
composed the sections as built. This is the main visual-consistency item for a
design pass: decide whether chrome lives in each section or in one wrapper around
`AsyncSection`, then normalize.

### "More than 6 series to other" is enforced server-side

`HorizontalBars` (per-model totals) renders every model uncapped (single accent
color, no series identity, so no tail-fold concept); only `StackedWeeklyBars`
folds a tail into `other`. The 6-series cap that satisfies SPEC 6.5 actually
happens in `app/data/aggregate/activity.ts` before the component sees the data.

### Spec asks for data the response shape does not carry

- **Lower-bound attribution.** SPEC 5.4 mentions naming the excluded model, but
  `ActivityResponse.kpis.estimatedAdHocDollars` carries only `{value, lowerBound}`.
  The marker copy is therefore generic ("one or more models unpriced").
- **Missed cost.md phase.** SPEC 6.8 / 4.3 describe surfacing "a cost.md phase
  the backfill missed," but no upstream detector exists (confirmed: no cost.md
  parser anywhere in `app/data`). ParseHealth renders the `notes` array verbatim;
  the note only appears if something upstream ever populates it.
- **Source badge vocabulary.** SPEC 6.3 names native/backfill/none, but the API
  schema and aggregation layer include a legitimate 4th value `mixed` (a
  spec/plan whose phases span native and backfill sources). CostTable renders it;
  it is a normal state, not a bug.

### DashboardHeader has no error branch

W10 built DashboardHeader as pure success/skeleton. On a costs or activity fetch
error the header shows its inert skeleton (with a disabled Refresh button) until
a retry succeeds, rather than a wordmark-plus-active-button look. Recovery still
works through any section's ErrorState "Retry" (which refetches both endpoints).
Given the header's all-or-nothing two-resource prop contract, adding an error
branch is a W10 contract change, deferred out of surgical fan-in scope.

### Other documented builder decisions

- **Freshness line.** SPEC 6.1's example literally reads "just now"; the header
  implements real relative-time bucketing off `scan.scannedAt` (a static
  component cannot force elapsed wall-clock time to always read "just now").
- **Two "session count" sources.** The header's "scanned N sessions" uses
  `scan.sessionCount` (what was scanned); KpiRow's Sessions tile uses
  `sessions.length` (size of the returned list). They agree in real data but are
  technically distinct fields.
- **SessionsList locale.** The Phase 5 prop contract fixed the props surface to
  `{sessions}`, so currency and date formatting hardcode `en-US` internally
  rather than exposing an optional `locale` prop like the chart kit does. i18n
  would need a contract change.
- **CostTrend zero-cost entries.** A `recordedDollars` of `0` (priced but
  zero-cost, e.g. all cache hits) is treated as priced (dollars encoding, zero
  height), not as "no data" (which is `null`), matching the SPEC 6.3 null-vs-zero
  distinction.
- **Linked session missing from the resolved set.** A `CostEntry` linked session
  with `logFound: true` but absent from the resolved `sessions` array (a data
  inconsistency SPEC does not address) falls back to plain sessionId text: no
  skeleton, no crash, no jump-link.
