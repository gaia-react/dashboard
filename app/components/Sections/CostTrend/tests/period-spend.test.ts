import {describe, expect, test} from 'vitest';
import {buildPeriodSpend} from '~/components/Sections/CostTrend/period-spend';
import type {
  AdHocSession,
  SpendEntry,
} from '~/components/Sections/CostTrend/period-spend';

const entry = (sortAt: string, recordedDollars: null | number): SpendEntry => ({
  sortAt,
  totals: {recordedDollars},
});

const adHocSession = (endedAt: string, value: number): AdHocSession => ({
  attribution: null,
  dollars: {basis: 'estimated', lowerBound: false, value},
  endedAt,
});

/** Attributed to a spec/plan; deriveEstimatedAdHocDollars excludes it. */
const attributedSession = (endedAt: string, value: number): AdHocSession => ({
  attribution: {entryType: 'spec', key: 'SPEC-001'},
  dollars: {basis: 'estimated', lowerBound: false, value},
  endedAt,
});

/** Ad hoc but priced by the RECORDED path; deriveEstimatedAdHocDollars
 * excludes it too, the estimate and the record never sum. */
const recordedAdHocSession = (
  endedAt: string,
  value: number
): AdHocSession => ({
  attribution: null,
  dollars: {basis: 'recorded', lowerBound: false, value},
  endedAt,
});

const unpricedSession = (endedAt: string): AdHocSession => ({
  attribution: null,
  dollars: null,
  endedAt,
});

describe('buildPeriodSpend', () => {
  test('an empty window with no data still enumerates its one period, both series at 0', () => {
    const result = buildPeriodSpend([], [], {
      end: '2026-06-08T00:00:00Z',
      start: '2026-06-08T00:00:00Z',
    });

    expect(result).toEqual({
      buckets: [
        {adHocDollars: 0, periodStart: '2026-06-08', recordedDollars: 0},
      ],
      granularity: 'week',
    });
  });

  test('recorded entries bucket into the Monday-start week they fall in', () => {
    const result = buildPeriodSpend(
      [
        entry('2026-06-08T09:00:00Z', 10), // Monday
        entry('2026-06-10T09:00:00Z', 5), // Wednesday, same week
      ],
      [],
      {end: '2026-06-10T00:00:00Z', start: '2026-06-08T00:00:00Z'}
    );

    expect(result).toEqual({
      buckets: [
        {adHocDollars: 0, periodStart: '2026-06-08', recordedDollars: 15},
      ],
      granularity: 'week',
    });
  });

  test('a gap week with no data still renders as an explicit $0 bucket for both series', () => {
    const result = buildPeriodSpend(
      [entry('2026-06-08T09:00:00Z', 10), entry('2026-06-22T09:00:00Z', 20)],
      [],
      {end: '2026-06-22T00:00:00Z', start: '2026-06-08T00:00:00Z'}
    );

    expect(result).toEqual({
      buckets: [
        {adHocDollars: 0, periodStart: '2026-06-08', recordedDollars: 10},
        {adHocDollars: 0, periodStart: '2026-06-15', recordedDollars: 0},
        {adHocDollars: 0, periodStart: '2026-06-22', recordedDollars: 20},
      ],
      granularity: 'week',
    });
  });

  test('unpriced (null) recorded entries contribute 0 to their period', () => {
    const result = buildPeriodSpend(
      [entry('2026-06-08T09:00:00Z', 10), entry('2026-06-09T09:00:00Z', null)],
      [],
      {end: '2026-06-09T00:00:00Z', start: '2026-06-08T00:00:00Z'}
    );

    expect(result.buckets).toEqual([
      {adHocDollars: 0, periodStart: '2026-06-08', recordedDollars: 10},
    ]);
  });

  test('recorded appears only in recent weeks while ad hoc spans the full window', () => {
    // The window covers 4 weeks; only one cost entry exists, near the end
    // (cost tracking is recent), while an ad-hoc session lands in every week.
    const result = buildPeriodSpend(
      [entry('2026-06-23T09:00:00Z', 50)],
      [
        adHocSession('2026-06-09T09:00:00Z', 10),
        adHocSession('2026-06-16T09:00:00Z', 20),
        adHocSession('2026-06-23T09:00:00Z', 30),
        adHocSession('2026-06-29T09:00:00Z', 40),
      ],
      {end: '2026-06-29T00:00:00Z', start: '2026-06-08T00:00:00Z'}
    );

    expect(result).toEqual({
      buckets: [
        {adHocDollars: 10, periodStart: '2026-06-08', recordedDollars: 0},
        {adHocDollars: 20, periodStart: '2026-06-15', recordedDollars: 0},
        {adHocDollars: 30, periodStart: '2026-06-22', recordedDollars: 50},
        {adHocDollars: 40, periodStart: '2026-06-29', recordedDollars: 0},
      ],
      granularity: 'week',
    });
  });

  test('the ad-hoc series sums exactly the sessions deriveEstimatedAdHocDollars would count', () => {
    const sessions: AdHocSession[] = [
      adHocSession('2026-06-09T09:00:00Z', 100), // counts
      adHocSession('2026-06-16T09:00:00Z', 50), // counts
      attributedSession('2026-06-10T09:00:00Z', 999), // excluded: attributed
      recordedAdHocSession('2026-06-11T09:00:00Z', 999), // excluded: recorded basis
      unpricedSession('2026-06-12T09:00:00Z'), // excluded: unpriceable
    ];

    const result = buildPeriodSpend([], sessions, {
      end: '2026-06-22T00:00:00Z',
      start: '2026-06-08T00:00:00Z',
    });
    const totalAdHoc = result.buckets.reduce(
      (sum, bucket) => sum + bucket.adHocDollars,
      0
    );

    // Same predicate deriveEstimatedAdHocDollars uses (app/data/aggregate/
    // activity.ts): attribution === null && dollars?.basis === 'estimated'.
    const expectedTotal = sessions
      .filter(
        (session) =>
          session.attribution === null && session.dollars?.basis === 'estimated'
      )
      .reduce((sum, session) => sum + (session.dollars?.value ?? 0), 0);

    expect(totalAdHoc).toBe(150);
    expect(totalAdHoc).toBe(expectedTotal);
  });

  test('a window over ~60 days switches to monthly buckets', () => {
    const result = buildPeriodSpend(
      [entry('2026-06-01T09:00:00Z', 10), entry('2026-09-01T09:00:00Z', 20)],
      [],
      {end: '2026-09-01T00:00:00Z', start: '2026-06-01T00:00:00Z'}
    );

    expect(result).toEqual({
      buckets: [
        {adHocDollars: 0, periodStart: '2026-06-01', recordedDollars: 10},
        {adHocDollars: 0, periodStart: '2026-07-01', recordedDollars: 0},
        {adHocDollars: 0, periodStart: '2026-08-01', recordedDollars: 0},
        {adHocDollars: 0, periodStart: '2026-09-01', recordedDollars: 20},
      ],
      granularity: 'month',
    });
  });
});
