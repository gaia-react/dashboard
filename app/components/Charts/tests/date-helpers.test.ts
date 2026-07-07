import {expect, test} from 'vitest';
import {
  buildMonthLabels,
  buildWeekdayLabels,
  buildWeekGrid,
  formatDayLabel,
  formatWeekLabel,
  listDayKeysBetween,
} from '~/components/Charts/date-helpers';

test('lists day keys between two days inclusive, across a month boundary', () => {
  expect(listDayKeysBetween('2026-06-29', '2026-07-02')).toEqual([
    '2026-06-29',
    '2026-06-30',
    '2026-07-01',
    '2026-07-02',
  ]);
  expect(listDayKeysBetween('2026-07-02', '2026-06-29')).toEqual([]);
});

test('builds a Sunday-first week grid with padded partial weeks', () => {
  // 2026-06-01 is a Monday, 2026-07-07 is a Tuesday: 37 days over 6 columns.
  const weeks = buildWeekGrid('2026-06-01', '2026-07-07');

  expect(weeks).toHaveLength(6);
  expect(weeks[0]?.days[0]).toBeUndefined();
  expect(weeks[0]?.days[1]).toBe('2026-06-01');
  expect(weeks[0]?.days[6]).toBe('2026-06-06');
  expect(weeks[4]?.days[0]).toBe('2026-06-28');
  expect(weeks[5]?.days[2]).toBe('2026-07-07');
  expect(weeks[5]?.days[3]).toBeUndefined();
});

test('labels the month at the first week whose days enter it', () => {
  const weeks = buildWeekGrid('2026-06-01', '2026-07-07');

  expect(buildMonthLabels(weeks, 'en-US')).toEqual([
    {label: 'Jun', weekIndex: 0},
    {label: 'Jul', weekIndex: 5},
  ]);
});

test('drops a leading month label when the next month starts immediately', () => {
  // 2026-06-28 is a Sunday, so July owns the second column.
  const weeks = buildWeekGrid('2026-06-28', '2026-07-11');

  expect(buildMonthLabels(weeks, 'en-US')).toEqual([
    {label: 'Jul', weekIndex: 1},
  ]);
});

test('formats day, week, and weekday labels via Intl', () => {
  expect(formatDayLabel('2026-07-05', 'en-US')).toBe('Jul 5, 2026');
  expect(formatWeekLabel('2026-06-07', 'en-US')).toBe('Jun 7');
  expect(buildWeekdayLabels('en-US')).toEqual([
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ]);
});
