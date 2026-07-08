import {beforeAll, describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import type {CostEntriesResult} from '~/data/aggregate/cost-entries';
import {buildCostEntries} from '~/data/aggregate/cost-entries';
import {createFileCache} from '~/data/cache';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import {readPlanLedger, readSpecLedger} from '~/data/parse/ledgers';
import type {CostEntry} from '~/data/schemas/api';

const fixturePath = (name: string): string =>
  fileURLToPath(
    new URL(`../../../../test/fixtures/cost-entries/${name}`, import.meta.url)
  );

const findEntry = (entries: CostEntry[], key: string): CostEntry => {
  const entry = entries.find((candidate) => candidate.key === key);

  if (!entry) {
    throw new Error(`expected entry ${key} not found`);
  }

  return entry;
};

/** The fixture pipeline: W1/W2 parser outputs feeding the aggregator. */
const aggregateFixture = async (): Promise<CostEntriesResult> => {
  const cache = createFileCache();
  const {groups} = await parseCostLedger(fixturePath('cost.jsonl'));
  const specs = await readSpecLedger(fixturePath('specs-ledger.json'), cache);
  const plans = await readPlanLedger(fixturePath('plans-ledger.json'), cache);

  return buildCostEntries({
    costGroups: groups,
    planLedgerEntries: plans.entries,
    specLedgerEntries: specs.entries,
  });
};

describe('buildCostEntries', () => {
  let result: CostEntriesResult;

  beforeAll(async () => {
    result = await aggregateFixture();
  });

  test('produces one entry per ledger entry plus one per distinct plan_slug, chronological', () => {
    // Slug rows sort by their earliest backfill ts (2026-06-04T11:00:00Z,
    // the execute phase), not the later plan-phase ts.
    expect(result.entries.map((entry) => entry.key)).toEqual([
      'SPEC-200',
      'SPEC-201',
      'slug:vintage-plan',
      'PLAN-010',
      'SPEC-202',
    ]);
  });

  test('spec-level totals sum terminal rows across (kind, session) groups, never within a group', () => {
    const entry = findEntry(result.entries, 'SPEC-200');

    // Three groups: execute session 1 (max-seq terminal: 20/40/60/80, $1),
    // execute session 2 (final terminal: 5/10/15/20, $2.5), spec session 3
    // (1/2/3/4, no dollars). Summing WITHIN the cumulative execute group
    // would inflate fresh_input to 30+; the terminal-row rule keeps it 26.
    expect(entry.totals.buckets).toEqual({
      cacheRead: 78,
      cacheWrite: 52,
      freshInput: 26,
      output: 104,
    });
    expect(entry.totals.recordedDollars).toBeCloseTo(3.5, 10);
    expect(entry.totals.durationSeconds).toBe(500);
  });

  test('resolves source badges: native, mixed, backfill, and none', () => {
    const bySource = Object.fromEntries(
      result.entries.map((entry) => [entry.key, entry.source])
    );

    expect(bySource).toEqual({
      'PLAN-010': 'none',
      'slug:vintage-plan': 'backfill',
      'SPEC-200': 'native',
      'SPEC-201': 'mixed',
      'SPEC-202': 'none',
    });
  });

  test('titles a slug row by its slug with a null id and status', () => {
    const entry = findEntry(result.entries, 'slug:vintage-plan');

    expect(entry.entryType).toBe('plan-slug');
    expect(entry.id).toBeNull();
    expect(entry.status).toBeNull();
    expect(entry.title).toBe('vintage-plan');
    expect(entry.sortAt).toBe('2026-06-04T11:00:00.000Z');
    expect(entry.totals.recordedDollars).toBe(3);
    expect(entry.totals.durationSeconds).toBe(600);
  });

  test('rolls phases up per kind in canonical order with per-source figures', () => {
    const entry = findEntry(result.entries, 'SPEC-200');

    expect(entry.phases.map((phase) => [phase.kind, phase.source])).toEqual([
      ['spec', 'native'],
      ['execute', 'native'],
    ]);

    const [specPhase, executePhase] = entry.phases;

    expect(specPhase.buckets).toEqual({
      cacheRead: 3,
      cacheWrite: 2,
      freshInput: 1,
      output: 4,
    });
    expect(specPhase.recordedDollars).toBeNull();
    expect(specPhase.durationSeconds).toBeNull();

    // Execute buckets sum the two sessions' terminal rows.
    expect(executePhase.buckets).toEqual({
      cacheRead: 75,
      cacheWrite: 50,
      freshInput: 25,
      output: 100,
    });
    expect(executePhase.recordedDollars).toBeCloseTo(3.5, 10);
    expect(executePhase.durationSeconds).toBe(500);
  });

  test('maps native breakdowns to camelCase and nulls them on backfill phases', () => {
    const entry = findEntry(result.entries, 'SPEC-201');
    const specPhase = entry.phases.find((phase) => phase.kind === 'spec');
    const executePhase = entry.phases.find((phase) => phase.kind === 'execute');

    // Native phase: TTL-split cache-write keys camelCased at the boundary.
    expect(specPhase?.byModel).toEqual({
      'claude-sonnet-4-6': {
        cacheRead: 300,
        cacheWrite1h: 80,
        cacheWrite5m: 120,
        freshInput: 100,
        output: 400,
      },
    });
    expect(specPhase?.byAgentType).toEqual({
      main: {
        cacheRead: 300,
        cacheWrite1h: 80,
        cacheWrite5m: 120,
        freshInput: 100,
        output: 400,
      },
    });

    // Backfill rows carry no by_model/by_agent_type, by design.
    expect(executePhase?.source).toBe('backfill');
    expect(executePhase?.byModel).toBeNull();
    expect(executePhase?.byAgentType).toBeNull();
  });

  test('nulls a native breakdown when a pre-attribution session would make it partial', () => {
    const entry = findEntry(result.entries, 'SPEC-200');
    const executePhase = entry.phases.find((phase) => phase.kind === 'execute');

    // Session 2 carries by_model but session 1 predates attribution; a
    // partial merge would not sum to the phase buckets, so it degrades.
    expect(executePhase?.byModel).toBeNull();
    expect(executePhase?.byAgentType).toBeNull();
  });

  test('surfaces the partial flag when any linked group is partial', () => {
    expect(findEntry(result.entries, 'SPEC-200').partial).toBe(true);
    expect(findEntry(result.entries, 'SPEC-201').partial).toBe(false);
  });

  test('links sessions per (kind, session) group through the logFound resolver', async () => {
    const cache = createFileCache();
    const {groups} = await parseCostLedger(fixturePath('cost.jsonl'));
    const specs = await readSpecLedger(fixturePath('specs-ledger.json'), cache);
    const plans = await readPlanLedger(fixturePath('plans-ledger.json'), cache);

    const withResolver = buildCostEntries({
      costGroups: groups,
      planLedgerEntries: plans.entries,
      resolveSessionLogFound: (sessionId) =>
        sessionId === '20000002-0000-4000-8000-000000000002',
      specLedgerEntries: specs.entries,
    });

    const entry = findEntry(withResolver.entries, 'SPEC-200');

    expect(entry.sessions).toEqual([
      {
        kind: 'spec',
        logFound: false,
        sessionId: '20000003-0000-4000-8000-000000000003',
      },
      {
        kind: 'execute',
        logFound: false,
        sessionId: '20000001-0000-4000-8000-000000000001',
      },
      {
        kind: 'execute',
        logFound: true,
        sessionId: '20000002-0000-4000-8000-000000000002',
      },
    ]);
  });

  test('sums recorded dollars only from dollars fields, never estimating from buckets', () => {
    // 3.5 (SPEC-200) + 4.25 (SPEC-201 backfill) + 3 (vintage-plan). Entries
    // with tokens but no recorded dollars stay null rather than gaining an
    // estimate (SPEC section 5 rule 3).
    expect(result.recordedDollars).toBeCloseTo(10.75, 10);
    expect(
      findEntry(result.entries, 'SPEC-200').phases.find(
        (phase) => phase.kind === 'spec'
      )?.recordedDollars
    ).toBeNull();
  });

  test('carries the SPEC-032 adversarial audit onto its phase, camelCased', () => {
    const entry = findEntry(result.entries, 'SPEC-201');
    const specPhase = entry.phases.find((phase) => phase.kind === 'spec');

    expect(specPhase?.audit).toEqual({
      buckets: {cacheRead: 120, cacheWrite: 80, freshInput: 40, output: 150},
      dollars: null,
      elapsedSeconds: 30,
      intensity: 'deep',
      lenses: ['DP', 'CG'],
    });
  });

  test('never folds the audit subset into the phase or entry totals', () => {
    const entry = findEntry(result.entries, 'SPEC-201');
    const specPhase = entry.phases.find((phase) => phase.kind === 'spec');

    // The phase buckets are the terminal-row buckets, unchanged by the nested
    // (subset) audit; every audit bucket is <= its phase bucket.
    expect(specPhase?.buckets).toEqual({
      cacheRead: 300,
      cacheWrite: 200,
      freshInput: 100,
      output: 400,
    });
    expect(specPhase?.audit?.buckets.output).toBeLessThanOrEqual(
      specPhase?.buckets.output ?? 0
    );
    // The execute (backfill) phase has no audit at all.
    expect(
      entry.phases.find((phase) => phase.kind === 'execute')?.audit
    ).toBeUndefined();
  });

  test('surfaces ad-hoc reviews without inflating recorded dollars', () => {
    // The ad-hoc code-review-audit row ($0.90, null spec/plan) has no entry.
    expect(result.entries.some((entry) => entry.key.includes('adhoc'))).toBe(
      false
    );
    expect(result.adHocReviews).toHaveLength(1);
    expect(result.adHocReviews[0]).toMatchObject({
      recordedDollars: 0.9,
      reviewId: 'agent-aggadhoc01',
      sessionId: '90000009-0000-4000-8000-000000000009',
    });
    expect(result.adHocReviews[0].buckets).toEqual({
      cacheRead: 24,
      cacheWrite: 12,
      freshInput: 6,
      output: 9,
    });

    // Recorded dollars reconciles to the visible entries (3.5 + 4.25 + 3),
    // NOT the old sum-every-terminal-row that would add the $0.90 ad-hoc
    // review and read $11.65.
    expect(result.recordedDollars).toBeCloseTo(10.75, 10);
    const entrySum = result.entries.reduce(
      (total, entry) => total + (entry.totals.recordedDollars ?? 0),
      0
    );

    expect(result.recordedDollars).toBeCloseTo(entrySum, 10);
  });

  test('reports the earliest coverage timestamp across all groups', () => {
    // The SPEC-200 spec row has a null started_at; its ts (06-01T09:00) is
    // the earliest coverage point in the fixture.
    expect(result.costSince).toBe('2026-06-01T09:00:00.000Z');
  });

  test('a ledger entry with no cost from any source renders as an honest gap', () => {
    const entry = findEntry(result.entries, 'SPEC-202');

    expect(entry.phases).toEqual([]);
    expect(entry.sessions).toEqual([]);
    expect(entry.totals).toEqual({
      buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 0, output: 0},
      durationSeconds: null,
      recordedDollars: null,
    });
  });
});
