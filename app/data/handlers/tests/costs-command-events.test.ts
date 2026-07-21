import {afterAll, describe, expect, test, vi} from 'vitest';
import {createFileCache} from '~/data/cache';
import type {HandlerContext} from '~/data/handlers/costs';
import {getCosts} from '~/data/handlers/costs';
import type {CommandEvent} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';
import type {MaterializedFixtureProject} from '../../../../test/helpers/fixture-project';
import {materializeFixtureProject} from '../../../../test/helpers/fixture-project';

/**
 * Task 2 (thread `commandEvents` through `costs.ts`): proves the HANDLER's
 * own plumbing, isolated from `buildCostEntries` (W4-owned, mid-flight and
 * not yet returning `commandEvents` as of this Phase 8 P2 build). Stubs the
 * aggregate seam so this suite cannot pass by accident via
 * `costsResponseSchema`'s `.default([])`, which exists for OLD fixtures, not
 * to paper over a handler that forgot to pass real data.
 * `app/data/aggregate/tests/cost-entries.test.ts` (W4-owned) is the place
 * that proves `buildCommandEvents` itself once it lands.
 */
const buildCostEntriesMock = vi.fn();

vi.mock('~/data/aggregate/cost-entries', () => ({
  buildCostEntries: (
    ...args: Parameters<typeof buildCostEntriesMock>
  ): ReturnType<typeof buildCostEntriesMock> => buildCostEntriesMock(...args),
}));

const sampleCommandEvent: CommandEvent = {
  at: '2026-07-10T09:00:00.000Z',
  byAgentType: null,
  byModel: null,
  command: 'gaia-debt',
  durationSeconds: 120,
  github: null,
  recordedDollars: 0.42,
  runId: 'gaia-debt-20260710T090000Z-aaaa',
  sessionId: 'ffffffff-1111-2222-3333-444444444444',
  totalTokens: 4200,
};

const sampleAdHocReview = {
  at: '2026-07-01T00:00:00.000Z',
  durationSeconds: 60,
  recordedDollars: 0.75,
  reviewId: 'agent-review-1',
  sessionId: 'eeeeeeee-1111-2222-3333-444444444444',
  totalTokens: 900,
};

const cleanups: (() => void)[] = [];

afterAll(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }
});

const materialize = (): MaterializedFixtureProject => {
  const project = materializeFixtureProject('empty-project');

  cleanups.push(project.cleanup);

  return project;
};

const contextFor = (project: MaterializedFixtureProject): HandlerContext => ({
  cache: createFileCache(),
  config: {
    claudeConfigDir: project.claudeConfigDir,
    projectName: project.projectName,
    projectRoot: project.projectRoot,
  },
});

describe('getCosts threads commandEvents from buildCostEntries', () => {
  test('command events present in the fixture reach the response, non-empty', async () => {
    buildCostEntriesMock.mockReturnValue({
      adHocReviews: [],
      commandEvents: [sampleCommandEvent],
      costSince: null,
      entries: [],
      recordedDollars: 0.42,
    });

    const response = await getCosts(contextFor(materialize()));

    expect(() => costsResponseSchema.parse(response)).not.toThrow();
    expect(response.commandEvents).toEqual([sampleCommandEvent]);
  });

  test('a response with no command rows returns commandEvents: [], not undefined', async () => {
    buildCostEntriesMock.mockReturnValue({
      adHocReviews: [],
      commandEvents: [],
      costSince: null,
      entries: [],
      recordedDollars: 0,
    });

    const response = await getCosts(contextFor(materialize()));

    expect(response.commandEvents).toEqual([]);
  });

  test('adHocReviews still reaches the response unchanged (regression guard)', async () => {
    buildCostEntriesMock.mockReturnValue({
      adHocReviews: [sampleAdHocReview],
      commandEvents: [sampleCommandEvent],
      costSince: null,
      entries: [],
      recordedDollars: 1.17,
    });

    const response = await getCosts(contextFor(materialize()));

    expect(response.adHocReviews).toEqual([sampleAdHocReview]);
  });
});
