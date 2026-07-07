import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {createFileCache} from '~/data/cache';
import {estimateDollars, loadRateTable} from '~/data/pricing/rates';
import type {RateTable} from '~/data/schemas/rate-table';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(`../../../../test/fixtures/rate-table/${name}`, import.meta.url)
  );

describe('loadRateTable', () => {
  test('loads a valid table through the file cache', () => {
    const cache = createFileCache();

    const first = loadRateTable(cache, fixture('token-rates.json'));
    const second = loadRateTable(cache, fixture('token-rates.json'));

    expect(first).toMatchObject({
      status: 'ok',
      table: {
        cache_multipliers: {read: expect.closeTo(0.1, 10)},
        models: {
          'claude-flat-1': expect.anything(),
          'claude-intro-1': expect.anything(),
        },
      },
    });

    // Second read is a cache hit returning the same parsed object.
    expect(second).toBe(first);
    expect(cache.size()).toBe(1);
  });

  test('a missing table file disables estimates with a "missing" signal', () => {
    const result = loadRateTable(
      createFileCache(),
      fixture('does-not-exist.json')
    );

    expect(result).toEqual({status: 'missing'});
  });

  test('invalid JSON disables estimates with an "unparseable" signal', () => {
    const result = loadRateTable(
      createFileCache(),
      fixture('token-rates-unparseable.json')
    );

    expect(result).toEqual({status: 'unparseable'});
  });

  test('valid JSON with the wrong shape is also "unparseable"', () => {
    const result = loadRateTable(
      createFileCache(),
      fixture('token-rates-wrong-shape.json')
    );

    expect(result).toEqual({status: 'unparseable'});
  });
});

const loadFixtureTable = (name: string): RateTable => {
  const loaded = loadRateTable(createFileCache(), fixture(name));

  if (loaded.status !== 'ok') {
    throw new Error(`fixture table failed to load: ${name}`);
  }

  return loaded.table;
};

const zeroBuckets = {
  cacheRead: 0,
  cacheWrite1h: 0,
  cacheWrite5m: 0,
  freshInput: 0,
  output: 0,
};

describe('estimateDollars', () => {
  test('prices TTL-split usage with cache multipliers from the table', () => {
    const table = loadFixtureTable('token-rates.json');

    // claude-flat-1: input $1/MTok, output $5/MTok.
    // fresh 1M x 1 + write_5m 0.4M x 1 x 1.25 + write_1h 0.1M x 1 x 2.0
    // + read 2M x 1 x 0.1 + output 0.5M x 5
    // = (1,000,000 + 500,000 + 200,000 + 200,000 + 2,500,000) / 1e6 = 4.4
    const estimate = estimateDollars(
      table,
      {
        'claude-flat-1': {
          cacheRead: 2_000_000,
          cacheWrite1h: 100_000,
          cacheWrite5m: 400_000,
          freshInput: 1_000_000,
          output: 500_000,
        },
      },
      '2026-07-05T12:00:00Z'
    );

    expect(estimate.dollars).toBeCloseTo(4.4, 10);
    expect(estimate.lowerBound).toBe(false);
    expect(estimate.unpricedModels).toEqual([]);
  });

  test('anchor day equal to effective_through selects that window (inclusive)', () => {
    const table = loadFixtureTable('token-rates.json');

    // claude-intro-1 intro window ends 2026-06-30 inclusive: $2 in / $10 out.
    const estimate = estimateDollars(
      table,
      {
        'claude-intro-1': {
          ...zeroBuckets,
          freshInput: 1_000_000,
          output: 1_000_000,
        },
      },
      '2026-06-30T23:59:59Z'
    );

    expect(estimate.dollars).toBeCloseTo(12, 10);
  });

  test('anchor past every dated window falls through to the sticker rate', () => {
    const table = loadFixtureTable('token-rates.json');

    // The day after the intro window: sticker $3 in / $15 out.
    const estimate = estimateDollars(
      table,
      {
        'claude-intro-1': {
          ...zeroBuckets,
          freshInput: 1_000_000,
          output: 1_000_000,
        },
      },
      '2026-07-01T00:00:00Z'
    );

    expect(estimate.dollars).toBeCloseTo(18, 10);
  });

  test('sums across models', () => {
    const table = loadFixtureTable('token-rates.json');

    // Mid-intro anchor: claude-intro-1 fresh 1M x $2 = 2;
    // claude-flat-1 output 1M x $5 = 5.
    const estimate = estimateDollars(
      table,
      {
        'claude-flat-1': {...zeroBuckets, output: 1_000_000},
        'claude-intro-1': {...zeroBuckets, freshInput: 1_000_000},
      },
      '2026-06-15T00:00:00Z'
    );

    expect(estimate.dollars).toBeCloseTo(7, 10);
    expect(estimate.lowerBound).toBe(false);
  });

  test('a claude-* model missing from the table makes a named lower bound', () => {
    const table = loadFixtureTable('token-rates.json');

    const estimate = estimateDollars(
      table,
      {
        'claude-flat-1': {...zeroBuckets, output: 1_000_000},
        'claude-not-in-table': {...zeroBuckets, freshInput: 9_000_000},
      },
      '2026-07-05T00:00:00Z'
    );

    // Priced from what is known; the unknown model contributes zero.
    expect(estimate.dollars).toBeCloseTo(5, 10);
    expect(estimate.lowerBound).toBe(true);
    expect(estimate.unpricedModels).toEqual(['claude-not-in-table']);
  });

  test('a non-claude- model key is ignored silently', () => {
    const table = loadFixtureTable('token-rates.json');

    const estimate = estimateDollars(
      table,
      {
        'claude-flat-1': {...zeroBuckets, output: 1_000_000},
        'gpt-other': {...zeroBuckets, freshInput: 9_000_000, output: 9_000_000},
      },
      '2026-07-05T00:00:00Z'
    );

    // No contribution, no error, no lower-bound flag.
    expect(estimate.dollars).toBeCloseTo(5, 10);
    expect(estimate.lowerBound).toBe(false);
    expect(estimate.unpricedModels).toEqual([]);
  });

  test('cache multipliers come from the table, not hardcoded defaults', () => {
    const table = loadFixtureTable('token-rates-custom-multipliers.json');

    // read 0.5, write_5m 2, write_1h 3 (non-default on purpose), input $1/MTok:
    // read 1M x 0.5 + write_5m 1M x 2 + write_1h 1M x 3 = 5.5
    const estimate = estimateDollars(
      table,
      {
        'claude-flat-1': {
          cacheRead: 1_000_000,
          cacheWrite1h: 1_000_000,
          cacheWrite5m: 1_000_000,
          freshInput: 0,
          output: 0,
        },
      },
      '2026-07-05T00:00:00Z'
    );

    expect(estimate.dollars).toBeCloseTo(5.5, 10);
  });
});
