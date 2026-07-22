import {describe, expect, test} from 'vitest';
import {
  formatDateShort,
  formatDateTime,
  formatDollars,
  formatDollarsCell,
  formatDuration,
  formatTokens,
  NO_DATA_LABEL,
} from '~/data/format/units';

describe('formatDollars', () => {
  test('formats USD with two decimals', () => {
    expect(formatDollars(14.35, 'en-US')).toBe('$14.35');
    expect(formatDollars(0, 'en-US')).toBe('$0.00');
    expect(formatDollars(1234.5, 'en-US')).toBe('$1,234.50');
  });
});

describe('formatDollarsCell', () => {
  test('renders the dash for a missing figure and a real zero for priced $0', () => {
    expect(formatDollarsCell(null, 'en-US')).toBe(NO_DATA_LABEL);
    expect(formatDollarsCell(0, 'en-US')).toBe('$0.00');
    expect(formatDollarsCell(1.37, 'en-US')).toBe('$1.37');
  });
});

describe('formatDuration', () => {
  test('renders the dash for a null duration', () => {
    expect(formatDuration(null)).toBe(NO_DATA_LABEL);
  });

  test('renders minutes-only under an hour and h/m over one', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(90)).toBe('2m');
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7500)).toBe('2h 5m');
  });
});

describe('formatTokens', () => {
  test('compacts large token counts', () => {
    expect(formatTokens(0, 'en-US')).toBe('0');
    expect(formatTokens(1500, 'en-US')).toBe('1.5K');
    expect(formatTokens(2_400_000, 'en-US')).toBe('2.4M');
  });
});

describe('formatDateTime', () => {
  test('renders a medium date with a short time', () => {
    expect(formatDateTime('2026-06-10T09:00:00Z', 'en-US')).toMatch(
      /Jun 10, 2026/
    );
  });
});

describe('formatDateShort', () => {
  test('renders a medium date and no time', () => {
    expect(formatDateShort('2026-07-14T09:00:00Z', 'en-US')).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, 2026$/u
    );
  });
});

describe('NO_DATA_LABEL', () => {
  test('is a plain dash, never an em dash', () => {
    expect(NO_DATA_LABEL).toBe('-');
  });
});
