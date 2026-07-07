import {expect, test} from 'vitest';
import {
  coverageDiverges,
  formatCoverageDisclosure,
  formatFreshnessLine,
  formatLocalDate,
  formatScannedAt,
} from '~/components/Sections/DashboardHeader/format-header';

test('formatScannedAt reads "just now" inside the first minute', () => {
  const scannedAt = '2026-07-05T12:00:00Z';
  const now = new Date('2026-07-05T12:00:30Z');

  expect(formatScannedAt(scannedAt, now)).toBe('just now');
});

test('formatScannedAt buckets minutes, hours, and days singular/plural', () => {
  const scannedAt = '2026-07-05T12:00:00Z';

  expect(formatScannedAt(scannedAt, new Date('2026-07-05T12:01:00Z'))).toBe(
    '1 minute ago'
  );
  expect(formatScannedAt(scannedAt, new Date('2026-07-05T12:05:00Z'))).toBe(
    '5 minutes ago'
  );
  expect(formatScannedAt(scannedAt, new Date('2026-07-05T14:00:00Z'))).toBe(
    '2 hours ago'
  );
  expect(formatScannedAt(scannedAt, new Date('2026-07-07T12:00:00Z'))).toBe(
    '2 days ago'
  );
});

test('formatLocalDate renders a UTC instant as a YYYY-MM-DD date in the given zone', () => {
  expect(formatLocalDate('2026-07-03T00:00:00Z', 'UTC')).toBe('2026-07-03');
});

test('coverageDiverges is false when either date is missing', () => {
  expect(coverageDiverges(null, '2026-05-05T00:00:00Z', 'UTC')).toBe(false);
  expect(coverageDiverges('2026-07-03T00:00:00Z', null, 'UTC')).toBe(false);
  expect(coverageDiverges(null, null, 'UTC')).toBe(false);
});

test('coverageDiverges is false when both sides land on the same day in the given zone', () => {
  expect(
    coverageDiverges('2026-07-03T23:00:00Z', '2026-07-03T01:00:00Z', 'UTC')
  ).toBe(false);
});

test('coverageDiverges is true when the two datasets start on different days', () => {
  expect(
    coverageDiverges('2026-07-03T00:00:00Z', '2026-05-05T08:00:00Z', 'UTC')
  ).toBe(true);
});

test('formatCoverageDisclosure names both dates', () => {
  expect(
    formatCoverageDisclosure(
      '2026-07-03T00:00:00Z',
      '2026-05-05T08:00:00Z',
      'UTC'
    )
  ).toBe(
    'Cost tracking began 2026-07-03; activity history goes back to 2026-05-05.'
  );
});

test('formatFreshnessLine states session count, spec count, and recency', () => {
  const now = new Date('2026-07-05T12:00:30Z');

  expect(
    formatFreshnessLine(
      {scannedAt: '2026-07-05T12:00:00Z', sessionCount: 3, specsTotal: 23},
      now
    )
  ).toBe('Scanned 3 sessions · 23 specs · just now');
  expect(
    formatFreshnessLine(
      {scannedAt: '2026-07-05T12:00:00Z', sessionCount: 1, specsTotal: 1},
      now
    )
  ).toBe('Scanned 1 session · 1 spec · just now');
});
