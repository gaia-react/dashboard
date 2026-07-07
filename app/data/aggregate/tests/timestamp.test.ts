import {describe, expect, test} from 'vitest';
import {canonicalizeTimestamp} from '~/data/aggregate/timestamp';

describe('canonicalizeTimestamp', () => {
  test('passes an already-canonical trailing-Z timestamp through unchanged', () => {
    expect(canonicalizeTimestamp('2026-05-05T23:25:51.000Z')).toBe(
      '2026-05-05T23:25:51.000Z'
    );
  });

  test('canonicalizes a date-only value to UTC midnight', () => {
    expect(canonicalizeTimestamp('2026-05-05')).toBe(
      '2026-05-05T00:00:00.000Z'
    );
  });

  test('canonicalizes an offset-form value to its UTC equivalent', () => {
    expect(canonicalizeTimestamp('2026-05-05T23:25:51+02:00')).toBe(
      '2026-05-05T21:25:51.000Z'
    );
  });

  test('a wholly unparseable value returns null', () => {
    expect(canonicalizeTimestamp('not-a-timestamp')).toBeNull();
  });

  test('null and undefined both return null', () => {
    expect(canonicalizeTimestamp(null)).toBeNull();
    expect(canonicalizeTimestamp(undefined)).toBeNull();
  });
});
