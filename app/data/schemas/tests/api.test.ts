import {describe, expect, test} from 'vitest';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {
  activityResponseSchema,
  apiErrorSchema,
  costsResponseSchema,
} from '~/data/schemas/api';

/**
 * Hand-built valid response objects, typed against the inferred types so the
 * compiler and the schema assert the same contract. Values mirror the
 * mini-project composite fixture in spirit (neutral paths only).
 */
const validCostsResponse: CostsResponse = {
  coverage: {costSince: '2026-06-20T09:05:05Z'},
  entries: [
    {
      entryType: 'spec',
      id: 'SPEC-100',
      key: 'SPEC-100',
      partial: false,
      phases: [
        {
          buckets: {
            cacheRead: 12_000,
            cacheWrite: 1000,
            freshInput: 150,
            output: 500,
          },
          byAgentType: {
            main: {
              cacheRead: 5000,
              cacheWrite1h: 400,
              cacheWrite5m: 0,
              freshInput: 100,
              output: 300,
            },
          },
          byModel: {
            'claude-opus-4-8': {
              cacheRead: 12_000,
              cacheWrite1h: 400,
              cacheWrite5m: 600,
              freshInput: 150,
              output: 500,
            },
          },
          durationSeconds: 700,
          kind: 'execute',
          recordedDollars: 1.37,
          source: 'native',
        },
        {
          buckets: {cacheRead: 41, cacheWrite: 51, freshInput: 11, output: 51},
          byAgentType: null,
          byModel: null,
          durationSeconds: 500,
          kind: 'spec',
          recordedDollars: null,
          source: 'backfill',
        },
      ],
      sessions: [
        {
          kind: 'execute',
          logFound: true,
          sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
        },
        {
          kind: 'spec',
          logFound: false,
          sessionId: 'dddddddd-1111-2222-3333-444444444444',
        },
      ],
      sortAt: '2026-06-28T09:00:00Z',
      source: 'mixed',
      status: 'merged',
      title: 'Fixture: worktree cost tracking end to end.',
      totals: {
        buckets: {
          cacheRead: 12_041,
          cacheWrite: 1051,
          freshInput: 161,
          output: 551,
        },
        durationSeconds: 1200,
        recordedDollars: 1.37,
      },
    },
    {
      entryType: 'plan-slug',
      id: null,
      key: 'slug:legacy-plan',
      partial: false,
      phases: [],
      sessions: [],
      sortAt: '2026-07-04T08:59:10Z',
      source: 'backfill',
      status: null,
      title: 'legacy-plan',
      totals: {
        buckets: {
          cacheRead: 10_960_588,
          cacheWrite: 578_313,
          freshInput: 77_523,
          output: 141_096,
        },
        durationSeconds: 3067,
        recordedDollars: 13.58,
      },
    },
  ],
  kpis: {
    plans: {total: 1},
    recordedDollars: 14.95,
    specs: {merged: 2, total: 3},
  },
  parseHealth: {
    counters: [
      {
        filesScanned: 1,
        filesUnparseable: 0,
        linesRead: 11,
        linesSkipped: 1,
        source: 'cost.jsonl',
      },
    ],
    notes: [],
    unknownKinds: ['review'],
    unknownStatuses: [],
  },
  project: {
    claudeConfigDir: '/Users/you/.claude',
    name: 'my-app',
    root: '/Users/you/projects/my-app',
  },
  rateTable: {id: 'sha256:aaaaaaaaaaaaaaaa', status: 'ok'},
};

const validActivityResponse: ActivityResponse = {
  heatmap: [
    {
      buckets: {cacheRead: 260, cacheWrite: 133, freshInput: 177, output: 561},
      date: '2026-06-24',
      sessionCount: 1,
    },
    {
      buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 5, output: 5},
      date: '2026-06-25',
      sessionCount: 1,
    },
  ],
  kpis: {
    activeDays: 2,
    estimatedAdHocDollars: {lowerBound: true, value: 0.42},
    totalBuckets: {
      cacheRead: 260,
      cacheWrite: 133,
      freshInput: 182,
      output: 566,
    },
  },
  modelTotals: [
    {
      buckets: {cacheRead: 200, cacheWrite: 53, freshInput: 152, output: 557},
      model: 'claude-opus-4-8',
    },
    {
      buckets: {cacheRead: 60, cacheWrite: 80, freshInput: 30, output: 9},
      model: 'claude-sonnet-4-6',
    },
  ],
  modelWeekly: [
    {
      outputByModel: {'claude-opus-4-8': 557, 'claude-sonnet-4-6': 9},
      weekStart: '2026-06-22',
    },
  ],
  parseHealth: {
    counters: [
      {
        filesScanned: 4,
        filesUnparseable: 0,
        linesRead: 18,
        linesSkipped: 0,
        source: 'session-logs',
      },
    ],
    notes: [],
    unknownKinds: [],
    unknownStatuses: [],
  },
  scan: {
    activitySince: '2026-06-24T10:05:00.000Z',
    fileCount: 4,
    scannedAt: '2026-07-07T00:00:00Z',
    sessionCount: 3,
  },
  sessions: [
    {
      attribution: {entryType: 'spec', key: 'SPEC-100'},
      buckets: {cacheRead: 0, cacheWrite: 0, freshInput: 11, output: 4},
      dollars: {basis: 'recorded', lowerBound: false, value: 1.37},
      durationSeconds: 1140,
      endedAt: '2026-07-01T10:20:00.000Z',
      gitBranch: 'spec-100-fixture',
      models: ['claude-opus-4-8'],
      sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
      startedAt: '2026-07-01T10:01:00.000Z',
      title: 'Fix the widget pipeline',
      turnCount: 1,
    },
    {
      attribution: null,
      buckets: {cacheRead: 260, cacheWrite: 133, freshInput: 177, output: 561},
      dollars: null,
      durationSeconds: 4500,
      endedAt: '2026-06-24T11:20:00.000Z',
      gitBranch: null,
      models: ['claude-opus-4-8', 'claude-sonnet-4-6'],
      sessionId: '11111111-1111-4111-8111-111111111111',
      startedAt: '2026-06-24T10:05:00.000Z',
      title: null,
      turnCount: 4,
    },
  ],
};

describe('costsResponseSchema', () => {
  test('round-trips a hand-built valid response', () => {
    expect(costsResponseSchema.parse(validCostsResponse)).toEqual(
      validCostsResponse
    );
  });

  test('rejects an out-of-vocabulary rateTable status', () => {
    const result = costsResponseSchema.safeParse({
      ...validCostsResponse,
      rateTable: {id: null, status: 'degraded'},
    });

    expect(result.success).toBe(false);
  });

  test('rejects a non-UTC entry timestamp', () => {
    const [entry] = validCostsResponse.entries;
    const result = costsResponseSchema.safeParse({
      ...validCostsResponse,
      entries: [{...entry, sortAt: '2026-06-28T09:00:00+09:00'}],
    });

    expect(result.success).toBe(false);
  });
});

describe('activityResponseSchema', () => {
  test('round-trips a hand-built valid response', () => {
    expect(activityResponseSchema.parse(validActivityResponse)).toEqual(
      validActivityResponse
    );
  });

  test('rejects a session dollars basis outside recorded/estimated', () => {
    const [attributed] = validActivityResponse.sessions;
    const result = activityResponseSchema.safeParse({
      ...validActivityResponse,
      sessions: [
        {
          ...attributed,
          dollars: {basis: 'guessed', lowerBound: false, value: 1},
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects a heatmap date that is not YYYY-MM-DD', () => {
    const [day] = validActivityResponse.heatmap;
    const result = activityResponseSchema.safeParse({
      ...validActivityResponse,
      heatmap: [{...day, date: '2026-06-24T00:00:00Z'}],
    });

    expect(result.success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  test('round-trips the non-200 error envelope', () => {
    const envelope = {
      error: {code: 'project_not_found', message: 'No .gaia directory found'},
    };

    expect(apiErrorSchema.parse(envelope)).toEqual(envelope);
  });
});
