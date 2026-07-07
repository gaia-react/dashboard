import {afterAll, describe, expect, test} from 'vitest';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {createFileCache} from '~/data/cache';
import type {ActivityHandlerContext} from '~/data/handlers/activity';
import {handleActivity} from '~/data/handlers/activity';
import type {ActivityResponse} from '~/data/schemas/api';
import {activityResponseSchema} from '~/data/schemas/api';
import type {MaterializedFixtureProject} from '../../../../test/helpers/fixture-project';
import {materializeFixtureProject} from '../../../../test/helpers/fixture-project';

const cleanups: (() => void)[] = [];

afterAll(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }
});

const materialize = (
  name: Parameters<typeof materializeFixtureProject>[0]
): MaterializedFixtureProject => {
  const project = materializeFixtureProject(name);

  cleanups.push(project.cleanup);

  return project;
};

const contextFor = (
  project: MaterializedFixtureProject
): ActivityHandlerContext => ({
  cache: createFileCache(),
  config: {
    claudeConfigDir: project.claudeConfigDir,
    projectName: project.projectName,
    projectRoot: project.projectRoot,
  },
});

const dates = (response: ActivityResponse): string[] =>
  response.heatmap.map(({date}) => date);

const sessionById = (
  response: ActivityResponse,
  prefix: string
): ActivityResponse['sessions'][number] => {
  const session = response.sessions.find(({sessionId}) =>
    sessionId.startsWith(prefix)
  );

  if (!session) {
    throw new Error(`no session summary starting with ${prefix}`);
  }

  return session;
};

describe('handleActivity on the mini-project fixture', () => {
  test('produces a Zod-valid ActivityResponse', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );

    expect(() => activityResponseSchema.parse(response)).not.toThrow();
  });

  test('scans the confirmed directories only, rejecting the sibling project', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );

    // Root dir: 11111111, 22222222, bbbbbbbb; worktree dir: aaaaaaaa.
    // The -other sibling (44444444) fails cwd confirmation.
    expect(response.scan.sessionCount).toBe(4);
    expect(
      response.sessions
        .map(({sessionId}) => sessionId.slice(0, 8))
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['11111111', '22222222', 'aaaaaaaa', 'bbbbbbbb']);
    // 3 root transcripts + 1 subagent file + 1 worktree transcript.
    expect(response.scan.fileCount).toBe(5);
    expect(response.scan.activitySince).toBe('2026-06-20T09:01:00.000Z');
  });

  test('session dollars: recorded where cost.jsonl priced it, else estimated', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );

    // aaaaaaaa: SPEC-100 execute terminal row (final:true, seq 1) says 1.37.
    expect(sessionById(response, 'aaaaaaaa').dollars).toEqual({
      basis: 'recorded',
      lowerBound: false,
      value: 1.37,
    });

    // bbbbbbbb: PLAN-001 rows carry null dollars, so it is W4-estimated:
    // opus 5/25 rates, fresh 40, write5m 300, read 6300, output 100.
    expect(sessionById(response, 'bbbbbbbb').dollars).toEqual({
      basis: 'estimated',
      lowerBound: false,
      value: expect.closeTo(0.007725, 9),
    });
  });

  test('model mix includes subagent traffic and never <synthetic>', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );

    const models = response.modelTotals.map(({model}) => model);

    expect(models).not.toContain('<synthetic>');

    const opus = response.modelTotals.find(
      ({model}) => model === 'claude-opus-4-8'
    );

    // 11111111 main (10 + last-wins duplicate 100) + subagent 42, bbbbbbbb
    // 100, aaaaaaaa 500.
    expect(opus?.buckets.output).toBe(752);

    const sonnet = response.modelTotals.find(
      ({model}) => model === 'claude-sonnet-4-6'
    );

    // 11111111 (9) + 22222222 (12).
    expect(sonnet?.buckets.output).toBe(21);
  });

  test('session summaries carry titles, branches, and turn counts', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );
    const first = sessionById(response, '11111111');

    expect(first.title).toBe('Fix the widget pipeline');
    expect(first.gitBranch).toBe('feature-x');
    // msg_a + deduped msg_dup + msg_b + subagent msg_sub1.
    expect(first.turnCount).toBe(4);
    // Reverse-chronological: aaaaaaaa (Jul 1) first, bbbbbbbb (Jun 20) last.
    expect(response.sessions[0].sessionId.startsWith('aaaaaaaa')).toBe(true);
    expect(response.sessions.at(-1)?.sessionId.startsWith('bbbbbbbb')).toBe(
      true
    );
  });

  test('the tz query folds the straddling session per timezone', async () => {
    const project = materialize('mini-project');
    const context = contextFor(project);

    const utc = await handleActivity(context, {});
    const tokyo = await handleActivity(context, {tz: 'Asia/Tokyo'});
    const losAngeles = await handleActivity(context, {
      tz: 'America/Los_Angeles',
    });

    // 22222222 spans 23:30Z Jun 25 -> 00:30Z Jun 26.
    expect(dates(utc)).toContain('2026-06-25');
    expect(dates(utc)).toContain('2026-06-26');
    expect(dates(tokyo)).toContain('2026-06-26');
    expect(dates(tokyo)).not.toContain('2026-06-25');
    expect(dates(losAngeles)).toContain('2026-06-25');
    expect(dates(losAngeles)).not.toContain('2026-06-26');
  });

  test('an invalid tz falls back to UTC', async () => {
    const project = materialize('mini-project');
    const context = contextFor(project);

    const utc = await handleActivity(context, {});
    const invalid = await handleActivity(context, {tz: 'Not/A_Zone'});

    expect(invalid.heatmap).toEqual(utc.heatmap);
  });

  test('the default attribution join flags sessions and shrinks the ad hoc estimate', async () => {
    const project = materialize('mini-project');
    const base = contextFor(project);

    // Default: W7's join over cost.jsonl attributes aaaaaaaa and bbbbbbbb.
    const wired = await handleActivity(base);
    // Injected override (the test seam): everything ad hoc.
    const allAdHoc = await handleActivity({
      ...base,
      resolveAttribution: () => null,
    });

    expect(sessionById(wired, 'aaaaaaaa').attribution).toEqual({
      entryType: 'spec',
      key: 'SPEC-100',
    });
    expect(sessionById(wired, 'bbbbbbbb').attribution).toEqual({
      entryType: 'plan',
      key: 'PLAN-001',
    });
    expect(sessionById(wired, '11111111').attribution).toBeNull();
    expect(sessionById(allAdHoc, 'bbbbbbbb').attribution).toBeNull();

    // bbbbbbbb's estimate leaves the ad hoc KPI once attributed; recorded
    // dollars (aaaaaaaa) were never in it (SPEC section 5 rule 3).
    const wiredEstimate = wired.kpis.estimatedAdHocDollars;
    const allAdHocEstimate = allAdHoc.kpis.estimatedAdHocDollars;

    expect(wiredEstimate).not.toBeNull();
    expect(allAdHocEstimate).not.toBeNull();
    expect(wiredEstimate!.value).toBeCloseTo(
      allAdHocEstimate!.value - 0.007725,
      9
    );
  });

  test('parse health reports the session-logs source, including the skipped subagent-less noise', async () => {
    const response = await handleActivity(
      contextFor(materialize('mini-project'))
    );

    expect(response.parseHealth.counters).toHaveLength(1);

    const [counter] = response.parseHealth.counters;

    expect(counter.source).toBe('session-logs');
    expect(counter.filesScanned).toBe(5);
    // 11111111 carries one usage-less assistant line.
    expect(counter.linesSkipped).toBeGreaterThanOrEqual(1);
    expect(response.parseHealth.unknownKinds).toEqual([]);
    expect(response.parseHealth.unknownStatuses).toEqual([]);
  });
});

describe('handleActivity on the empty-project fixture', () => {
  test('yields a structurally valid, empty-but-intentional response', async () => {
    const response = await handleActivity(
      contextFor(materialize('empty-project'))
    );

    expect(() => activityResponseSchema.parse(response)).not.toThrow();
    // No cost.jsonl at all: activity still renders, nothing looks broken.
    expect(response.scan.sessionCount).toBe(2);
    expect(response.scan.fileCount).toBe(2);
    expect(response.heatmap).toHaveLength(2);
    expect(response.sessions).toHaveLength(2);
    expect(
      response.sessions.every(
        (session) => session.dollars?.basis === 'estimated'
      )
    ).toBe(true);
    // The rate table IS present, so the ad hoc estimate is real, not null.
    expect(response.kpis.estimatedAdHocDollars).toEqual({
      lowerBound: false,
      value: expect.closeTo(0.001175, 9),
    });
    // 88888888 has no ai-title / last-prompt: uuid fallback -> null title.
    expect(sessionById(response, '88888888').title).toBeNull();
    expect(sessionById(response, '88888888').gitBranch).toBeNull();
  });

  test('an unusable rate table disables every estimated figure', async () => {
    const project = materialize('empty-project');

    writeFileSync(
      path.join(project.projectRoot, '.gaia', 'scripts', 'token-rates.json'),
      'not json at all'
    );

    const response = await handleActivity(contextFor(project));

    expect(response.kpis.estimatedAdHocDollars).toBeNull();
    expect(response.sessions.every(({dollars}) => dollars === null)).toBe(true);
    // Token figures still render.
    expect(response.kpis.totalBuckets.output).toBeGreaterThan(0);
  });
});
