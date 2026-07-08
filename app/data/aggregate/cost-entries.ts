import {canonicalizeTimestamp} from '~/data/aggregate/timestamp';
import type {CostGroup} from '~/data/parse/cost-ledger';
import type {NormalizedLedgerEntry} from '~/data/parse/ledgers';
import type {
  AdHocReview,
  AdversarialAudit,
  Buckets,
  CostEntry,
  LinkedSession,
  ModelBuckets,
  PhaseRollup,
} from '~/data/schemas/api';
import type {
  CostAdversarialAudit,
  CostBucketTotals,
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
   * cost-table entry. Surfaced separately (never in `recordedDollars`) so their
   * net-new recorded spend stays visible. Chronological by coverage timestamp.
   */
  adHocReviews: AdHocReview[];
  /**
   * Earliest cost coverage timestamp across every group (terminal row's
   * `started_at`, falling back to `ts`), for the section 6.1 disclosure.
   */
  costSince: null | string;
  /** Section 6.3 rows, chronological by `sortAt`. */
  entries: CostEntry[];
  /**
   * Sum of recorded `dollars` over the visible cost-table entries (tiers 1+2
   * only), so the "Recorded spend" KPI reconciles to exactly what the table
   * shows. Ad-hoc reviews (surfaced separately) and any unattributed telemetry
   * that has no row are deliberately excluded.
   */
  recordedDollars: number;
};

/** Fallback `sortAt` for a ledger entry with no timestamp anywhere. */
const EPOCH = '1970-01-01T00:00:00.000Z';

/** Canonical phase order; unknown kinds render after, in first-seen order. */
const KIND_ORDER: Record<string, number> = {execute: 2, plan: 1, spec: 0};

const UNKNOWN_KIND_ORDER = 3;

const kindOrder = (kind: string): number =>
  KIND_ORDER[kind] ?? UNKNOWN_KIND_ORDER;

const emptyBuckets = (): Buckets => ({
  cacheRead: 0,
  cacheWrite: 0,
  freshInput: 0,
  output: 0,
});

/** Map one on-disk collapsed-cache-write bucket row to the camelCase boundary. */
const bucketsFromTotals = (row: CostBucketTotals): Buckets => ({
  cacheRead: row.cache_read,
  cacheWrite: row.cache_write,
  freshInput: row.fresh_input,
  output: row.output,
});

const addBuckets = (into: Buckets, row: CostBucketTotals): void => {
  into.cacheRead += row.cache_read;
  into.cacheWrite += row.cache_write;
  into.freshInput += row.fresh_input;
  into.output += row.output;
};

const sumGroupBuckets = (groups: CostGroup[]): Buckets => {
  const totals = emptyBuckets();

  for (const group of groups) {
    addBuckets(totals, group.terminalRow.buckets);
  }

  return totals;
};

/** Sum the present values; null when no group carries one at all. */
const sumNullable = (values: (null | number | undefined)[]): null | number => {
  const present = values.filter((value) => typeof value === 'number');

  if (present.length === 0) {
    return null;
  }

  return present.reduce((total, value) => total + value, 0);
};

const addSplitBuckets = (into: ModelBuckets, split: CostSplitBuckets): void => {
  into.cacheRead += split.cache_read;
  into.cacheWrite1h += split.cache_write_1h;
  into.cacheWrite5m += split.cache_write_5m;
  into.freshInput += split.fresh_input;
  into.output += split.output;
};

/** Merge per-model / per-agent-type maps across sessions by summing keys. */
const mergeSplitBucketMaps = (
  maps: Record<string, CostSplitBuckets>[]
): Record<string, ModelBuckets> => {
  const merged: Record<string, ModelBuckets> = {};

  for (const map of maps) {
    for (const [key, split] of Object.entries(map)) {
      merged[key] ??= {
        cacheRead: 0,
        cacheWrite1h: 0,
        cacheWrite5m: 0,
        freshInput: 0,
        output: 0,
      };
      addSplitBuckets(merged[key], split);
    }
  }

  return merged;
};

/**
 * A per-model/per-agent-type rollup is only honest when EVERY session in the
 * phase carries the map (a partial merge would not sum to the phase buckets),
 * so a pre-attribution row nulls the whole rollup. Backfill phases never have
 * one by design (SPEC section 4.1).
 */
const mergedBreakdown = (
  groups: CostGroup[],
  read: (group: CostGroup) => Record<string, CostSplitBuckets> | undefined
): null | Record<string, ModelBuckets> => {
  const maps = groups.map((group) => read(group));

  if (maps.includes(undefined)) {
    return null;
  }

  return mergeSplitBucketMaps(maps as Record<string, CostSplitBuckets>[]);
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

  const buckets = emptyBuckets();
  const lenses = new Set<string>();
  const intensities = new Set<string>();
  let elapsedSeconds = 0;

  for (const audit of audits) {
    if (audit.buckets) {
      addBuckets(buckets, audit.buckets);
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
    buckets,
    dollars: sumNullable(audits.map((audit) => audit.dollars)),
    elapsedSeconds,
    // One intensity across the merged audits keeps it; a mix (or none, e.g.
    // plan audits) reports null rather than picking a winner.
    intensity: intensities.size === 1 ? [...intensities][0] : null,
    lenses: [...lenses],
  };
};

/** One rollup per (kind, source) pair, buckets summed across its sessions. */
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
      buckets: sumGroupBuckets(pairGroups),
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
        buckets: bucketsFromTotals(group.terminalRow.buckets),
        durationSeconds: group.terminalRow.duration_seconds ?? null,
        recordedDollars: group.terminalRow.dollars ?? null,
        reviewId: group.terminalRow.review_id ?? null,
        sessionId: group.sessionId,
      })
    )
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
    buckets: sumGroupBuckets(seed.groups),
    durationSeconds: sumNullable(
      seed.groups.map((group) => group.terminalRow.duration_seconds)
    ),
    recordedDollars: sumNullable(
      seed.groups.map((group) => group.terminalRow.dollars)
    ),
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

  return {
    adHocReviews: buildAdHocReviews(costGroups),
    costSince: earliestCoverageAt(costGroups),
    entries,
    // Sum the visible entries so "Recorded spend" reconciles to the cost table
    // (attributed reviews already fold into their spec/plan entry). Ad-hoc
    // reviews are surfaced above, not counted here.
    recordedDollars:
      sumNullable(entries.map((entry) => entry.totals.recordedDollars)) ?? 0,
  };
};
