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

const commandRow = {
  buckets: {cache_read: 4, cache_write: 5, fresh_input: 1, output: 5},
  command: 'gaia-debt',
  dollars: 0.01,
  duration_available: true,
  duration_seconds: 90,
  ended_at: '2026-07-14T11:51:25.000Z',
  final: true,
  github: {number: 769, repo: 'gaia-react/gaia', type: 'pr'},
  kind: 'command',
  plan_id: null,
  run_id: 'gaia-debt-20260714T114955Z-7b0a',
  schema_version: 1,
  seq: 0,
  session_id: 'eeeeeeee-1111-2222-3333-444444444444',
  spec_id: null,
  started_at: '2026-07-14T11:49:55.000Z',
  total: 15,
  ts: '2026-07-14T11:51:25Z',
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

  test('parses a command row with a pr github artifact', () => {
    const result = costRecordSchema.parse(commandRow);

    expect(result.command).toBe('gaia-debt');
    expect(result.run_id).toBe('gaia-debt-20260714T114955Z-7b0a');
    expect(result.github).toEqual({
      number: 769,
      repo: 'gaia-react/gaia',
      type: 'pr',
    });
  });

  test('parses a command row with an issue github artifact (gaia-forensics)', () => {
    const result = costRecordSchema.parse({
      ...commandRow,
      command: 'gaia-forensics',
      github: {number: 42, repo: 'gaia-react/gaia', type: 'issue'},
    });

    expect(result.github).toEqual({
      number: 42,
      repo: 'gaia-react/gaia',
      type: 'issue',
    });
  });

  test('parses a command row with no github artifact at all', () => {
    const {github, ...withoutGithub} = commandRow;
    const result = costRecordSchema.parse(withoutGithub);

    expect(result.github).toBeUndefined();
  });

  test('accepts an unknown github.type value verbatim', () => {
    const result = costRecordSchema.parse({
      ...commandRow,
      github: {number: 1, repo: 'gaia-react/gaia', type: 'discussion'},
    });

    expect(result.github?.type).toBe('discussion');
  });
});
