import {beforeAll, describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {createFileCache} from '~/data/cache';
import type {CostLedgerResult} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import type {LedgerReadResult} from '~/data/parse/ledgers';
import {readPlanLedger, readSpecLedger} from '~/data/parse/ledgers';
import {scanSession} from '~/data/parse/session-scan';
import {
  buildCostParseHealth,
  buildSessionParseHealth,
} from '~/data/reconcile/parse-health';
import {parseHealthSliceSchema} from '~/data/schemas/api';

const fixturePath = (relative: string): string =>
  fileURLToPath(
    new URL(`../../../../test/fixtures/${relative}`, import.meta.url)
  );

describe('buildCostParseHealth', () => {
  let costLedger: CostLedgerResult;
  let planLedger: LedgerReadResult;
  let specLedger: LedgerReadResult;

  beforeAll(async () => {
    const cache = createFileCache();

    costLedger = await parseCostLedger(fixturePath('cost-jsonl/cost.jsonl'));
    specLedger = await readSpecLedger(
      fixturePath('ledgers/specs-ledger.json'),
      cache
    );
    planLedger = await readPlanLedger(
      fixturePath('ledgers/plans-ledger-post-spec-024.json'),
      cache
    );
  });

  test('aggregates streamJsonl skips and unknown enum values from the cost side', () => {
    const slice = buildCostParseHealth({
      costLedger: costLedger.health,
      planLedger,
      specLedger,
    });

    expect(parseHealthSliceSchema.safeParse(slice).success).toBe(true);
    // cost-jsonl fixture: 17 lines, 1 rejected (unsupported schema_version 2).
    expect(slice.counters).toContainEqual({
      filesScanned: 1,
      filesUnparseable: 0,
      linesRead: 17,
      linesSkipped: 1,
      source: 'cost.jsonl',
    });
    expect(slice.counters).toContainEqual({
      filesScanned: 1,
      filesUnparseable: 0,
      linesRead: 0,
      linesSkipped: 0,
      source: 'specs/ledger.json',
    });
    expect(slice.counters).toContainEqual({
      filesScanned: 1,
      filesUnparseable: 0,
      linesRead: 0,
      linesSkipped: 0,
      source: 'plans/ledger.json',
    });
    // 'review' was promoted to a known kind (Phase 8 v2, W3); the fixture
    // carries no other unrecognized kind, so unknownKinds is empty. Only the
    // out-of-vocabulary ledger statuses remain, verbatim.
    expect(slice.unknownKinds).toEqual([]);
    expect(slice.unknownStatuses).toEqual(['superseded', 'paused']);
  });

  test('records a native-over-backfill collision as an upstream-bug note', () => {
    const slice = buildCostParseHealth({costLedger: costLedger.health});

    // The fixture's SPEC-101 group holds a native and a backfill row; the
    // parser keeps the native one (asserted in cost-ledger.test.ts) and the
    // collision surfaces here for the section 6.8 footer.
    expect(
      slice.notes.filter((note) =>
        note.includes(
          'native row overrides backfill for group spec:SPEC-101|spec|cccccccc-1111-2222-3333-444444444444'
        )
      )
    ).toHaveLength(1);
    // The rejected schema_version 2 line is noted too, not just counted.
    expect(slice.notes).toContain(
      'cost.jsonl line 14: unsupported schema_version 2'
    );
  });

  test('linesSkipped sums malformed lines, invalid rows, and unsupported schema versions', () => {
    // All three skip channels at once, so dropping any term from the sum
    // fails: 1 non-JSON line + 1 schema-invalid row + 1 schema_version 2 row.
    const slice = buildCostParseHealth({
      costLedger: {
        invalidRows: [{lineNumber: 3, message: 'invalid row'}],
        lineErrors: [
          {lineNumber: 2, message: 'Unexpected token', raw: '{"broken'},
        ],
        linesRead: 5,
        nativeBackfillCollisions: [],
        unknownKinds: [],
        unsupportedSchemaVersions: [{lineNumber: 4, schemaVersion: 2}],
      },
    });

    expect(slice.counters[0]).toEqual({
      filesScanned: 1,
      filesUnparseable: 0,
      linesRead: 5,
      linesSkipped: 3,
      source: 'cost.jsonl',
    });
  });

  test('absent source files yield an empty-but-intentional slice', () => {
    // Empty project: no cost.jsonl, no ledgers. Structurally valid, zero
    // counts, nothing that looks like an error (SPEC section 6, P2 exit).
    const slice = buildCostParseHealth({});

    expect(parseHealthSliceSchema.safeParse(slice).success).toBe(true);
    expect(slice.counters).toEqual([
      {
        filesScanned: 0,
        filesUnparseable: 0,
        linesRead: 0,
        linesSkipped: 0,
        source: 'cost.jsonl',
      },
      {
        filesScanned: 0,
        filesUnparseable: 0,
        linesRead: 0,
        linesSkipped: 0,
        source: 'specs/ledger.json',
      },
      {
        filesScanned: 0,
        filesUnparseable: 0,
        linesRead: 0,
        linesSkipped: 0,
        source: 'plans/ledger.json',
      },
    ]);
    expect(slice.notes).toEqual([]);
    expect(slice.unknownKinds).toEqual([]);
    expect(slice.unknownStatuses).toEqual([]);
  });

  test('a ledger read that yielded nothing counts as unparseable and is noted', () => {
    const slice = buildCostParseHealth({
      specLedger: {
        entries: [],
        errors: ['specs/ledger.json: specs ledger failed validation: boom'],
      },
    });

    expect(slice.counters).toContainEqual({
      filesScanned: 1,
      filesUnparseable: 1,
      linesRead: 0,
      linesSkipped: 0,
      source: 'specs/ledger.json',
    });
    expect(slice.notes).toEqual([
      'specs/ledger.json: specs ledger failed validation: boom',
    ]);
  });
});

describe('buildSessionParseHealth', () => {
  test('aggregates malformed lines and exclusion counters across scans', () => {
    const slice = buildSessionParseHealth({
      fileCount: 3,
      scans: [
        {
          counters: {syntheticExcluded: 1, usageMissingExcluded: 2},
          errors: [
            {lineNumber: 7, message: 'Unexpected token', raw: '{"broken'},
          ],
          turnCount: 5,
        },
        {
          counters: {syntheticExcluded: 0, usageMissingExcluded: 0},
          errors: [],
          turnCount: 4,
        },
      ],
    });

    expect(parseHealthSliceSchema.safeParse(slice).success).toBe(true);
    expect(slice.counters).toEqual([
      {
        filesScanned: 3,
        filesUnparseable: 0,
        // 5 + 1 + 2 + 1 malformed, plus 4 from the clean scan.
        linesRead: 13,
        // 1 malformed line + 2 assistant lines without readable usage; the
        // <synthetic> exclusion is by-design filtering, never a skip.
        linesSkipped: 3,
        source: 'session-logs',
      },
    ]);
    expect(slice.notes).toEqual([]);
    expect(slice.unknownKinds).toEqual([]);
    expect(slice.unknownStatuses).toEqual([]);
  });

  test('accepts real session scans as input', async () => {
    // Session 11111111 (W3 fixture): 4 deduped messages, one <synthetic>
    // line, one usage-less line, one subagent transcript file.
    const projectDirectory = fixturePath(
      'sessions/projects/-Users-you-projects-my-app'
    );
    const scan = await scanSession(
      projectDirectory,
      '11111111-1111-4111-8111-111111111111',
      createFileCache()
    );
    const slice = buildSessionParseHealth({fileCount: 2, scans: [scan]});

    expect(slice.counters).toEqual([
      {
        filesScanned: 2,
        filesUnparseable: 0,
        linesRead: 6,
        linesSkipped: 1,
        source: 'session-logs',
      },
    ]);
  });

  test('an empty project yields a structurally valid zero slice', () => {
    const slice = buildSessionParseHealth({fileCount: 0, scans: []});

    expect(parseHealthSliceSchema.safeParse(slice).success).toBe(true);
    expect(slice.counters).toEqual([
      {
        filesScanned: 0,
        filesUnparseable: 0,
        linesRead: 0,
        linesSkipped: 0,
        source: 'session-logs',
      },
    ]);
  });
});
