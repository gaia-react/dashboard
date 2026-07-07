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

/** A session with activity at 23:30Z and 00:30Z across a UTC day boundary. */
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
  test('a UTC-midnight-straddling session lands on two UTC days', () => {
    const result = aggregate({scans: [straddlingScan()], timeZone: 'UTC'});

    expect(result.heatmap).toEqual([
      {
        buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 5, output: 5},
        date: '2026-06-25',
        sessionCount: 1,
      },
      {
        buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 6, output: 7},
        date: '2026-06-26',
        sessionCount: 1,
      },
    ]);
    expect(result.kpis.activeDays).toBe(2);
  });

  test('the same session folds into ONE local day in Asia/Tokyo (UTC+9)', () => {
    const result = aggregate({
      scans: [straddlingScan()],
      timeZone: 'Asia/Tokyo',
    });

    expect(result.heatmap).toEqual([
      {
        buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 11, output: 12},
        date: '2026-06-26',
        sessionCount: 1,
      },
    ]);
    expect(result.kpis.activeDays).toBe(1);
  });

  test('and into the EARLIER local day in America/Los_Angeles (UTC-7)', () => {
    const result = aggregate({
      scans: [straddlingScan()],
      timeZone: 'America/Los_Angeles',
    });

    expect(result.heatmap).toEqual([
      {
        buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 11, output: 12},
        date: '2026-06-25',
        sessionCount: 1,
      },
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

const scanWithModels = (
  sessionId: string,
  outputByModel: Record<string, number>,
  hour: string
): SessionScan => {
  const byModel = Object.fromEntries(
    Object.entries(outputByModel).map(([model, output]) => [
      model,
      buckets({output}),
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
  test('totals sum across sessions, sorted by output descending', () => {
    const result = aggregate({
      scans: [
        scanWithModels('s1', {'claude-opus-4-8': 10}, '2026-06-01T10:00:00Z'),
        scanWithModels(
          's2',
          {'claude-opus-4-8': 5, 'claude-sonnet-4-6': 40},
          '2026-06-02T10:00:00Z'
        ),
      ],
    });

    expect(result.modelTotals.map(({model}) => model)).toEqual([
      'claude-sonnet-4-6',
      'claude-opus-4-8',
    ]);
    expect(result.modelTotals[1].buckets.output).toBe(15);
  });

  test('more than 6 models: the tail groups into "other", sums preserved', () => {
    const outputs: Record<string, number> = {};

    for (let rank = 1; rank <= 8; rank += 1) {
      outputs[`claude-model-${rank}`] = 100 - rank;
    }

    const result = aggregate({
      scans: [scanWithModels('s1', outputs, '2026-06-03T10:00:00Z')],
    });

    expect(result.modelTotals).toHaveLength(7);
    expect(result.modelTotals.at(-1)?.model).toBe('other');
    // The two smallest series (92 + 93) fold into "other".
    expect(result.modelTotals.at(-1)?.buckets.output).toBe(185);

    const weekly = result.modelWeekly[0].outputByModel;

    expect(Object.keys(weekly)).toHaveLength(7);
    expect(weekly.other).toBe(185);
  });

  test('weekly stacks bucket output by Monday-start week of the local day', () => {
    const result = aggregate({
      scans: [
        // Saturday 2026-06-20 and Wednesday 2026-06-24: different weeks.
        scanWithModels('s1', {'claude-opus-4-8': 7}, '2026-06-20T09:00:00Z'),
        scanWithModels('s2', {'claude-opus-4-8': 9}, '2026-06-24T09:00:00Z'),
      ],
    });

    expect(result.modelWeekly).toEqual([
      {outputByModel: {'claude-opus-4-8': 7}, weekStart: '2026-06-15'},
      {outputByModel: {'claude-opus-4-8': 9}, weekStart: '2026-06-22'},
    ]);
  });
});

describe('KPIs', () => {
  test('totalBuckets covers ALL activity, timestamped or not', () => {
    const untimed = makeScan({
      byModel: {'claude-opus-4-8': buckets({freshInput: 100, output: 50})},
      sessionId: 'untimed-session',
    });

    const result = aggregate({scans: [straddlingScan(), untimed]});

    expect(result.kpis.totalBuckets).toEqual({
      cacheRead: 0,
      cacheWrite: 0,
      freshInput: 111,
      output: 62,
    });
    expect(result.untimedSessionIds).toEqual(['untimed-session']);
    expect(result.sessions.map(({sessionId}) => sessionId)).toEqual([
      'straddle-session',
    ]);
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
  test('reverse-chronological, uuid-fallback title becomes null', () => {
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
    expect(result.sessions[1].title).toBe('Straddles UTC midnight');
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
        totalBuckets: {cacheRead: 0, cacheWrite: 0, freshInput: 0, output: 0},
      },
      modelTotals: [],
      modelWeekly: [],
      sessions: [],
      untimedSessionIds: [],
    });
  });
});
