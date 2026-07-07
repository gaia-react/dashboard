import {describe, expect, test} from 'vitest';
import {
  busiestModel,
  longestSessions,
  mostActiveDay,
  topCostlyEntries,
  totalRecordedWorkSeconds,
} from '~/components/Sections/Insights/insights';
import type {
  ActivityResponse,
  CostEntry,
  SessionSummary,
} from '~/data/schemas/api';

const buckets = {cacheRead: 0, cacheWrite: 0, freshInput: 0, output: 0};

const entry = (
  key: string,
  recordedDollars: null | number,
  durationSeconds: null | number
): CostEntry => ({
  entryType: 'spec',
  id: key,
  key,
  partial: false,
  phases: [],
  sessions: [],
  sortAt: '2026-06-01T00:00:00.000Z',
  source: 'native',
  status: 'merged',
  title: `Title ${key}`,
  totals: {buckets, durationSeconds, recordedDollars},
});

const session = (id: string, durationSeconds: number): SessionSummary => ({
  attribution: null,
  buckets,
  dollars: null,
  durationSeconds,
  endedAt: '2026-06-01T01:00:00.000Z',
  gitBranch: null,
  models: [],
  sessionId: id,
  startedAt: '2026-06-01T00:00:00.000Z',
  title: `Session ${id}`,
  turnCount: 1,
});

describe('topCostlyEntries', () => {
  test('keeps priced entries only, most expensive first, capped at the limit', () => {
    const entries = [
      entry('A', 5, null),
      entry('B', null, null),
      entry('C', 20, null),
      entry('D', 0, null),
      entry('E', 12, null),
    ];

    expect(topCostlyEntries(entries, 2)).toEqual([
      {dollars: 20, key: 'C', title: 'Title C'},
      {dollars: 12, key: 'E', title: 'Title E'},
    ]);
  });
});

describe('longestSessions', () => {
  test('returns the longest sessions first, capped at the limit', () => {
    const sessions = [session('a', 60), session('b', 600), session('c', 120)];

    expect(longestSessions(sessions, 2).map((s) => s.sessionId)).toEqual([
      'b',
      'c',
    ]);
  });
});

describe('mostActiveDay', () => {
  test('returns the day with the most output tokens', () => {
    const heatmap: ActivityResponse['heatmap'] = [
      {buckets: {...buckets, output: 100}, date: '2026-06-01', sessionCount: 2},
      {buckets: {...buckets, output: 900}, date: '2026-06-02', sessionCount: 5},
    ];

    expect(mostActiveDay(heatmap)).toEqual({
      date: '2026-06-02',
      output: 900,
      sessionCount: 5,
    });
  });

  test('returns null when no day has output', () => {
    expect(
      mostActiveDay([{buckets, date: '2026-06-01', sessionCount: 0}])
    ).toBeNull();
  });
});

describe('busiestModel', () => {
  test('picks the real model with the most output, skipping <synthetic>', () => {
    const modelTotals: ActivityResponse['modelTotals'] = [
      {buckets: {...buckets, output: 999}, model: '<synthetic>'},
      {buckets: {...buckets, output: 500}, model: 'claude-opus-4-8'},
      {buckets: {...buckets, output: 800}, model: 'claude-sonnet-5'},
    ];

    expect(busiestModel(modelTotals)).toEqual({
      model: 'claude-sonnet-5',
      output: 800,
    });
  });

  test('returns null when there is no real model activity', () => {
    expect(busiestModel([])).toBeNull();
  });
});

describe('totalRecordedWorkSeconds', () => {
  test('sums durations, treating nulls as zero', () => {
    expect(
      totalRecordedWorkSeconds([
        entry('A', 1, 900),
        entry('B', 1, null),
        entry('C', 1, 100),
      ])
    ).toBe(1000);
  });
});
