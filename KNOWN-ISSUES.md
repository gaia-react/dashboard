# Known Issues

Tracked defects, deferred findings, and contract decisions carried out of the
GAIA Dashboard v1 build. None are hard blockers: the full gate is clean and
every stated exit criterion is met. Items here are low/medium severity or
documented design tradeoffs, recorded so they are not rediscovered as surprises.

Last updated: Phase 5 fan-in (commit `37524bd`).

## Deferred findings (surface at P5, left unfixed by mandate)

These came out of the adversarial verify pass. The integrator's fix mandate was
blocker/high severity plus any weak or missing exit criterion; everything below
is low/medium and flips no stated criterion, so it was intentionally left.

### CostTable (W11)
- `ExpandedDetail` has a `byAgentType` check nested inside the `byModel` branch,
  making it unreachable given the current data invariant (a row with agent-type
  buckets always has model buckets). Dead but harmless; revisit if the invariant
  ever loosens.
- `ExpandedDetail` rebuilds its linked-sessions `Map` on every render. Perf nit
  only; memoize if a large session set ever makes expansion feel slow.
- No direct unit tests for the non-null paths of `formatDollars` /
  `formatDuration` / `formatTokens` (they are exercised transitively through the
  component tests).

### ModelMix (W13)
- `escapeSeriesKey` does not handle a model literally named `other.model`
  colliding with its own escape sequence. Not reachable through the real
  pipeline (see the server-side cap note below).
- `app/data/aggregate/activity.ts` caps `modelTotals` / `modelWeekly` at 6
  series server-side, which compounds with the chart kit's own tail-fold cap.
  Flagged to that module's owner; not touched during P5.

### ParseHealth (W16)
- Two React key-collision console warnings (`key={counter.source}`, `key={note}`)
  when both merged slices share an identical value. Console-only, no
  rendered-output bug. Fix by namespacing keys with the source side.

### DashboardHeader / KpiRow (W10)
- Contradictory copy is possible when `estimatedAdHocDollars` is simultaneously
  `$0` and `lowerBound: true` (renders a "lower bound" marker on a zero value).
- No negative test proving the lower-bound marker is absent when
  `lowerBound: false`.
- Cosmetic: `text-align` and `truncate` interact awkwardly on very long project
  paths.

## Design decisions and contract gaps (by review, not defects)

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
