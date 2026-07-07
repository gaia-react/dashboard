import {expect, test} from 'vitest';
import {
  formatDollars,
  sumBuckets,
} from '~/components/Sections/KpiRow/format-kpi';

test('formatDollars renders a two-decimal USD amount', () => {
  expect(formatDollars(14.35, 'en-US')).toBe('$14.35');
  expect(formatDollars(0, 'en-US')).toBe('$0.00');
});

test('sumBuckets adds the four token buckets', () => {
  expect(
    sumBuckets({
      cacheRead: 9_000_000,
      cacheWrite: 3_000_000,
      freshInput: 1_000_000,
      output: 1_000_000,
    })
  ).toBe(14_000_000);
});
