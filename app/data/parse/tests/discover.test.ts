import {describe, expect, test} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFileCache} from '~/data/cache';
import {
  confirmCandidateDirectory,
  discoverProjectDirectories,
  encode,
  encodeSessionCwd,
  selectCandidateDirectoryNames,
} from '~/data/parse/discover';
import {scanProjectDirectory} from '~/data/parse/session-scan';

const projectsDirectory = fileURLToPath(
  new URL('../../../../test/fixtures/sessions/projects', import.meta.url)
);

const projectRoot = '/Users/you/projects/my-app';

describe('encode', () => {
  test('replaces slashes and dots with dashes', () => {
    expect(encode('/Users/you/projects/my-app')).toBe(
      '-Users-you-projects-my-app'
    );
    expect(encode('/Users/you/projects/my-app/.claude/worktrees/spec-1')).toBe(
      '-Users-you-projects-my-app--claude-worktrees-spec-1'
    );
  });
});

describe('encodeSessionCwd', () => {
  test('forward-encodes a session_cwd to its transcript directory name', () => {
    expect(
      encodeSessionCwd(
        '/Users/you/projects/my-app/.claude/worktrees/spec-001-demo'
      )
    ).toBe('-Users-you-projects-my-app--claude-worktrees-spec-001-demo');
  });
});

describe('selectCandidateDirectoryNames', () => {
  test('keeps exact and dash-prefixed matches, drops lookalike prefixes', () => {
    const names = [
      '-Users-you-projects-my-app',
      '-Users-you-projects-my-app--claude-worktrees-spec-001-demo',
      '-Users-you-projects-my-app-other',
      '-Users-you-projects-my-application',
      '-Users-you-projects-unrelated',
    ];

    expect(selectCandidateDirectoryNames(names, projectRoot)).toEqual([
      '-Users-you-projects-my-app',
      '-Users-you-projects-my-app--claude-worktrees-spec-001-demo',
      '-Users-you-projects-my-app-other',
    ]);
  });
});

describe('confirmCandidateDirectory', () => {
  test('accepts a directory whose first cwd equals the project root', async () => {
    const confirmed = await confirmCandidateDirectory(
      path.join(projectsDirectory, '-Users-you-projects-my-app'),
      projectRoot,
      createFileCache()
    );

    expect(confirmed).toBe(true);
  });

  test('accepts a worktree directory whose cwd is inside the project root', async () => {
    const confirmed = await confirmCandidateDirectory(
      path.join(
        projectsDirectory,
        '-Users-you-projects-my-app--claude-worktrees-spec-001-demo'
      ),
      projectRoot,
      createFileCache()
    );

    expect(confirmed).toBe(true);
  });

  test('rejects a prefix-collision directory whose cwd is a sibling project', async () => {
    const confirmed = await confirmCandidateDirectory(
      path.join(projectsDirectory, '-Users-you-projects-my-app-other'),
      projectRoot,
      createFileCache()
    );

    expect(confirmed).toBe(false);
  });

  test('rejects a directory whose lines never carry a cwd', async () => {
    const confirmed = await confirmCandidateDirectory(
      path.join(projectsDirectory, '-Users-you-projects-my-app-nocwd'),
      projectRoot,
      createFileCache()
    );

    expect(confirmed).toBe(false);
  });
});

describe('discoverProjectDirectories', () => {
  test('returns only confirmed directories, worktrees included', async () => {
    const discovered = await discoverProjectDirectories(
      projectsDirectory,
      projectRoot,
      createFileCache()
    );

    expect(discovered).toEqual([
      path.join(projectsDirectory, '-Users-you-projects-my-app'),
      path.join(
        projectsDirectory,
        '-Users-you-projects-my-app--claude-worktrees-spec-001-demo'
      ),
    ]);
  });

  test('discovery and session scans share one FileCache without value collisions', async () => {
    // The P0 cache is keyed by path only, so confirmation and scanning must
    // store the SAME value type per transcript file. Discover, then scan the
    // confirmed root directory through the identical cache instance.
    const cache = createFileCache();

    const [rootDirectory] = await discoverProjectDirectories(
      projectsDirectory,
      projectRoot,
      cache
    );

    const scans = await scanProjectDirectory(rootDirectory, cache);

    expect(scans.map((scan) => scan.sessionId)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    // The cached-by-discovery file still yields a full scan, not a cwd string.
    expect(scans[0]?.turnCount).toBe(4);
  });

  test('returns an empty list when the projects directory is missing', async () => {
    const discovered = await discoverProjectDirectories(
      path.join(projectsDirectory, 'does-not-exist'),
      projectRoot,
      createFileCache()
    );

    expect(discovered).toEqual([]);
  });
});
