import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {createFileCache} from '~/data/cache';
import {scanProjectDirectory, scanSession} from '~/data/parse/session-scan';
import {sortAlphabetically} from '~/data/sort';

const projectDirectory = fileURLToPath(
  new URL(
    '../../../../test/fixtures/sessions/projects/-Users-you-projects-my-app',
    import.meta.url
  )
);

const mainSessionId = '11111111-1111-4111-8111-111111111111';

describe('scanSession', () => {
  test('dedupes message.id (last-seen usage wins) and attributes subagent tokens to the parent session', async () => {
    const scan = await scanSession(
      projectDirectory,
      mainSessionId,
      createFileCache()
    );

    expect(scan.sessionId).toBe(mainSessionId);

    // Opus totals: msg_a (100/50/200/10) + msg_dup last occurrence only
    // (20/0/0/100, the SMALLER usage, proving last-seen wins) + subagent
    // msg_sub1 (7/3/0/42) attributed to this parent session.
    expect(scan.byModel['claude-opus-4-8']).toEqual({
      cacheRead: 200,
      cacheWrite: 53,
      cacheWrite1h: 0,
      cacheWrite5m: 53,
      freshInput: 127,
      output: 152,
    });

    // Sonnet totals: msg_b alone, with a 1h-only cache_creation split.
    expect(scan.byModel['claude-sonnet-4-6']).toEqual({
      cacheRead: 60,
      cacheWrite: 80,
      cacheWrite1h: 80,
      cacheWrite5m: 0,
      freshInput: 30,
      output: 9,
    });

    // msg_a, msg_dup (once), msg_b, msg_sub1.
    expect(scan.turnCount).toBe(4);
    expect(scan.models).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6']);
  });

  test('excludes <synthetic> and usage-less lines and counts each for parse health', async () => {
    const scan = await scanSession(
      projectDirectory,
      mainSessionId,
      createFileCache()
    );

    // The synthetic line's 999/999 usage appears nowhere in the totals.
    const opus = scan.byModel['claude-opus-4-8'];
    expect(opus.freshInput).toBe(127);
    expect(opus.output).toBe(152);
    expect(scan.counters).toEqual({
      syntheticExcluded: 1,
      usageMissingExcluded: 1,
    });
  });

  test('emits hourly-UTC buckets keyed by hour start, per model', async () => {
    const scan = await scanSession(
      projectDirectory,
      mainSessionId,
      createFileCache()
    );

    expect(sortAlphabetically(Object.keys(scan.hourlyUtc))).toEqual([
      '2026-06-24T10:00:00.000Z',
      '2026-06-24T11:00:00.000Z',
    ]);

    // Hour 10 holds all opus activity: msg_a + deduped msg_dup + subagent.
    expect(scan.hourlyUtc['2026-06-24T10:00:00.000Z']).toEqual({
      'claude-opus-4-8': {
        cacheRead: 200,
        cacheWrite: 53,
        cacheWrite1h: 0,
        cacheWrite5m: 53,
        freshInput: 127,
        output: 152,
      },
    });
    expect(
      scan.hourlyUtc['2026-06-24T11:00:00.000Z']['claude-sonnet-4-6'].output
    ).toBe(9);
  });

  test('derives span, duration, and last-seen gitBranch', async () => {
    const scan = await scanSession(
      projectDirectory,
      mainSessionId,
      createFileCache()
    );

    expect(scan.startedAt).toBe('2026-06-24T10:05:00.000Z');
    expect(scan.endedAt).toBe('2026-06-24T11:20:00.000Z');
    expect(scan.durationSeconds).toBe(4500);
    expect(scan.gitBranch).toBe('feature-x');
  });
});

describe('title precedence', () => {
  test('ai-title wins over last-prompt, last ai-title wins', async () => {
    const scan = await scanSession(
      projectDirectory,
      mainSessionId,
      createFileCache()
    );

    expect(scan.title).toBe('Fix the widget pipeline');
  });

  test('falls back to a truncated last-prompt when no ai-title exists', async () => {
    const scan = await scanSession(
      projectDirectory,
      '22222222-2222-4222-8222-222222222222',
      createFileCache()
    );

    expect(scan.title.startsWith('Investigate why the nightly build')).toBe(
      true
    );
    expect(scan.title.length).toBeLessThanOrEqual(80);
    expect(scan.title.endsWith('…')).toBe(true);
  });

  test('falls back to the session uuid when no title line exists', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const scan = await scanSession(
      projectDirectory,
      sessionId,
      createFileCache()
    );

    expect(scan.title).toBe(sessionId);
  });
});

describe('scanProjectDirectory', () => {
  test('scans every top-level transcript and caches per file', async () => {
    const cache = createFileCache();
    const scans = await scanProjectDirectory(projectDirectory, cache);

    expect(scans.map((scan) => scan.sessionId)).toEqual([
      mainSessionId,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    // 3 main transcripts + 1 subagent file, each cached once.
    expect(cache.size()).toBe(4);

    // A warm rescan reuses the cached per-file parses and agrees exactly.
    const rescans = await scanProjectDirectory(projectDirectory, cache);
    expect(rescans).toEqual(scans);
    expect(cache.size()).toBe(4);
  });
});
