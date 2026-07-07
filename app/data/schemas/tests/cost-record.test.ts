import {describe, expect, test} from 'vitest';
import {costRecordSchema} from '~/data/schemas/cost-record';

const nativeRow = {
  buckets: {cache_read: 40, cache_write: 50, fresh_input: 10, output: 50},
  by_agent_type: {
    main: {
      cache_read: 40,
      cache_write_1h: 30,
      cache_write_5m: 20,
      fresh_input: 10,
      output: 50,
    },
  },
  by_model: {
    'claude-opus-4-8': {
      cache_read: 40,
      cache_write_1h: 30,
      cache_write_5m: 20,
      fresh_input: 10,
      output: 50,
    },
  },
  dollars: 0.02,
  duration_available: true,
  duration_seconds: 60,
  ended_at: '2026-07-02T08:01:00.000Z',
  final: true,
  kind: 'spec',
  partial: false,
  plan_id: null,
  plan_slug: null,
  schema_version: 1,
  seq: 0,
  session_cwd: '/Users/you/projects/my-app',
  session_id: 'cccccccc-1111-2222-3333-444444444444',
  spec_id: 'SPEC-101',
  started_at: '2026-07-02T08:00:00.000Z',
  total: 150,
  ts: '2026-07-02T08:01:05Z',
};

const backfillRow = {
  buckets: {
    cache_read: 10_213_662,
    cache_write: 892_605,
    fresh_input: 185_300,
    output: 242_818,
  },
  dollars: null,
  duration_available: true,
  duration_seconds: 2996,
  ended_at: null,
  final: true,
  kind: 'spec',
  plan_id: null,
  plan_slug: null,
  schema_version: 1,
  seq: 0,
  session_id: 'dddddddd-1111-2222-3333-444444444444',
  source: 'backfill',
  spec_id: 'SPEC-102',
  started_at: null,
  total: 11_534_385,
  ts: '2026-07-03T12:51:52Z',
};

describe('costRecordSchema', () => {
  test('parses a full native row', () => {
    const result = costRecordSchema.safeParse(nativeRow);

    expect(result.success).toBe(true);
  });

  test('hard-fails on an unsupported schema_version', () => {
    const result = costRecordSchema.safeParse({
      ...nativeRow,
      schema_version: 2,
    });

    expect(result.success).toBe(false);
  });

  test('accepts an unknown kind verbatim', () => {
    const result = costRecordSchema.parse({...nativeRow, kind: 'review'});

    expect(result.kind).toBe('review');
  });

  test('passes unknown fields through untouched', () => {
    const result = costRecordSchema.parse({
      ...nativeRow,
      future_field: 'keep-me',
    });

    expect(result).toMatchObject({future_field: 'keep-me'});
  });

  test('parses a backfill row: null spans, no breakdowns, no session_cwd', () => {
    const result = costRecordSchema.parse(backfillRow);

    expect(result.by_agent_type).toBeUndefined();
    expect(result.by_model).toBeUndefined();
    expect(result.session_cwd).toBeUndefined();
    expect(result.started_at).toBeNull();
    expect(result.ended_at).toBeNull();
  });
});
