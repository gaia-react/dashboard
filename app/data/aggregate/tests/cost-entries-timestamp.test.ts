import {describe, expect, test} from 'vitest';
import {buildCostEntries} from '~/data/aggregate/cost-entries';
import type {CostGroup} from '~/data/parse/cost-ledger';
import type {NormalizedLedgerEntry} from '~/data/parse/ledgers';
import {costEntrySchema, costsResponseSchema} from '~/data/schemas/api';
import type {CostRecord} from '~/data/schemas/cost-record';

/**
 * P2 handoff item 1 (timestamp hardening), cost side: `CostEntry.sortAt`
 * comes from the ledger's raw `allocated_at` (W2, a loose `z.string()`), and
 * `coverage.costSince` comes from cost rows' raw `started_at` / `ts`. Both
 * feed `z.iso.datetime()` at the API boundary, which rejects date-only and
 * offset-form values a real ledger/ledger can legally carry.
 */

const fallbackTimestamp = '1970-01-01T00:00:00.000Z';

const makeSpecEntry = (
  partial: Partial<NormalizedLedgerEntry> = {}
): NormalizedLedgerEntry => ({
  allocatedAt: null,
  completedAt: null,
  id: 'SPEC-900',
  source: null,
  status: null,
  title: 'Timestamp hardening',
  ...partial,
});

const makeGroup = (
  terminalRowPartial: Partial<CostRecord> = {}
): CostGroup => ({
  attribution: {type: 'unattributed'},
  kind: 'execute',
  rowCount: 1,
  sessionId: 'session-1',
  source: 'native',
  terminalRow: {
    buckets: {cache_read: 0, cache_write: 0, fresh_input: 0, output: 0},
    final: true,
    kind: 'execute',
    schema_version: 1,
    seq: 1,
    session_id: 'session-1',
    total: 0,
    ts: '2026-01-01T00:00:00.000Z',
    ...terminalRowPartial,
  },
});

describe('buildCostEntries: sortAt timestamp hardening', () => {
  test('a date-only allocated_at canonicalizes to trailing-Z form', () => {
    const {entries} = buildCostEntries({
      costGroups: [],
      planLedgerEntries: [],
      specLedgerEntries: [makeSpecEntry({allocatedAt: '2026-05-05'})],
    });

    expect(entries[0].sortAt).toBe('2026-05-05T00:00:00.000Z');
    expect(() => costEntrySchema.parse(entries[0])).not.toThrow();
  });

  test('an offset-form allocated_at canonicalizes to its UTC equivalent', () => {
    const {entries} = buildCostEntries({
      costGroups: [],
      planLedgerEntries: [],
      specLedgerEntries: [
        makeSpecEntry({allocatedAt: '2026-05-05T23:25:51+02:00'}),
      ],
    });

    expect(entries[0].sortAt).toBe('2026-05-05T21:25:51.000Z');
    expect(() => costEntrySchema.parse(entries[0])).not.toThrow();
  });

  test('a wholly unparseable allocated_at falls through to the next fallback', () => {
    const {entries} = buildCostEntries({
      costGroups: [],
      planLedgerEntries: [],
      specLedgerEntries: [
        makeSpecEntry({
          allocatedAt: 'not-a-timestamp',
          completedAt: '2026-04-01',
        }),
      ],
    });

    // No groups to supply coverage, so the chain falls to completedAt,
    // itself canonicalized.
    expect(entries[0].sortAt).toBe('2026-04-01T00:00:00.000Z');
    expect(() => costEntrySchema.parse(entries[0])).not.toThrow();
  });

  test('a wholly unparseable allocated_at AND completed_at degrades to EPOCH, never throws', () => {
    const {entries} = buildCostEntries({
      costGroups: [],
      planLedgerEntries: [],
      specLedgerEntries: [
        makeSpecEntry({allocatedAt: 'garbage', completedAt: 'also-garbage'}),
      ],
    });

    expect(entries[0].sortAt).toBe(fallbackTimestamp);
    expect(() => costEntrySchema.parse(entries[0])).not.toThrow();
  });
});

describe('buildCostEntries: coverage.costSince timestamp hardening', () => {
  test('canonicalizes a date-only started_at and ignores a garbage-only group when finding the earliest', () => {
    const validGroup = makeGroup({started_at: '2026-05-05'});
    const garbageGroup = makeGroup({started_at: null, ts: 'not-a-timestamp'});

    const {costSince} = buildCostEntries({
      costGroups: [validGroup, garbageGroup],
      planLedgerEntries: [],
      specLedgerEntries: [],
    });

    expect(costSince).toBe('2026-05-05T00:00:00.000Z');
    expect(() =>
      costsResponseSchema.shape.coverage.parse({costSince})
    ).not.toThrow();
  });

  test('a wholly unparseable coverage timestamp across every group degrades to null, not a throw', () => {
    const garbageGroup = makeGroup({started_at: null, ts: 'not-a-timestamp'});

    const {costSince} = buildCostEntries({
      costGroups: [garbageGroup],
      planLedgerEntries: [],
      specLedgerEntries: [],
    });

    expect(costSince).toBeNull();
    expect(() =>
      costsResponseSchema.shape.coverage.parse({costSince})
    ).not.toThrow();
  });
});
