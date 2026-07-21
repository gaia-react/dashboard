import {describe, expect, test} from 'vitest';
import type {ActivityResponse, CostsResponse} from '~/data/schemas/api';
import {
  activityResponseSchema,
  apiErrorSchema,
  commandEventSchema,
  costEntrySchema,
  costsResponseSchema,
} from '~/data/schemas/api';

/**
 * Hand-built valid response objects, typed against the inferred types so the
 * compiler and the schema assert the same contract. Values mirror the
 * mini-project composite fixture in spirit (neutral paths only).
 */
const validCostsResponse: CostsResponse = {
  adHocReviews: [],
  commandEvents: [],
  coverage: {costSince: '2026-06-20T09:05:05Z'},
  entries: [
    {
      entryType: 'spec',
      github: {number: 769, repo: 'gaia-react/gaia', type: 'pr'},
      id: 'SPEC-100',
      key: 'SPEC-100',
      partial: false,
      phases: [
        {
          byAgentType: {main: 5800},
          byModel: {'claude-opus-4-8': 13_050},
          durationSeconds: 700,
          kind: 'execute',
          recordedDollars: 1.37,
          source: 'native',
          totalTokens: 13_650,
        },
        {
          byAgentType: null,
          byModel: null,
          durationSeconds: 500,
          kind: 'spec',
          recordedDollars: null,
          source: 'backfill',
          totalTokens: 154,
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
        durationSeconds: 1200,
        recordedDollars: 1.37,
        totalTokens: 13_804,
      },
    },
    {
      entryType: 'plan-slug',
      github: null,
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
        durationSeconds: 3067,
        recordedDollars: 13.58,
        totalTokens: 11_757_520,
      },
    },
  ],
  kpis: {
    plans: {merged: 1, total: 1},
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
    {date: '2026-06-24', sessionCount: 1, totalTokens: 1131},
    {date: '2026-06-25', sessionCount: 1, totalTokens: 10},
  ],
  kpis: {
    activeDays: 2,
    estimatedAdHocDollars: {lowerBound: true, value: 0.42},
    totalTokens: 1141,
  },
  modelTotals: [
    {model: 'claude-opus-4-8', totalTokens: 962},
    {model: 'claude-sonnet-4-6', totalTokens: 179},
  ],
  modelWeekly: [
    {
      tokensByModel: {'claude-opus-4-8': 557, 'claude-sonnet-4-6': 9},
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
      dollars: {basis: 'recorded', lowerBound: false, value: 1.37},
      durationSeconds: 1140,
      endedAt: '2026-07-01T10:20:00.000Z',
      gitBranch: 'spec-100-fixture',
      models: ['claude-opus-4-8'],
      sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
      startedAt: '2026-07-01T10:01:00.000Z',
      title: 'Fix the widget pipeline',
      totalTokens: 15,
      turnCount: 1,
    },
    {
      attribution: null,
      dollars: null,
      durationSeconds: 4500,
      endedAt: '2026-06-24T11:20:00.000Z',
      gitBranch: null,
      models: ['claude-opus-4-8', 'claude-sonnet-4-6'],
      sessionId: '11111111-1111-4111-8111-111111111111',
      startedAt: '2026-06-24T10:05:00.000Z',
      title: null,
      totalTokens: 1131,
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

  test('defaults adHocReviews to an empty array when a pre-SPEC-032 response omits it', () => {
    const {adHocReviews, ...withoutAdHocReviews} = validCostsResponse;
    const parsed = costsResponseSchema.parse(withoutAdHocReviews);

    expect(parsed.adHocReviews).toEqual([]);
  });

  test('defaults commandEvents to an empty array when an older response omits it', () => {
    const {commandEvents, ...withoutCommandEvents} = validCostsResponse;
    const parsed = costsResponseSchema.parse(withoutCommandEvents);

    expect(parsed.commandEvents).toEqual([]);
  });

  test('round-trips the SPEC-032 audit drill-down, ad-hoc review, and command event shapes', () => {
    const [entry] = validCostsResponse.entries;
    const [phase] = entry.phases;
    const enriched: CostsResponse = {
      ...validCostsResponse,
      adHocReviews: [
        {
          at: '2026-07-05T14:00:00.000Z',
          durationSeconds: 60,
          recordedDollars: 0.75,
          reviewId: 'agent-adhoc0001',
          sessionId: 'ssssssss-1111-2222-3333-444444444444',
          totalTokens: 17,
        },
      ],
      commandEvents: [
        {
          at: '2026-07-14T11:49:55.000Z',
          byAgentType: {main: 15},
          byModel: {'claude-opus-4-8': 15},
          command: 'gaia-debt',
          durationSeconds: 90,
          github: {number: 769, repo: 'gaia-react/gaia', type: 'pr'},
          recordedDollars: 0.01,
          runId: 'gaia-debt-20260714T114955Z-7b0a',
          sessionId: 'eeeeeeee-1111-2222-3333-444444444444',
          totalTokens: 15,
        },
      ],
      entries: [
        {
          ...entry,
          phases: [
            {
              ...phase,
              audit: {
                dollars: 0.01,
                elapsedSeconds: 45,
                intensity: 'standard',
                lenses: ['FG', 'TST'],
                totalTokens: 95,
              },
            },
            ...entry.phases.slice(1),
          ],
        },
      ],
    };

    expect(costsResponseSchema.parse(enriched)).toEqual(enriched);
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

describe('costEntrySchema', () => {
  test('accepts a null github', () => {
    const [entry] = validCostsResponse.entries;
    const result = costEntrySchema.safeParse({...entry, github: null});

    expect(result.success).toBe(true);
  });

  test('accepts a phase byModel as a scalar map', () => {
    const [entry] = validCostsResponse.entries;
    const [phase] = entry.phases;
    const result = costEntrySchema.safeParse({
      ...entry,
      phases: [{...phase, byModel: {'claude-opus-4-8': 13_050}}],
    });

    expect(result.success).toBe(true);
  });

  test('rejects the old ModelBuckets shape for a phase byModel', () => {
    const [entry] = validCostsResponse.entries;
    const [phase] = entry.phases;
    const result = costEntrySchema.safeParse({
      ...entry,
      phases: [
        {
          ...phase,
          byModel: {
            'claude-opus-4-8': {
              cacheRead: 12_000,
              cacheWrite1h: 400,
              cacheWrite5m: 600,
              freshInput: 150,
              output: 500,
            },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('commandEventSchema', () => {
  const validCommandEvent = {
    at: '2026-07-14T11:49:55.000Z',
    byAgentType: {main: 15},
    byModel: {'claude-opus-4-8': 15},
    command: 'gaia-debt',
    durationSeconds: 90,
    github: {number: 769, repo: 'gaia-react/gaia', type: 'pr'},
    recordedDollars: 0.01,
    runId: 'gaia-debt-20260714T114955Z-7b0a',
    sessionId: 'eeeeeeee-1111-2222-3333-444444444444',
    totalTokens: 15,
  };

  test('rejects a missing command', () => {
    const {command, ...withoutCommand} = validCommandEvent;
    const result = commandEventSchema.safeParse(withoutCommand);

    expect(result.success).toBe(false);
  });

  test('accepts null runId, durationSeconds, recordedDollars, and byModel', () => {
    const result = commandEventSchema.safeParse({
      ...validCommandEvent,
      byModel: null,
      durationSeconds: null,
      recordedDollars: null,
      runId: null,
    });

    expect(result.success).toBe(true);
  });

  test('accepts a null github (4 of 33 gaia-debt rows carry none)', () => {
    const result = commandEventSchema.safeParse({
      ...validCommandEvent,
      github: null,
    });

    expect(result.success).toBe(true);
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
