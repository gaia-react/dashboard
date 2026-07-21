import {beforeAll, describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import type {CostEntriesResult} from '~/data/aggregate/cost-entries';
import {buildCostEntries} from '~/data/aggregate/cost-entries';
import {createFileCache} from '~/data/cache';
import type {CostGroup} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import type {NormalizedLedgerEntry} from '~/data/parse/ledgers';
import {readPlanLedger, readSpecLedger} from '~/data/parse/ledgers';
import type {CommandEvent, CostEntry} from '~/data/schemas/api';

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

const findCommandEvent = (
  events: CommandEvent[],
  runId: string
): CommandEvent => {
  const event = events.find((candidate) => candidate.runId === runId);

  if (!event) {
    throw new Error(`expected command event ${runId} not found`);
  }

  return event;
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

    // Three groups: execute session 1 (max-seq terminal: total 200, $1),
    // execute session 2 (final terminal: total 50, $2.5), spec session 3
    // (total 10, no dollars). Summing WITHIN the cumulative execute group
    // would inflate the total further; the terminal-row rule keeps it 260.
    expect(entry.totals.totalTokens).toBe(260);
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

    expect(specPhase.totalTokens).toBe(10);
    expect(specPhase.recordedDollars).toBeNull();
    expect(specPhase.durationSeconds).toBeNull();

    // Execute totalTokens sums the two sessions' own row totals (200 + 50).
    expect(executePhase.totalTokens).toBe(250);
    expect(executePhase.recordedDollars).toBeCloseTo(3.5, 10);
    expect(executePhase.durationSeconds).toBe(500);
  });

  test('maps native breakdowns to camelCase scalar totals and nulls them on backfill phases', () => {
    const entry = findEntry(result.entries, 'SPEC-201');
    const specPhase = entry.phases.find((phase) => phase.kind === 'spec');
    const executePhase = entry.phases.find((phase) => phase.kind === 'execute');

    // Native phase: each model/agent-type's split cache-write collapses to
    // one scalar total (100 + 120 + 80 + 300 + 400 = 1000, the row's own
    // total, since this phase has a single session).
    expect(specPhase?.byModel).toEqual({'claude-sonnet-4-6': 1000});
    expect(specPhase?.byAgentType).toEqual({main: 1000});

    // Backfill rows carry no by_model/by_agent_type, by design.
    expect(executePhase?.source).toBe('backfill');
    expect(executePhase?.byModel).toBeNull();
    expect(executePhase?.byAgentType).toBeNull();
  });

  test('nulls a native breakdown when a pre-attribution session would make it partial', () => {
    const entry = findEntry(result.entries, 'SPEC-200');
    const executePhase = entry.phases.find((phase) => phase.kind === 'execute');

    // Session 2 carries by_model but session 1 predates attribution; a
    // partial merge would not sum to the phase total, so it degrades.
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

  test("sources an entry's github link from its execute-phase rows, taking the most recent across sessions", () => {
    // SPEC-200's execute phase has two sessions, each with a different
    // github link: session 1 (coverage 06-01) has #10, session 2 (coverage
    // 06-02, later) has #20. The most recent wins.
    const entry = findEntry(result.entries, 'SPEC-200');

    expect(entry.github).toEqual({
      number: 20,
      repo: 'gaia-react/gaia',
      type: 'pr',
    });
  });

  test('entry github is null when no execute row carries one', () => {
    // SPEC-201's only execute row is a backfill row with no github field.
    expect(findEntry(result.entries, 'SPEC-201').github).toBeNull();
    // A ledger entry with no groups at all has no execute row either.
    expect(findEntry(result.entries, 'PLAN-010').github).toBeNull();
  });

  test('never estimates recorded dollars from token totals', () => {
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
      dollars: null,
      elapsedSeconds: 30,
      intensity: 'deep',
      lenses: ['DP', 'CG'],
      totalTokens: 390,
    });
  });

  test('never folds the audit subset into the phase or entry totals', () => {
    const entry = findEntry(result.entries, 'SPEC-201');
    const specPhase = entry.phases.find((phase) => phase.kind === 'spec');

    // The phase total is the terminal row's own total, unchanged by the
    // nested (subset) audit; the audit's collapsed total stays <= it.
    expect(specPhase?.totalTokens).toBe(1000);
    expect(specPhase?.audit?.totalTokens).toBeLessThanOrEqual(
      specPhase?.totalTokens ?? 0
    );
    // The execute (backfill) phase has no audit at all.
    expect(
      entry.phases.find((phase) => phase.kind === 'execute')?.audit
    ).toBeUndefined();
  });

  test('surfaces ad-hoc reviews as their own rows, never a cost-table entry', () => {
    // The ad-hoc code-review-audit row ($0.90, null spec/plan) has no entry.
    expect(result.entries.some((entry) => entry.key.includes('adhoc'))).toBe(
      false
    );
    expect(result.adHocReviews).toHaveLength(1);
    expect(result.adHocReviews[0]).toEqual({
      at: '2026-06-06T10:00:00.000Z',
      durationSeconds: 120,
      recordedDollars: 0.9,
      reviewId: 'agent-aggadhoc01',
      sessionId: '90000009-0000-4000-8000-000000000009',
      totalTokens: 51,
    });
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
    expect(entry.github).toBeNull();
    expect(entry.totals).toEqual({
      durationSeconds: null,
      recordedDollars: null,
      totalTokens: 0,
    });
  });

  describe('buildCommandEvents', () => {
    test('maps a command row to a full CommandEvent, every field mapped', () => {
      const event = findCommandEvent(
        result.commandEvents,
        'gaia-debt-20260710T100000Z-aaaa'
      );

      expect(event).toEqual({
        at: '2026-07-10T10:00:00.000Z',
        byAgentType: {main: 100},
        byModel: {'claude-opus-4-8': 100},
        command: 'gaia-debt',
        durationSeconds: 300,
        github: {number: 42, repo: 'gaia-react/gaia', type: 'pr'},
        recordedDollars: 1.1,
        runId: 'gaia-debt-20260710T100000Z-aaaa',
        sessionId: '40000010-0000-4000-8000-000000000010',
        totalTokens: 100,
      });
    });

    test("totalTokens equals the row's own total on a row that carries one", () => {
      expect(
        findCommandEvent(
          result.commandEvents,
          'gaia-debt-20260710T100000Z-aaaa'
        ).totalTokens
      ).toBe(100);
    });

    test("totalTokens is the row's own total even when it diverges from the bucket sum, proving a passthrough rather than a re-sum", () => {
      // gaia-harden's buckets (2+2+2+2=8) deliberately disagree with its own
      // total (500): every other fixture row happens to have bucket-sum ===
      // total, so without this row a resum-the-buckets regression would pass
      // undetected.
      expect(
        findCommandEvent(
          result.commandEvents,
          'gaia-harden-20260715T090000Z-dddd'
        ).totalTokens
      ).toBe(500);
    });

    test('a command row with no github produces github: null', () => {
      expect(
        findCommandEvent(
          result.commandEvents,
          'gaia-wiki-20260712T090000Z-bbbb'
        ).github
      ).toBeNull();
    });

    test('a command row with no by_model/by_agent_type produces null, distinct from {}', () => {
      const withoutBreakdowns = findCommandEvent(
        result.commandEvents,
        'gaia-forensics-20260708T080000Z-cccc'
      );

      expect(withoutBreakdowns.byModel).toBeNull();
      expect(withoutBreakdowns.byAgentType).toBeNull();

      // A row that DOES carry by_model but omits by_agent_type keeps the
      // two independent: byModel is a populated map, byAgentType is null.
      const modelOnly = findCommandEvent(
        result.commandEvents,
        'gaia-wiki-20260712T090000Z-bbbb'
      );

      expect(modelOnly.byModel).toEqual({'claude-sonnet-4-6': 20});
      expect(modelOnly.byAgentType).toBeNull();
    });

    test('a command row with no command value falls back to its run_id', () => {
      expect(
        findCommandEvent(
          result.commandEvents,
          'gaia-forensics-20260708T080000Z-cccc'
        ).command
      ).toBe('gaia-forensics-20260708T080000Z-cccc');
    });

    test('sorts command events chronologically', () => {
      expect(result.commandEvents.map((event) => event.runId)).toEqual([
        'gaia-forensics-20260708T080000Z-cccc',
        'gaia-debt-20260710T100000Z-aaaa',
        'gaia-wiki-20260712T090000Z-bbbb',
        'gaia-harden-20260715T090000Z-dddd',
      ]);
    });
  });

  test('recordedDollars reconciles to entries plus ad-hoc reviews plus command events', () => {
    const contributions = [
      ...result.entries.map((entry) => entry.totals.recordedDollars),
      ...result.adHocReviews.map((review) => review.recordedDollars),
      ...result.commandEvents.map((event) => event.recordedDollars),
    ].filter((value): value is number => value !== null);

    // Sanity: the fixture actually exercises all three contributors.
    expect(
      result.entries.some((entry) => entry.totals.recordedDollars !== null)
    ).toBe(true);
    expect(result.adHocReviews.length).toBeGreaterThan(0);
    expect(result.commandEvents.length).toBeGreaterThan(0);

    const expectedTotal = contributions.reduce(
      (total, value) => total + value,
      0
    );

    expect(result.recordedDollars).toBeCloseTo(expectedTotal, 10);
    // 10.75 (entries) + 0.9 (ad-hoc review) + 1.1 + 0.4 (two priced command
    // events; gaia-forensics and gaia-harden both have null dollars, so they
    // contribute nothing). The SPEC-032 carve-out excluded ad-hoc reviews on
    // purpose; v2 removes it because every event is now visible in one list.
    expect(result.recordedDollars).toBeCloseTo(13.15, 10);
  });

  test('recordedDollars is null, never zero, when nothing anywhere has a recorded dollar figure', () => {
    const group: CostGroup = {
      attribution: {id: 'SPEC-900', type: 'spec'},
      kind: 'spec',
      rowCount: 1,
      sessionId: 'session-900',
      source: 'native',
      terminalRow: {
        buckets: {cache_read: 1, cache_write: 1, fresh_input: 1, output: 1},
        dollars: null,
        final: true,
        kind: 'spec',
        schema_version: 1,
        seq: 0,
        session_id: 'session-900',
        spec_id: 'SPEC-900',
        total: 4,
        ts: '2026-07-01T00:00:00Z',
      },
    };
    const specEntry: NormalizedLedgerEntry = {
      allocatedAt: '2026-07-01T00:00:00Z',
      completedAt: null,
      id: 'SPEC-900',
      source: 'allocated',
      status: 'draft',
      title: 'Fixture: null dollars everywhere',
    };

    const nullDollarResult = buildCostEntries({
      costGroups: [group],
      planLedgerEntries: [],
      specLedgerEntries: [specEntry],
    });

    expect(nullDollarResult.recordedDollars).toBeNull();
  });
});
