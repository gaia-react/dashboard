import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {createFileCache} from '~/data/cache';
import type {HandlerContext} from '~/data/handlers/costs';
import {getCosts} from '~/data/handlers/costs';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';
import type {MaterializedFixtureProject} from '../../../../test/helpers/fixture-project';
import {materializeFixtureProject} from '../../../../test/helpers/fixture-project';

const entryByKey = (
  response: CostsResponse,
  key: string
): CostsResponse['entries'][number] | undefined =>
  response.entries.find((entry) => entry.key === key);

const contextFor = (project: MaterializedFixtureProject): HandlerContext => ({
  cache: createFileCache(),
  config: {
    claudeConfigDir: project.claudeConfigDir,
    projectName: project.projectName,
    projectRoot: project.projectRoot,
  },
});

describe('getCosts on the mini-project composite fixture', () => {
  let project: MaterializedFixtureProject;
  let response: CostsResponse;

  beforeAll(async () => {
    project = materializeFixtureProject('mini-project');
    response = await getCosts(contextFor(project));
  });

  afterAll(() => {
    project.cleanup();
  });

  test('produces a Zod-valid CostsResponse', () => {
    expect(() => costsResponseSchema.parse(response)).not.toThrow();
  });

  test('assembles the expected rows in chronological order with source badges', () => {
    expect(response.entries.map((entry) => [entry.key, entry.source])).toEqual([
      ['PLAN-001', 'native'],
      ['SPEC-100', 'native'],
      ['SPEC-102', 'mixed'],
      ['slug:legacy-plan', 'backfill'],
      ['SPEC-103', 'none'],
    ]);
  });

  test('reports project, coverage, and ledger KPIs from the fixture', () => {
    expect(response.project).toEqual({
      claudeConfigDir: project.claudeConfigDir,
      name: project.projectName,
      root: project.projectRoot,
    });
    // Earliest coverage: PLAN-001's terminal row started_at.
    expect(response.coverage.costSince).toBe('2026-06-20T09:00:00.000Z');
    expect(response.kpis.specs).toEqual({merged: 2, total: 3});
    // 1 ledger plan + 1 pre-ledger slug plan.
    expect(response.kpis.plans).toEqual({total: 2});
    // 1.37 (SPEC-100 native) + 13.58 (legacy-plan backfill), recorded only.
    expect(response.kpis.recordedDollars).toBeCloseTo(14.95, 10);
  });

  test('reads the rate table status and content-hash id', () => {
    expect(response.rateTable.status).toBe('ok');
    expect(response.rateTable.id).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  test('badges linked sessions with transcript presence via the attribution join', () => {
    // SPEC-100's execute session has a worktree transcript (forward-encode);
    // PLAN-001's pre-SPEC-024 session resolves via the directory heuristic.
    expect(entryByKey(response, 'SPEC-100')?.sessions).toEqual([
      {
        kind: 'execute',
        logFound: true,
        sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
      },
    ]);
    expect(entryByKey(response, 'PLAN-001')?.sessions).toEqual([
      {
        kind: 'execute',
        logFound: true,
        sessionId: 'bbbbbbbb-1111-2222-3333-444444444444',
      },
    ]);
    // SPEC-102 and the slug plan reference deleted/pruned transcripts: the
    // sessions still count in cost, badged "log missing".
    expect(
      entryByKey(response, 'SPEC-102')?.sessions.map(({logFound}) => logFound)
    ).toEqual([false, false]);
    expect(
      entryByKey(response, 'slug:legacy-plan')?.sessions.every(
        ({logFound}) => !logFound
      )
    ).toBe(true);
  });

  test('counts the malformed cost.jsonl line in the parse-health slice', () => {
    const costCounter = response.parseHealth.counters.find(
      (counter) => counter.source === 'cost.jsonl'
    );

    expect(costCounter).toEqual({
      filesScanned: 1,
      filesUnparseable: 0,
      linesRead: 11,
      linesSkipped: 1,
      source: 'cost.jsonl',
    });
    expect(response.parseHealth.unknownKinds).toEqual(['review']);
    expect(response.parseHealth.unknownStatuses).toEqual([]);
  });
});

describe('getCosts on the empty-project fixture', () => {
  let project: MaterializedFixtureProject;
  let response: CostsResponse;

  beforeAll(async () => {
    project = materializeFixtureProject('empty-project');
    response = await getCosts(contextFor(project));
  });

  afterAll(() => {
    project.cleanup();
  });

  test('returns a Zod-valid, empty-but-intentional response', () => {
    expect(() => costsResponseSchema.parse(response)).not.toThrow();
    expect(response.entries).toEqual([]);
    expect(response.coverage.costSince).toBeNull();
    expect(response.kpis).toEqual({
      plans: {total: 0},
      recordedDollars: 0,
      specs: {merged: 0, total: 0},
    });
  });

  test('treats absent .gaia/local files as unscanned, not unparseable', () => {
    // A fresh adopter has no cost data yet; that is a legal state, not an
    // error, so nothing is flagged unparseable and no notes appear.
    expect(response.parseHealth.notes).toEqual([]);

    for (const counter of response.parseHealth.counters) {
      expect(counter.filesScanned).toBe(0);
      expect(counter.filesUnparseable).toBe(0);
    }

    // The committed rate table is still present and readable.
    expect(response.rateTable.status).toBe('ok');
  });
});
