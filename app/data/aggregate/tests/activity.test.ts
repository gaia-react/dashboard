import {describe, expect, test} from 'vitest';
import type {AggregateActivityOptions} from '~/data/aggregate/activity';
import {aggregateActivity} from '~/data/aggregate/activity';
import type {SessionScan, TokenBuckets} from '~/data/parse/session-scan';

const buckets = (partial: Partial<TokenBuckets> = {}): TokenBuckets => ({
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  cacheWrite5m: 0,
  freshInput: 0,
  output: 0,
  ...partial,
});

const makeScan = (partial: Partial<SessionScan> = {}): SessionScan => ({
  byModel: {},
  counters: {syntheticExcluded: 0, usageMissingExcluded: 0},
  durationSeconds: 0,
  endedAt: undefined,
  errors: [],
  gitBranch: undefined,
  hourlyUtc: {},
  models: [],
  sessionId: 'default-session',
  startedAt: undefined,
  title: 'default-session',
  turnCount: 0,
  ...partial,
});

/**
 * A session with activity at 23:30Z and 00:30Z across a UTC day boundary.
 * Each hour carries both fresh input and output, so total tokens and output
 * tokens genuinely differ (10 vs 5, 13 vs 7): the fixture the heatmap-metric
 * change (SPEC section 6.4 override, Phase 8 v2) needs to prove itself
 * against, not a fixture where the two happen to coincide.
 */
const straddlingScan = (): SessionScan =>
  makeScan({
    byModel: {'claude-sonnet-4-6': buckets({freshInput: 11, output: 12})},
    durationSeconds: 3600,
    endedAt: '2026-06-26T00:30:00.000Z',
    hourlyUtc: {
      '2026-06-25T23:00:00.000Z': {
        'claude-sonnet-4-6': buckets({freshInput: 5, output: 5}),
      },
      '2026-06-26T00:00:00.000Z': {
        'claude-sonnet-4-6': buckets({freshInput: 6, output: 7}),
      },
    },
    models: ['claude-sonnet-4-6'],
    sessionId: 'straddle-session',
    startedAt: '2026-06-25T23:30:00.000Z',
    title: 'Straddles UTC midnight',
    turnCount: 2,
  });

const aggregate = (
  partial: Partial<AggregateActivityOptions> = {}
): ReturnType<typeof aggregateActivity> =>
  aggregateActivity({
    rateTable: {status: 'missing'},
    recordedDollarsBySession: new Map(),
    scans: [],
    timeZone: 'UTC',
    ...partial,
  });

describe('heatmap timezone fold', () => {
  test('a UTC-midnight-straddling session lands on two UTC days, with totalTokens (not output)', () => {
    const result = aggregate({scans: [straddlingScan()], timeZone: 'UTC'});

    expect(result.heatmap).toEqual([
      // totalOf({freshInput: 5, output: 5}) = 10, output alone is 5.
      {date: '2026-06-25', sessionCount: 1, totalTokens: 10},
      // totalOf({freshInput: 6, output: 7}) = 13, output alone is 7.
      {date: '2026-06-26', sessionCount: 1, totalTokens: 13},
    ]);
    expect(result.kpis.activeDays).toBe(2);
  });

  test('the same session folds into ONE local day in Asia/Tokyo (UTC+9)', () => {
    const result = aggregate({
      scans: [straddlingScan()],
      timeZone: 'Asia/Tokyo',
    });

    // Both hours combine: totalOf(5,5) + totalOf(6,7) = 10 + 13 = 23.
    expect(result.heatmap).toEqual([
      {date: '2026-06-26', sessionCount: 1, totalTokens: 23},
    ]);
    expect(result.kpis.activeDays).toBe(1);
  });

  test('and into the EARLIER local day in America/Los_Angeles (UTC-7)', () => {
    const result = aggregate({
      scans: [straddlingScan()],
      timeZone: 'America/Los_Angeles',
    });

    expect(result.heatmap).toEqual([
      {date: '2026-06-25', sessionCount: 1, totalTokens: 23},
    ]);
  });

  test('two sessions active on one day count once each in sessionCount', () => {
    const second = makeScan({
      endedAt: '2026-06-25T10:00:00.000Z',
      hourlyUtc: {
        '2026-06-25T10:00:00.000Z': {
          'claude-opus-4-8': buckets({output: 3}),
        },
      },
      sessionId: 'second-session',
      startedAt: '2026-06-25T10:00:00.000Z',
    });

    const result = aggregate({scans: [straddlingScan(), second]});

    expect(
      result.heatmap.find((cell) => cell.date === '2026-06-25')?.sessionCount
    ).toBe(2);
  });
});

/** Builds a scan from per-model bucket PARTIALS (not just output), so tests
 * can construct total-token totals that genuinely diverge from output. */
const scanWithModels = (
  sessionId: string,
  byModelPartials: Record<string, Partial<TokenBuckets>>,
  hour: string
): SessionScan => {
  const byModel = Object.fromEntries(
    Object.entries(byModelPartials).map(([model, partial]) => [
      model,
      buckets(partial),
    ])
  );

  return makeScan({
    byModel,
    endedAt: hour,
    hourlyUtc: {[hour]: byModel},
    models: Object.keys(byModel),
    sessionId,
    startedAt: hour,
  });
};

describe('model mix', () => {
  test('totals sum across sessions by TOTAL tokens, not output, sorted descending', () => {
    const result = aggregate({
      scans: [
        scanWithModels(
          's1',
          {'claude-opus-4-8': {output: 50}},
          '2026-06-01T10:00:00Z'
        ),
        scanWithModels(
          's2',
          {
            // opus total across both sessions: 50 + (5 + 5) = 60 (output
            // alone would be 50 + 5 = 55). Ranking by output would put opus
            // ahead of sonnet (55 > 10); ranking by total flips that
            // (60 < 100), proving the metric is genuinely total tokens.
            'claude-opus-4-8': {freshInput: 5, output: 5},
            'claude-sonnet-4-6': {cacheRead: 90, output: 10},
          },
          '2026-06-02T10:00:00Z'
        ),
      ],
    });

    expect(result.modelTotals).toEqual([
      {model: 'claude-sonnet-4-6', totalTokens: 100},
      {model: 'claude-opus-4-8', totalTokens: 60},
    ]);
  });

  test('more than 6 models: the tail groups into "other", total-token sums preserved', () => {
    const byModelPartials: Record<string, Partial<TokenBuckets>> = {};

    for (let rank = 1; rank <= 8; rank += 1) {
      // freshInput uniform across every model: total tokens differ from
      // output tokens (proving the metric switch) without disturbing the
      // output-based rank order the "other" grouping mechanics rely on.
      byModelPartials[`claude-model-${rank}`] = {
        freshInput: 500,
        output: 100 - rank,
      };
    }

    const result = aggregate({
      scans: [scanWithModels('s1', byModelPartials, '2026-06-03T10:00:00Z')],
    });

    expect(result.modelTotals).toHaveLength(7);
    expect(result.modelTotals.at(-1)?.model).toBe('other');
    // The two smallest total-token series (rank 7: 593, rank 8: 592) fold
    // into "other"; output alone would have been 93 + 92 = 185.
    expect(result.modelTotals.at(-1)?.totalTokens).toBe(1185);

    const weekly = result.modelWeekly[0].tokensByModel;

    expect(Object.keys(weekly)).toHaveLength(7);
    expect(weekly.other).toBe(1185);
  });

  test('weekly stacks bucket TOTAL tokens by Monday-start week of the local day', () => {
    const result = aggregate({
      scans: [
        // Saturday 2026-06-20 and Wednesday 2026-06-24: different weeks.
        scanWithModels(
          's1',
          {'claude-opus-4-8': {freshInput: 3, output: 7}},
          '2026-06-20T09:00:00Z'
        ),
        scanWithModels(
          's2',
          {'claude-opus-4-8': {cacheRead: 4, output: 9}},
          '2026-06-24T09:00:00Z'
        ),
      ],
    });

    // totalOf({freshInput: 3, output: 7}) = 10 (output alone: 7).
    // totalOf({cacheRead: 4, output: 9}) = 13 (output alone: 9).
    expect(result.modelWeekly).toEqual([
      {tokensByModel: {'claude-opus-4-8': 10}, weekStart: '2026-06-15'},
      {tokensByModel: {'claude-opus-4-8': 13}, weekStart: '2026-06-22'},
    ]);
  });

  test('modelTotals reconciles with the sum of modelWeekly across weeks', () => {
    const result = aggregate({
      scans: [
        scanWithModels(
          's1',
          {'claude-opus-4-8': {freshInput: 3, output: 7}},
          '2026-06-20T09:00:00Z'
        ),
        scanWithModels(
          's2',
          {'claude-opus-4-8': {cacheRead: 4, output: 9}},
          '2026-06-24T09:00:00Z'
        ),
      ],
    });

    const weeklySum = result.modelWeekly.reduce(
      (sum, week) => sum + (week.tokensByModel['claude-opus-4-8'] ?? 0),
      0
    );

    expect(result.modelTotals).toEqual([
      {model: 'claude-opus-4-8', totalTokens: 23},
    ]);
    expect(weeklySum).toBe(23);
  });
});

describe('KPIs', () => {
  test('totalTokens covers ALL activity, timestamped or not', () => {
    const untimed = makeScan({
      byModel: {'claude-opus-4-8': buckets({freshInput: 100, output: 50})},
      sessionId: 'untimed-session',
    });

    const result = aggregate({scans: [straddlingScan(), untimed]});

    // straddling session total (from its own byModel) = 11 + 12 = 23;
    // untimed session total = 100 + 50 = 150. Combined: 173 (output alone
    // would have been 12 + 50 = 62).
    expect(result.kpis.totalTokens).toBe(173);
    expect(result.untimedSessionIds).toEqual(['untimed-session']);
    expect(result.sessions.map(({sessionId}) => sessionId)).toEqual([
      'straddle-session',
    ]);
  });

  test('kpis.totalTokens reconciles with the heatmap sum when every session is timed', () => {
    const result = aggregate({scans: [straddlingScan()]});
    const heatmapSum = result.heatmap.reduce(
      (sum, cell) => sum + cell.totalTokens,
      0
    );

    expect(result.kpis.totalTokens).toBe(23);
    expect(heatmapSum).toBe(23);
  });

  test('estimatedAdHocDollars is null when the rate table is unusable', () => {
    expect(
      aggregate({
        rateTable: {status: 'missing'},
        scans: [straddlingScan()],
      }).kpis.estimatedAdHocDollars
    ).toBeNull();
    expect(
      aggregate({
        rateTable: {status: 'unparseable'},
        scans: [straddlingScan()],
      }).kpis.estimatedAdHocDollars
    ).toBeNull();
  });

  test('sums estimates over ad hoc sessions only, never recorded dollars', () => {
    const table = {
      cache_multipliers: {read: 0.1, write_1h: 2, write_5m: 1.25},
      models: {'claude-sonnet-4-6': [{input: 3, output: 15}]},
    };
    const recordedSession = makeScan({
      byModel: {'claude-sonnet-4-6': buckets({freshInput: 1000, output: 1000})},
      endedAt: '2026-06-26T02:00:00.000Z',
      hourlyUtc: {},
      sessionId: 'recorded-session',
      startedAt: '2026-06-26T01:00:00.000Z',
    });
    const attributedSession = makeScan({
      byModel: {'claude-sonnet-4-6': buckets({output: 1_000_000})},
      endedAt: '2026-06-26T04:00:00.000Z',
      sessionId: 'attributed-session',
      startedAt: '2026-06-26T03:00:00.000Z',
    });

    const result = aggregate({
      rateTable: {status: 'ok', table},
      recordedDollarsBySession: new Map([['recorded-session', 42]]),
      resolveAttribution: (sessionId) =>
        sessionId === 'attributed-session' ?
          {entryType: 'spec', key: 'SPEC-100'}
        : null,
      scans: [straddlingScan(), recordedSession, attributedSession],
    });

    // Only the straddling ad hoc session contributes:
    // (11 fresh * 3 + 12 output * 15) / 1e6.
    expect(result.kpis.estimatedAdHocDollars).toEqual({
      lowerBound: false,
      value: expect.closeTo(0.000213, 9),
    });

    const bySession = new Map(
      result.sessions.map((session) => [session.sessionId, session])
    );

    expect(bySession.get('recorded-session')?.dollars).toEqual({
      basis: 'recorded',
      lowerBound: false,
      value: 42,
    });
    expect(bySession.get('attributed-session')?.attribution).toEqual({
      entryType: 'spec',
      key: 'SPEC-100',
    });
  });
});

describe('session summaries', () => {
  test('reverse-chronological, uuid-fallback title becomes null, scalar totalTokens', () => {
    const untitled = makeScan({
      endedAt: '2026-06-27T10:30:00.000Z',
      sessionId: 'untitled-session',
      startedAt: '2026-06-27T10:00:00.000Z',
      title: 'untitled-session',
    });

    const result = aggregate({scans: [straddlingScan(), untitled]});

    expect(result.sessions.map(({sessionId}) => sessionId)).toEqual([
      'untitled-session',
      'straddle-session',
    ]);
    expect(result.sessions[0].title).toBeNull();
    expect(result.sessions[0].gitBranch).toBeNull();
    // Default byModel is empty: no tokens at all.
    expect(result.sessions[0].totalTokens).toBe(0);
    expect(result.sessions[1].title).toBe('Straddles UTC midnight');
    // freshInput 11 + output 12 = 23 (output alone would be 12).
    expect(result.sessions[1].totalTokens).toBe(23);
  });

  test('an unpriced claude model marks the estimate a lower bound', () => {
    const table = {
      cache_multipliers: {read: 0.1, write_1h: 2, write_5m: 1.25},
      models: {'claude-sonnet-4-6': [{input: 3, output: 15}]},
    };
    const mixedModels = makeScan({
      byModel: {
        'claude-sonnet-4-6': buckets({output: 10}),
        'claude-unlisted-1': buckets({output: 999}),
      },
      endedAt: '2026-06-26T02:00:00.000Z',
      sessionId: 'mixed-session',
      startedAt: '2026-06-26T01:00:00.000Z',
    });

    const result = aggregate({
      rateTable: {status: 'ok', table},
      scans: [mixedModels],
    });

    expect(result.sessions[0].dollars).toEqual({
      basis: 'estimated',
      lowerBound: true,
      value: expect.closeTo(0.00015, 9),
    });
    expect(result.kpis.estimatedAdHocDollars?.lowerBound).toBe(true);
  });

  test('cache-write tokens missing their TTL split mark a lower bound', () => {
    const table = {
      cache_multipliers: {read: 0.1, write_1h: 2, write_5m: 1.25},
      models: {'claude-sonnet-4-6': [{input: 3, output: 15}]},
    };
    // Old transcript lines: cacheWrite total present, 5m/1h split absent.
    const oldLines = makeScan({
      byModel: {'claude-sonnet-4-6': buckets({cacheWrite: 500, output: 10})},
      endedAt: '2026-06-26T02:00:00.000Z',
      sessionId: 'old-lines-session',
      startedAt: '2026-06-26T01:00:00.000Z',
    });

    const result = aggregate({
      rateTable: {status: 'ok', table},
      scans: [oldLines],
    });

    expect(result.sessions[0].dollars?.lowerBound).toBe(true);
  });

  test('no recorded row and an unusable table yields null dollars', () => {
    const result = aggregate({
      rateTable: {status: 'missing'},
      scans: [straddlingScan()],
    });

    expect(result.sessions[0].dollars).toBeNull();
  });

  test('activitySince is the earliest session start', () => {
    const result = aggregate({
      scans: [
        straddlingScan(),
        makeScan({
          endedAt: '2026-05-01T09:00:00.000Z',
          sessionId: 'earliest-session',
          startedAt: '2026-05-01T08:00:00.000Z',
        }),
      ],
    });

    expect(result.activitySince).toBe('2026-05-01T08:00:00.000Z');
  });

  test('no scans at all yields an empty, intentional aggregation', () => {
    const result = aggregate({});

    expect(result).toEqual({
      activitySince: null,
      heatmap: [],
      kpis: {
        activeDays: 0,
        estimatedAdHocDollars: null,
        totalTokens: 0,
      },
      modelTotals: [],
      modelWeekly: [],
      sessions: [],
      untimedSessionIds: [],
    });
  });
});
