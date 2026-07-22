import {describe, expect, test} from 'vitest';
import {
  busiestModel,
  longestSessions,
  mostActiveDay,
  recentDailyTokenTotals,
  topCostlyEntries,
  totalRecordedWorkSeconds,
  weeklyTokensForModel,
} from '~/components/Sections/Insights/insights';
import type {
  ActivityResponse,
  CostEntry,
  SessionSummary,
} from '~/data/schemas/api';

const entry = (
  key: string,
  recordedDollars: null | number,
  durationSeconds: null | number
): CostEntry => ({
  entryType: 'spec',
  github: null,
  id: key,
  key,
  partial: false,
  phases: [],
  sessions: [],
  sortAt: '2026-06-01T00:00:00.000Z',
  source: 'native',
  status: 'merged',
  title: `Title ${key}`,
  totals: {durationSeconds, recordedDollars, totalTokens: 0},
});

const session = (id: string, durationSeconds: number): SessionSummary => ({
  attribution: null,
  dollars: null,
  durationSeconds,
  endedAt: '2026-06-01T01:00:00.000Z',
  gitBranch: null,
  models: [],
  sessionId: id,
  startedAt: '2026-06-01T00:00:00.000Z',
  title: `Session ${id}`,
  totalTokens: 0,
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
  test('returns the day with the most total tokens', () => {
    const heatmap: ActivityResponse['heatmap'] = [
      {date: '2026-06-01', sessionCount: 2, totalTokens: 100},
      {date: '2026-06-02', sessionCount: 5, totalTokens: 900},
    ];

    expect(mostActiveDay(heatmap)).toEqual({
      date: '2026-06-02',
      sessionCount: 5,
      totalTokens: 900,
    });
  });

  // Phase 8 v2: the metric is total tokens, not output. A day with more
  // output but fewer total tokens must lose to the day with more total
  // tokens, proving the ranking basis actually moved.
  test('a day with more output but fewer total tokens loses to the day with more total tokens', () => {
    const heatmap: ActivityResponse['heatmap'] = [
      {date: '2026-06-01', sessionCount: 2, totalTokens: 950},
      {date: '2026-06-02', sessionCount: 5, totalTokens: 900},
    ];

    expect(mostActiveDay(heatmap)?.date).toBe('2026-06-01');
  });

  test('returns null when no day has any tokens', () => {
    expect(
      mostActiveDay([{date: '2026-06-01', sessionCount: 0, totalTokens: 0}])
    ).toBeNull();
  });
});

describe('busiestModel', () => {
  test('picks the real model with the most total tokens, skipping <synthetic>', () => {
    const modelTotals: ActivityResponse['modelTotals'] = [
      {model: '<synthetic>', totalTokens: 999},
      {model: 'claude-opus-4-8', totalTokens: 500},
      {model: 'claude-sonnet-5', totalTokens: 800},
    ];

    expect(busiestModel(modelTotals)).toEqual({
      model: 'claude-sonnet-5',
      totalTokens: 800,
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

describe('recentDailyTokenTotals', () => {
  test("returns each day's totalTokens in date order", () => {
    const heatmap: ActivityResponse['heatmap'] = [
      {date: '2026-06-01', sessionCount: 1, totalTokens: 100},
      {date: '2026-06-02', sessionCount: 2, totalTokens: 200},
      {date: '2026-06-03', sessionCount: 3, totalTokens: 300},
    ];

    expect(recentDailyTokenTotals(heatmap)).toEqual([100, 200, 300]);
  });

  test('caps to the most recent `limit` days, oldest-of-the-window first', () => {
    const heatmap: ActivityResponse['heatmap'] = Array.from(
      {length: 35},
      (_unused, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        sessionCount: 1,
        totalTokens: index,
      })
    );

    const series = recentDailyTokenTotals(heatmap, 30);

    expect(series).toHaveLength(30);
    // Days 0-4 (the oldest five) are dropped; day 5 (index 5, value 5) leads
    // the kept window, day 34 (value 34) trails it.
    expect(series[0]).toBe(5);
    expect(series.at(-1)).toBe(34);
  });

  test('an empty heatmap returns an empty series', () => {
    expect(recentDailyTokenTotals([])).toEqual([]);
  });
});

describe('weeklyTokensForModel', () => {
  test("reads the given model's tokens per week, in week order", () => {
    const modelWeekly: ActivityResponse['modelWeekly'] = [
      {tokensByModel: {'claude-opus-4-8': 400}, weekStart: '2026-06-01'},
      {tokensByModel: {'claude-opus-4-8': 900}, weekStart: '2026-06-08'},
    ];

    expect(weeklyTokensForModel(modelWeekly, 'claude-opus-4-8')).toEqual([
      400, 900,
    ]);
  });

  test('a week that recorded no tokens for the model reads as 0, not undefined', () => {
    const modelWeekly: ActivityResponse['modelWeekly'] = [
      {tokensByModel: {'claude-sonnet-5': 100}, weekStart: '2026-06-01'},
    ];

    expect(weeklyTokensForModel(modelWeekly, 'claude-opus-4-8')).toEqual([0]);
  });

  // Regression (the Icon/icon-map.ts, format/lenses.ts, chart-palette.ts
  // groupTailSeries bug class): a model id that collides with an
  // Object.prototype member name must never resolve to an inherited
  // function or object through bare bracket indexing. Built via JSON.parse
  // so "__proto__" lands as a genuine own property (CreateDataProperty);
  // an object literal with `__proto__:` in the source sets the prototype
  // instead and proves nothing.
  test('a model id shaped like a prototype property reads its real own value where present, and 0 (never the inherited value) where absent', () => {
    const weekWithData = {
      tokensByModel: JSON.parse('{"__proto__": 5}') as Record<string, number>,
      weekStart: '2026-06-01',
    };
    const weekWithoutIt = {
      tokensByModel: JSON.parse('{"claude-opus-4-8": 10}') as Record<
        string,
        number
      >,
      weekStart: '2026-06-08',
    };

    expect(
      weeklyTokensForModel([weekWithData, weekWithoutIt], '__proto__')
    ).toEqual([5, 0]);
  });
});
