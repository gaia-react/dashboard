import {describe, expect, test} from 'vitest';
import {buildPeriodSpend} from '~/components/Sections/CostTrend/period-spend';
import type {SpendEntry} from '~/components/Sections/CostTrend/period-spend';

const entry = (sortAt: string, recordedDollars: null | number): SpendEntry => ({
  sortAt,
  totals: {recordedDollars},
});

describe('buildPeriodSpend', () => {
  test('empty entries produce no buckets', () => {
    expect(buildPeriodSpend([])).toEqual({buckets: [], granularity: 'week'});
  });

  test('a single entry buckets into the week (Monday-start) it falls in', () => {
    // 2026-06-10 is a Wednesday; its week starts Monday 2026-06-08.
    const result = buildPeriodSpend([entry('2026-06-10T09:00:00Z', 12.5)]);

    expect(result).toEqual({
      buckets: [{dollars: 12.5, periodStart: '2026-06-08'}],
      granularity: 'week',
    });
  });

  test('entries in the same week sum into one bucket', () => {
    const result = buildPeriodSpend([
      entry('2026-06-08T09:00:00Z', 10), // Monday
      entry('2026-06-10T09:00:00Z', 5), // Wednesday, same week
    ]);

    expect(result).toEqual({
      buckets: [{dollars: 15, periodStart: '2026-06-08'}],
      granularity: 'week',
    });
  });

  test('a gap week with no entries still renders as an explicit $0 bucket', () => {
    const result = buildPeriodSpend([
      entry('2026-06-08T09:00:00Z', 10), // week of Jun 8
      entry('2026-06-22T09:00:00Z', 20), // week of Jun 22, skipping Jun 15
    ]);

    expect(result).toEqual({
      buckets: [
        {dollars: 10, periodStart: '2026-06-08'},
        {dollars: 0, periodStart: '2026-06-15'},
        {dollars: 20, periodStart: '2026-06-22'},
      ],
      granularity: 'week',
    });
  });

  test('unpriced (null) entries contribute 0 to their period', () => {
    const result = buildPeriodSpend([
      entry('2026-06-08T09:00:00Z', 10),
      entry('2026-06-09T09:00:00Z', null),
    ]);

    expect(result).toEqual({
      buckets: [{dollars: 10, periodStart: '2026-06-08'}],
      granularity: 'week',
    });
  });

  test('a span over ~60 days switches to monthly buckets', () => {
    const result = buildPeriodSpend([
      entry('2026-06-01T09:00:00Z', 10),
      entry('2026-09-01T09:00:00Z', 20),
    ]);

    expect(result).toEqual({
      buckets: [
        {dollars: 10, periodStart: '2026-06-01'},
        {dollars: 0, periodStart: '2026-07-01'},
        {dollars: 0, periodStart: '2026-08-01'},
        {dollars: 20, periodStart: '2026-09-01'},
      ],
      granularity: 'month',
    });
  });

  test('costSince trims leading unpriced-only history instead of padding the chart with dead $0 bars', () => {
    // Without costSince this 63-day span (May 1 to Jul 3) would tip into
    // monthly buckets; the two May entries are unpriced (the GAIA ledger
    // long predates cost tracking), so a costSince of Jul 1 correctly
    // shrinks the window down to where recorded spend actually starts.
    const result = buildPeriodSpend(
      [
        entry('2026-05-01T09:00:00Z', null),
        entry('2026-05-15T09:00:00Z', null),
        entry('2026-07-01T09:00:00Z', 10), // Wednesday, week of Jun 29
        entry('2026-07-03T09:00:00Z', 15), // Friday, same week
      ],
      '2026-07-01T00:00:00Z'
    );

    expect(result).toEqual({
      buckets: [{dollars: 25, periodStart: '2026-06-29'}],
      granularity: 'week',
    });
  });

  test('costSince never excludes an entry that actually carries a recorded dollar figure', () => {
    // A contrived case where costSince (Jun 15) is somehow later than an
    // entry that already has a real recorded dollar figure (Jun 1): the
    // window must clamp back to Jun 1 rather than silently dropping it.
    const result = buildPeriodSpend(
      [entry('2026-06-01T09:00:00Z', 5), entry('2026-07-01T09:00:00Z', 10)],
      '2026-06-15T00:00:00Z'
    );

    expect(result).toEqual({
      buckets: [
        {dollars: 5, periodStart: '2026-06-01'},
        {dollars: 0, periodStart: '2026-06-08'},
        {dollars: 0, periodStart: '2026-06-15'},
        {dollars: 0, periodStart: '2026-06-22'},
        {dollars: 10, periodStart: '2026-06-29'},
      ],
      granularity: 'week',
    });
  });
});
