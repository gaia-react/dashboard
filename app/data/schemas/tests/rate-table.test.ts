import {describe, expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {rateTableSchema} from '~/data/schemas/rate-table';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(`../../../../test/fixtures/rate-table/${name}`, import.meta.url)
  );

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(fixture(name), 'utf8'));

describe('rateTableSchema', () => {
  test('parses the committed table shape and keeps unknown fields (loose)', () => {
    const table = rateTableSchema.parse(readJson('token-rates.json'));

    expect(table.cache_multipliers).toEqual({
      read: 0.1,
      write_1h: 2,
      write_5m: 1.25,
    });
    expect(table.models['claude-intro-1']).toEqual([
      {effective_through: '2026-06-30', input: 2, output: 10},
      {input: 3, output: 15},
    ]);
    // Loose schema: unknown top-level fields pass through.
    expect(table).toHaveProperty('future_field');
  });

  test('rejects valid JSON that is not a rate-table object', () => {
    const result = rateTableSchema.safeParse(
      readJson('token-rates-wrong-shape.json')
    );

    expect(result.success).toBe(false);
  });

  test('rejects a table missing cache_multipliers', () => {
    const result = rateTableSchema.safeParse({
      models: {'claude-flat-1': [{input: 1, output: 5}]},
    });

    expect(result.success).toBe(false);
  });
});
