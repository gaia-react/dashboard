import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import path from 'node:path';
import {createFileCache} from '~/data/cache';
import type {CostGroup} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import {discoverProjectDirectories} from '~/data/parse/discover';
import type {SessionScan} from '~/data/parse/session-scan';
import {scanProjectDirectory} from '~/data/parse/session-scan';
import type {AttributionJoin} from '~/data/reconcile/attribution';
import {
  joinCostGroupsToSessions,
  partitionSessions,
} from '~/data/reconcile/attribution';
import {sortAlphabetically} from '~/data/sort';
import type {MaterializedFixtureProject} from '../../../../test/helpers/fixture-project';
import {materializeFixtureProject} from '../../../../test/helpers/fixture-project';

/**
 * Session ids referenced by the mini-project cost.jsonl (see the fixture
 * README's scenario map). The first two have transcript files; the rest were
 * deleted/pruned upstream and must badge "log missing".
 */
const SESSION_WITH_WORKTREE_LOG = 'aaaaaaaa-1111-2222-3333-444444444444';
const SESSION_WITH_ROOT_LOG = 'bbbbbbbb-1111-2222-3333-444444444444';
const SESSION_LOG_MISSING_BACKFILL = 'dddddddd-1111-2222-3333-444444444444';
const SESSION_LOG_MISSING_SLUG_PLAN = 'eeeeeeee-1111-2222-3333-444444444444';
const SESSION_LOG_MISSING_SLUG_EXECUTE = 'ffffffff-1111-2222-3333-444444444444';
const SESSION_LOG_MISSING_NATIVE = 'abababab-1111-2222-3333-444444444444';

let project: MaterializedFixtureProject;
let groups: CostGroup[];
let discoveredDirectories: string[];
let join: AttributionJoin;
let scannedSessions: SessionScan[];

beforeAll(async () => {
  project = materializeFixtureProject('mini-project');

  const cache = createFileCache();
  const ledger = await parseCostLedger(
    path.join(project.projectRoot, '.gaia', 'local', 'telemetry', 'cost.jsonl')
  );

  groups = ledger.groups;
  discoveredDirectories = await discoverProjectDirectories(
    path.join(project.claudeConfigDir, 'projects'),
    project.projectRoot,
    cache
  );
  join = joinCostGroupsToSessions(groups, {
    claudeConfigDir: project.claudeConfigDir,
    discoveredDirectories,
  });

  const scansPerDirectory = await Promise.all(
    discoveredDirectories.map(async (directory) =>
      scanProjectDirectory(directory, cache)
    )
  );

  scannedSessions = scansPerDirectory.flat();
});

afterAll(() => {
  project.cleanup();
});

describe('joinCostGroupsToSessions', () => {
  test('maps every referenced session to its attributing entry', () => {
    expect(new Set(join.bySessionId.keys())).toEqual(
      new Set([
        SESSION_LOG_MISSING_BACKFILL,
        SESSION_LOG_MISSING_NATIVE,
        SESSION_LOG_MISSING_SLUG_EXECUTE,
        SESSION_LOG_MISSING_SLUG_PLAN,
        SESSION_WITH_ROOT_LOG,
        SESSION_WITH_WORKTREE_LOG,
      ])
    );
    expect(join.bySessionId.get(SESSION_WITH_WORKTREE_LOG)).toEqual({
      entryType: 'spec',
      key: 'SPEC-100',
    });
    expect(join.bySessionId.get(SESSION_WITH_ROOT_LOG)).toEqual({
      entryType: 'plan',
      key: 'PLAN-001',
    });
    expect(join.bySessionId.get(SESSION_LOG_MISSING_SLUG_PLAN)).toEqual({
      entryType: 'plan-slug',
      key: 'slug:legacy-plan',
    });
  });

  test('resolves logs via session_cwd forward-encode and the scan heuristic', () => {
    // SPEC-100's session carries session_cwd (worktree): forward-encode names
    // the transcript directory deterministically.
    expect(join.linkedSessionsByEntryKey.get('SPEC-100')).toEqual([
      {kind: 'execute', logFound: true, sessionId: SESSION_WITH_WORKTREE_LOG},
    ]);
    // PLAN-001's rows predate SPEC-024 (no session_cwd): the directory-scan
    // heuristic finds the transcript in the confirmed root directory.
    expect(join.linkedSessionsByEntryKey.get('PLAN-001')).toEqual([
      {kind: 'execute', logFound: true, sessionId: SESSION_WITH_ROOT_LOG},
    ]);
  });

  test('badges a referenced session with no transcript file as log missing', () => {
    // Backfill row (no session_cwd, heuristic finds nothing) and a native row
    // whose session_cwd directory exists but holds no transcript for the id:
    // both still count in spec cost, badged logFound: false.
    expect(join.linkedSessionsByEntryKey.get('SPEC-102')).toEqual([
      {kind: 'spec', logFound: false, sessionId: SESSION_LOG_MISSING_BACKFILL},
      {kind: 'review', logFound: false, sessionId: SESSION_LOG_MISSING_NATIVE},
    ]);
    expect(join.linkedSessionsByEntryKey.get('slug:legacy-plan')).toEqual([
      {kind: 'plan', logFound: false, sessionId: SESSION_LOG_MISSING_SLUG_PLAN},
      {
        kind: 'execute',
        logFound: false,
        sessionId: SESSION_LOG_MISSING_SLUG_EXECUTE,
      },
    ]);
  });
});

const makeGroup = (overrides: {
  attribution: CostGroup['attribution'];
  kind: string;
  sessionId: string;
}): CostGroup => ({
  attribution: overrides.attribution,
  kind: overrides.kind,
  rowCount: 1,
  sessionId: overrides.sessionId,
  source: 'native',
  terminalRow: {
    buckets: {cache_read: 0, cache_write: 0, fresh_input: 1, output: 1},
    final: true,
    kind: overrides.kind,
    schema_version: 1,
    seq: 0,
    session_id: overrides.sessionId,
    total: 2,
    ts: '2026-07-05T12:00:00Z',
  },
});

describe('joinCostGroupsToSessions edge cases', () => {
  const emptyLocator = {claudeConfigDir: '/nowhere', discoveredDirectories: []};

  test('an unattributed telemetry row never attributes its session', () => {
    // SPEC section 5: tiers 1 and 2 are attributed records; a both-null
    // degraded row is unattributed telemetry. It has no cost-table entry to
    // link to, so its session stays ad hoc and the partition stays consistent
    // with the entry-derived views.
    const edgeJoin = joinCostGroupsToSessions(
      [
        makeGroup({
          attribution: {type: 'unattributed'},
          kind: 'execute',
          sessionId: '99999999-9999-4999-8999-999999999999',
        }),
      ],
      emptyLocator
    );

    expect(edgeJoin.bySessionId.size).toBe(0);
    expect(edgeJoin.linkedSessionsByEntryKey.size).toBe(0);
  });

  test('the first entry referencing a session wins its attribution badge', () => {
    const sessionId = '77777777-7777-4777-8777-777777777777';
    const edgeJoin = joinCostGroupsToSessions(
      [
        makeGroup({
          attribution: {id: 'SPEC-200', type: 'spec'},
          kind: 'spec',
          sessionId,
        }),
        makeGroup({
          attribution: {id: 'PLAN-009', type: 'plan'},
          kind: 'plan',
          sessionId,
        }),
      ],
      emptyLocator
    );

    // Deterministic: ledger file order decides; both entries still list the
    // session in their detail links.
    expect(edgeJoin.bySessionId.get(sessionId)).toEqual({
      entryType: 'spec',
      key: 'SPEC-200',
    });
    expect([...edgeJoin.linkedSessionsByEntryKey.keys()]).toEqual([
      'SPEC-200',
      'PLAN-009',
    ]);
  });
});

describe('partitionSessions', () => {
  test('attributed vs ad hoc is identical across KPI, session list, and detail links', () => {
    // View 1, sessions list: partition the scanned sessions.
    const {adHoc, attributed} = partitionSessions(scannedSessions, join);
    const attributedScannedIds = sortAlphabetically(
      attributed.map((session) => session.sessionId)
    );

    expect(attributedScannedIds).toEqual([
      SESSION_WITH_WORKTREE_LOG,
      SESSION_WITH_ROOT_LOG,
    ]);
    expect(
      sortAlphabetically(adHoc.map((session) => session.sessionId))
    ).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(attributed.length + adHoc.length).toBe(scannedSessions.length);

    // View 2, KPI aggregate: the join's attributed-session set.
    const kpiAttributedIds = new Set(join.bySessionId.keys());

    expect(kpiAttributedIds.size).toBe(6);

    // View 3, spec detail links: the union of linked sessions across entries.
    const linkedSessions = [...join.linkedSessionsByEntryKey.values()].flat();
    const linkedIds = new Set(linkedSessions.map((linked) => linked.sessionId));

    expect(linkedIds).toEqual(kpiAttributedIds);

    // The link rows with a transcript are exactly the attributed scanned
    // sessions, so all three views agree on the partition.
    const linkedFoundIds = sortAlphabetically(
      linkedSessions
        .filter((linked) => linked.logFound)
        .map((linked) => linked.sessionId)
    );

    expect(linkedFoundIds).toEqual(attributedScannedIds);

    for (const session of attributed) {
      expect(kpiAttributedIds.has(session.sessionId)).toBe(true);
    }

    for (const session of adHoc) {
      expect(kpiAttributedIds.has(session.sessionId)).toBe(false);
    }
  });
});
