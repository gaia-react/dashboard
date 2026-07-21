import {canonicalizeTimestamp} from '~/data/aggregate/timestamp';
import type {CostGroup} from '~/data/parse/cost-ledger';
import type {NormalizedLedgerEntry} from '~/data/parse/ledgers';
import type {
  AdHocReview,
  AdversarialAudit,
  CommandEvent,
  CostEntry,
  LinkedSession,
  PhaseRollup,
} from '~/data/schemas/api';
import type {
  CostAdversarialAudit,
  CostRecord,
  CostSplitBuckets,
} from '~/data/schemas/cost-record';

/**
 * SPEC section 6.3 row assembly: ledger rows + terminal cost rows + slug
 * groups -> `CostEntry[]`. One entry per ledger entry (spec or plan), plus one
 * per distinct `plan_slug` among slug-attributed backfill rows (pre-ledger
 * archived plans, titled by slug). Chronological by `allocated_at`; slug rows
 * sort by their earliest backfill `ts`.
 *
 * Dollar rule (SPEC section 5 rule 3): every dollar figure here comes ONLY
 * from recorded `dollars` fields (tiers 1+2). Nothing in this module is
 * estimated, and recorded figures are never combined with estimates.
 */

export type CostEntriesInput = {
  /** Terminal-row groups from `parseCostLedger` (W1). */
  costGroups: CostGroup[];
  /** Normalized plans ledger rows (W2). */
  planLedgerEntries: NormalizedLedgerEntry[];
  /**
   * W7's attribution join answers "does this session have a transcript?".
   * The costs handler wires it; the all-found default (no "log missing"
   * badge) only applies when aggregating in isolation (tests).
   */
  resolveSessionLogFound?: (sessionId: string) => boolean;
  /** Normalized specs ledger rows (W2). */
  specLedgerEntries: NormalizedLedgerEntry[];
};

export type CostEntriesResult = {
  /**
   * Ad-hoc `code-review-audit` reviews (SPEC-032): null spec_id/plan_id, so no
   * cost-table entry. Surfaced separately, chronological by coverage
   * timestamp. Their dollars now fold into `recordedDollars` (see below).
   */
  adHocReviews: AdHocReview[];
  /**
   * `kind: "command"` events (GAIA SPEC-035 / Phase 8 v2): `gaia-debt`,
   * `gaia-wiki`, and similar command tallies, the same standalone shape as
   * `adHocReviews`. Chronological by coverage timestamp.
   */
  commandEvents: CommandEvent[];
  /**
   * Earliest cost coverage timestamp across every group (terminal row's
   * `started_at`, falling back to `ts`), for the section 6.1 disclosure.
   */
  costSince: null | string;
  /** Section 6.3 rows, chronological by `sortAt`. */
  entries: CostEntry[];
  /**
   * Sum of recorded `dollars` across every visible GAIA event: cost-table
   * entries, ad-hoc reviews, AND command events (Phase 8 v2). Previously this
   * excluded ad-hoc reviews on purpose (SPEC-032): those rows had nowhere to
   * appear in the UI, so counting their dollars would have produced a KPI the
   * user could not reconcile against anything on screen. In v2 every event is
   * visible in one list, so that premise is gone; do not restore the
   * carve-out as a "bug fix". Null only when literally nothing anywhere has a
   * recorded dollar figure, never coerced to zero: a missing figure is not the
   * same as a zero one.
   */
  recordedDollars: null | number;
};

/** Fallback `sortAt` for a ledger entry with no timestamp anywhere. */
const EPOCH = '1970-01-01T00:00:00.000Z';

/** Canonical phase order; unknown kinds render after, in first-seen order. */
const KIND_ORDER: Record<string, number> = {execute: 2, plan: 1, spec: 0};

const UNKNOWN_KIND_ORDER = 3;

const kindOrder = (kind: string): number =>
  KIND_ORDER[kind] ?? UNKNOWN_KIND_ORDER;

/** Sum the present values; null when no group carries one at all. */
const sumNullable = (values: (null | number | undefined)[]): null | number => {
  const present = values.filter((value) => typeof value === 'number');

  if (present.length === 0) {
    return null;
  }

  return present.reduce((total, value) => total + value, 0);
};

/** Sum each group's own `total` field: the row-level scalar the on-disk
 * contract already carries alongside `buckets`. Preferred over re-summing the
 * four buckets, since re-deriving it risks disagreeing with the source. */
const sumRowTotals = (groups: CostGroup[]): number =>
  groups.reduce((total, group) => total + group.terminalRow.total, 0);

/**
 * A bucket-shaped record permissive enough to accept either on-disk shape:
 * the top-level collapsed totals (single `cache_write`) or the per-model /
 * per-agent-type split totals (`cache_write_5m` + `cache_write_1h`).
 * Not exported: only used to type `totalOf` below.
 */
type BucketFigures = {
  cache_read: number;
  cache_write?: number;
  cache_write_1h?: number;
  cache_write_5m?: number;
  fresh_input: number;
  output: number;
};

/**
 * Collapse one bucket-shaped record to its scalar token total, used
 * everywhere a bucket object previously flowed to the client response (the
 * client now sees only scalars, SPEC section 8 / Phase 8 v2). Where the
 * record still splits cache write by TTL (per-model / per-agent-type maps),
 * the two halves collapse into one number first, exactly as the on-disk
 * `by_model` / `by_agent_type` invariant already requires (SPEC section 4.1).
 * Only used where no row-level `total` already exists to prefer instead (the
 * audit drill-down, and per-model / per-agent-type breakdowns).
 */
const totalOf = (buckets: BucketFigures): number =>
  buckets.cache_read +
  (buckets.cache_write ??
    (buckets.cache_write_1h ?? 0) + (buckets.cache_write_5m ?? 0)) +
  buckets.fresh_input +
  buckets.output;

/**
 * A per-model/per-agent-type rollup is only honest when EVERY session in the
 * phase carries the map (a partial merge would not sum to the phase total),
 * so a pre-attribution row nulls the whole rollup. Backfill phases never have
 * one by design (SPEC section 4.1). Each key's split buckets collapse to a
 * scalar token total via `totalOf`; a key repeated across sessions sums.
 */
const mergedBreakdown = (
  groups: CostGroup[],
  read: (group: CostGroup) => Record<string, CostSplitBuckets> | undefined
): null | Record<string, number> => {
  const maps = groups.map((group) => read(group));

  if (maps.includes(undefined)) {
    return null;
  }

  const merged: Record<string, number> = {};

  for (const map of maps as Record<string, CostSplitBuckets>[]) {
    for (const [key, split] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + totalOf(split);
    }
  }

  return merged;
};

/**
 * The renderable SPEC-032 adversarial-audit annotations across a phase's
 * groups: a well-formed one carries buckets (the only field the drill-down
 * cannot render without). Everything else degrades to a default.
 */
const collectAudits = (groups: CostGroup[]): CostAdversarialAudit[] => {
  const audits: CostAdversarialAudit[] = [];

  for (const group of groups) {
    const audit = group.terminalRow.audit?.adversarial;

    if (audit?.buckets !== undefined) {
      audits.push(audit);
    }
  }

  return audits;
};

/**
 * Carry the adversarial-audit drill-down onto a phase rollup (SPEC-032),
 * camelCased and merged across the phase's groups. Each audit is a strict
 * SUBSET of its own session's terminal row and the phase buckets are the sum of
 * those terminal rows, so the merged audit buckets stay <= the phase buckets:
 * a drill-down, never added to any total. Undefined when the phase carries no
 * audit (backfill phases and every non-audited spec/plan phase).
 */
const mergeAudit = (groups: CostGroup[]): AdversarialAudit | undefined => {
  const audits = collectAudits(groups);

  if (audits.length === 0) {
    return undefined;
  }

  const lenses = new Set<string>();
  const intensities = new Set<string>();
  let elapsedSeconds = 0;
  let totalTokens = 0;

  for (const audit of audits) {
    if (audit.buckets) {
      // The audit annotation carries no row-level `total` of its own, so this
      // is the re-sum path `totalOf` exists for.
      totalTokens += totalOf(audit.buckets);
    }

    for (const lens of audit.lenses ?? []) {
      lenses.add(lens);
    }

    if (audit.intensity !== undefined) {
      intensities.add(audit.intensity);
    }

    elapsedSeconds += audit.elapsed_seconds ?? 0;
  }

  return {
    dollars: sumNullable(audits.map((audit) => audit.dollars)),
    elapsedSeconds,
    // One intensity across the merged audits keeps it; a mix (or none, e.g.
    // plan audits) reports null rather than picking a winner.
    intensity: intensities.size === 1 ? [...intensities][0] : null,
    lenses: [...lenses],
    totalTokens,
  };
};

/** One rollup per (kind, source) pair, token totals summed across its sessions. */
const buildPhases = (groups: CostGroup[]): PhaseRollup[] => {
  const pairs = new Map<string, CostGroup[]>();

  for (const group of groups) {
    const pairKey = `${group.kind}|${group.source}`;
    const pair = pairs.get(pairKey) ?? [];

    pair.push(group);
    pairs.set(pairKey, pair);
  }

  const phases = [...pairs.values()].map((pairGroups): PhaseRollup => {
    const {kind, source} = pairGroups[0];
    const isNative = source === 'native';
    const audit = mergeAudit(pairGroups);

    return {
      ...(audit ? {audit} : {}),
      byAgentType:
        isNative ?
          mergedBreakdown(
            pairGroups,
            (group) => group.terminalRow.by_agent_type
          )
        : null,
      byModel:
        isNative ?
          mergedBreakdown(pairGroups, (group) => group.terminalRow.by_model)
        : null,
      durationSeconds: sumNullable(
        pairGroups.map((group) => group.terminalRow.duration_seconds)
      ),
      kind,
      recordedDollars: sumNullable(
        pairGroups.map((group) => group.terminalRow.dollars)
      ),
      source,
      totalTokens: sumRowTotals(pairGroups),
    };
  });

  // Canonical kind order (native before backfill within a kind), so the
  // expanded-row phase table reads spec -> plan -> execute -> unknown.
  return phases.toSorted((a, b) => {
    const byKind = kindOrder(a.kind) - kindOrder(b.kind);

    return byKind === 0 ? a.source.localeCompare(b.source) * -1 : byKind;
  });
};

const buildSessions = (
  groups: CostGroup[],
  resolveSessionLogFound: (sessionId: string) => boolean
): LinkedSession[] =>
  groups
    .map(
      (group): LinkedSession => ({
        kind: group.kind,
        logFound: resolveSessionLogFound(group.sessionId),
        sessionId: group.sessionId,
      })
    )
    .toSorted((a, b) => {
      const byKind = kindOrder(a.kind) - kindOrder(b.kind);

      return byKind === 0 ? a.sessionId.localeCompare(b.sessionId) : byKind;
    });

/** mixed = both native and backfill present; none = no cost from any source. */
const deriveSource = (groups: CostGroup[]): CostEntry['source'] => {
  if (groups.length === 0) {
    return 'none';
  }

  const sources = new Set(groups.map((group) => group.source));

  return sources.size > 1 ? 'mixed' : [...sources][0];
};

/** A group's coverage timestamp: `started_at` where present, else `ts`. Raw
 * upstream value, canonicalized by the caller. */
const groupCoverageAt = (group: CostGroup): string =>
  group.terminalRow.started_at ?? group.terminalRow.ts;

/**
 * Earliest canonical coverage timestamp across the groups. A group whose
 * coverage timestamp is wholly unparseable is excluded rather than
 * corrupting the comparison; null when none of the groups have one.
 */
const earliestCoverageAt = (groups: CostGroup[]): null | string => {
  const canonicalTimestamps = groups
    .map((group) => canonicalizeTimestamp(groupCoverageAt(group)))
    .filter((timestamp): timestamp is string => timestamp !== null);

  if (canonicalTimestamps.length === 0) {
    return null;
  }

  return canonicalTimestamps.reduce(
    (earliest, candidate) =>
      Date.parse(candidate) < Date.parse(earliest) ? candidate : earliest,
    canonicalTimestamps[0]
  );
};

/**
 * An ad-hoc code-review row (SPEC-032): a `code-review-audit` review with no
 * spec/plan association, so it never lands in a cost-table entry. Keyed on the
 * source tag (threaded through parse untouched, never collapsed to "native").
 */
const isAdHocReview = (group: CostGroup): boolean =>
  group.attribution.type === 'unattributed' &&
  group.terminalRow.source === 'code-review-audit';

/** Surface ad-hoc reviews as their own rows, chronological by coverage ts. */
const buildAdHocReviews = (groups: CostGroup[]): AdHocReview[] =>
  groups
    .filter(isAdHocReview)
    .map(
      (group): AdHocReview => ({
        at: canonicalizeTimestamp(groupCoverageAt(group)) ?? EPOCH,
        durationSeconds: group.terminalRow.duration_seconds ?? null,
        recordedDollars: group.terminalRow.dollars ?? null,
        reviewId: group.terminalRow.review_id ?? null,
        sessionId: group.sessionId,
        totalTokens: group.terminalRow.total,
      })
    )
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));

type ArtifactLink = {number: number; repo: string; type: string};

/** Narrow a raw (possibly loose-passthrough) github field to the client's
 * exact artifact-link shape; undefined (no linked artifact) becomes null. */
const toArtifactLink = (
  github: undefined | {number: number; repo: string; type: string}
): ArtifactLink | null =>
  github ? {number: github.number, repo: github.repo, type: github.type} : null;

/**
 * An entry's github link, sourced from its execute-phase rows only (36 of
 * them carry one in real data; spec/plan rows never do, README ground truth).
 * Several execute rows across sessions can carry different links; take the
 * most recent by coverage timestamp (the same field every chronological sort
 * in this file already uses), so the newest linked artifact wins. Null when
 * no execute row carries one.
 */
const entryGithub = (groups: CostGroup[]): ArtifactLink | null => {
  const executeRowsWithGithub = groups.filter(
    (group) =>
      group.kind === 'execute' && group.terminalRow.github !== undefined
  );

  if (executeRowsWithGithub.length === 0) {
    return null;
  }

  const mostRecent = executeRowsWithGithub.reduce((latest, candidate) => {
    const latestAt = canonicalizeTimestamp(groupCoverageAt(latest)) ?? EPOCH;
    const candidateAt =
      canonicalizeTimestamp(groupCoverageAt(candidate)) ?? EPOCH;

    return Date.parse(candidateAt) > Date.parse(latestAt) ? candidate : latest;
  }, executeRowsWithGithub[0]);

  return toArtifactLink(mostRecent.terminalRow.github);
};

const isCommandEvent = (group: CostGroup): boolean =>
  group.terminalRow.kind === 'command';

/**
 * A command row always carries `command` in real data (README ground truth);
 * this only guards its legally optional status (additive schema evolution,
 * SPEC section 4.1). Fall back to the run id, still a meaningful label, and
 * finally to a generic tag, so the row renders rather than being dropped.
 */
const commandLabel = (row: CostRecord): string =>
  row.command ?? row.run_id ?? 'unknown command';

/**
 * Per-model / per-agent-type totals for a single row. Omitted (`undefined`)
 * means "predates per-model attribution", which is NOT the same as an empty
 * object; preserve that distinction rather than collapsing both to `{}` (the
 * detail panel renders a different state for each).
 */
const totalsByKey = (
  map: Record<string, CostSplitBuckets> | undefined
): null | Record<string, number> => {
  if (map === undefined) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(map).map(([key, split]) => [key, totalOf(split)])
  );
};

/**
 * `kind: "command"` rows (GAIA SPEC-035 / Phase 8 v2): `gaia-debt`,
 * `gaia-wiki`, and similar command tallies, standalone events with no
 * spec/plan association, the same shape `buildAdHocReviews` already models.
 * Mirrors it exactly: same coverage-timestamp field, same chronological sort.
 */
const buildCommandEvents = (groups: CostGroup[]): CommandEvent[] =>
  groups
    .filter(isCommandEvent)
    .map((group): CommandEvent => {
      const {sessionId, terminalRow} = group;

      return {
        at: canonicalizeTimestamp(groupCoverageAt(group)) ?? EPOCH,
        byAgentType: totalsByKey(terminalRow.by_agent_type),
        byModel: totalsByKey(terminalRow.by_model),
        command: commandLabel(terminalRow),
        durationSeconds: terminalRow.duration_seconds ?? null,
        github: toArtifactLink(terminalRow.github),
        recordedDollars: terminalRow.dollars ?? null,
        runId: terminalRow.run_id ?? null,
        sessionId,
        totalTokens: terminalRow.total,
      };
    })
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));

type EntrySeed = {
  entryType: CostEntry['entryType'];
  groups: CostGroup[];
  id: null | string;
  key: string;
  sortAt: string;
  status: null | string;
  title: string;
};

const buildEntry = (
  seed: EntrySeed,
  resolveSessionLogFound: (sessionId: string) => boolean
): CostEntry => ({
  entryType: seed.entryType,
  github: entryGithub(seed.groups),
  id: seed.id,
  key: seed.key,
  partial: seed.groups.some((group) => group.terminalRow.partial === true),
  phases: buildPhases(seed.groups),
  sessions: buildSessions(seed.groups, resolveSessionLogFound),
  sortAt: seed.sortAt,
  source: deriveSource(seed.groups),
  status: seed.status,
  title: seed.title,
  totals: {
    durationSeconds: sumNullable(
      seed.groups.map((group) => group.terminalRow.duration_seconds)
    ),
    recordedDollars: sumNullable(
      seed.groups.map((group) => group.terminalRow.dollars)
    ),
    totalTokens: sumRowTotals(seed.groups),
  },
});

const ledgerEntrySeed = (
  entry: NormalizedLedgerEntry,
  entryType: 'plan' | 'spec',
  groups: CostGroup[]
): EntrySeed => ({
  entryType,
  groups,
  id: entry.id,
  key: entry.id,
  sortAt:
    canonicalizeTimestamp(entry.allocatedAt) ??
    earliestCoverageAt(groups) ??
    canonicalizeTimestamp(entry.completedAt) ??
    EPOCH,
  status: entry.status,
  title: entry.title,
});

export const buildCostEntries = ({
  costGroups,
  planLedgerEntries,
  resolveSessionLogFound = () => true,
  specLedgerEntries,
}: CostEntriesInput): CostEntriesResult => {
  const groupsByAttribution = new Map<string, CostGroup[]>();
  const slugOrder: string[] = [];

  for (const group of costGroups) {
    const {attribution} = group;
    let key: null | string = null;

    if (attribution.type === 'spec' || attribution.type === 'plan') {
      key = `${attribution.type}:${attribution.id}`;
    } else if (attribution.type === 'plan-slug') {
      key = `plan-slug:${attribution.slug}`;

      if (!groupsByAttribution.has(key)) {
        slugOrder.push(attribution.slug);
      }
    }

    // Unattributed telemetry has no table row; its recorded dollars still
    // count in the aggregate (they are authoritative cost.jsonl dollars).
    if (key !== null) {
      const bucket = groupsByAttribution.get(key) ?? [];

      bucket.push(group);
      groupsByAttribution.set(key, bucket);
    }
  }

  const attributedGroups = (key: string): CostGroup[] =>
    groupsByAttribution.get(key) ?? [];

  const seeds: EntrySeed[] = [
    ...specLedgerEntries.map((entry) =>
      ledgerEntrySeed(entry, 'spec', attributedGroups(`spec:${entry.id}`))
    ),
    ...planLedgerEntries.map((entry) =>
      ledgerEntrySeed(entry, 'plan', attributedGroups(`plan:${entry.id}`))
    ),
    ...slugOrder.map((slug): EntrySeed => {
      const groups = attributedGroups(`plan-slug:${slug}`);

      return {
        entryType: 'plan-slug',
        groups,
        id: null,
        key: `slug:${slug}`,
        sortAt: earliestCoverageAt(groups) ?? EPOCH,
        status: null,
        title: slug,
      };
    }),
  ];

  const entries = seeds
    .map((seed) => buildEntry(seed, resolveSessionLogFound))
    .toSorted((a, b) => Date.parse(a.sortAt) - Date.parse(b.sortAt));
  const adHocReviews = buildAdHocReviews(costGroups);
  const commandEvents = buildCommandEvents(costGroups);

  return {
    adHocReviews,
    commandEvents,
    costSince: earliestCoverageAt(costGroups),
    entries,
    // Every visible GAIA event reconciles into "Recorded spend" (Phase 8 v2):
    // cost-table entries, ad-hoc reviews, and command events. Null only when
    // NONE of them carry a recorded dollar figure, never coerced to zero.
    recordedDollars: sumNullable([
      ...entries.map((entry) => entry.totals.recordedDollars),
      ...adHocReviews.map((review) => review.recordedDollars),
      ...commandEvents.map((event) => event.recordedDollars),
    ]),
  };
};
