import {expect, test} from 'vitest';
import {
  formatFreshnessLine,
  formatLocalDate,
  formatProjectStart,
} from '~/components/Sections/DashboardHeader/format-header';

test('formatLocalDate renders a UTC instant as a YYYY-MM-DD date in the given zone', () => {
  expect(formatLocalDate('2026-07-03T00:00:00Z', 'UTC')).toBe('2026-07-03');
});

test('formatProjectStart returns null when neither dataset has a start date', () => {
  expect(formatProjectStart(null, null, 'UTC')).toBeNull();
});

test('formatProjectStart uses the only available date when one side is missing', () => {
  expect(formatProjectStart(null, '2026-05-05T08:00:00Z', 'UTC')).toBe(
    '2026-05-05'
  );
  expect(formatProjectStart('2026-07-03T00:00:00Z', null, 'UTC')).toBe(
    '2026-07-03'
  );
});

test('formatProjectStart picks the earlier of the two start dates', () => {
  expect(
    formatProjectStart('2026-07-03T00:00:00Z', '2026-05-05T08:00:00Z', 'UTC')
  ).toBe('2026-05-05');
});

test('formatFreshnessLine states session count, spec count, and recency', () => {
  expect(
    formatFreshnessLine({
      relative: '2 minutes ago',
      sessionCount: 3,
      specsTotal: 23,
    })
  ).toBe('Scanned 3 sessions, 23 specs, updated 2 minutes ago');
  expect(
    formatFreshnessLine({relative: 'Just now', sessionCount: 1, specsTotal: 1})
  ).toBe('Scanned 1 session, 1 spec, updated Just now');
});
