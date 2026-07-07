import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {createFileCache} from '~/data/cache';
import {readPlanLedger, readSpecLedger} from '~/data/parse/ledgers';

const fixturePath = (name: string): string =>
  fileURLToPath(
    new URL(`../../../../test/fixtures/ledgers/${name}`, import.meta.url)
  );

describe('readSpecLedger', () => {
  test('returns normalized entries in ledger order without inventing gap ids', async () => {
    const result = await readSpecLedger(
      fixturePath('specs-ledger.json'),
      createFileCache()
    );

    expect(result.errors).toEqual([]);
    // SPEC-004 is absent from the fixture; the gap stays a gap.
    expect(result.entries.map((entry) => entry.id)).toEqual([
      'SPEC-001',
      'SPEC-002',
      'SPEC-003',
      'SPEC-005',
      'SPEC-006',
    ]);

    expect(result.entries[0]).toEqual({
      allocatedAt: '2026-05-05T23:25:51Z',
      completedAt: '2026-05-09T08:22:10Z',
      id: 'SPEC-001',
      source: 'backfilled',
      status: 'merged',
      title:
        'GAIA CI auto-maintenance system shipped to every adopter (smart cron, auto-merge, auto-revert).',
    });

    // Unmerged spec: no completion timestamp; unknown status passes through.
    expect(result.entries[1]?.completedAt).toBeNull();
    expect(result.entries[3]?.status).toBe('superseded');
    // Unknown provenance value survives normalization verbatim too.
    expect(result.entries[4]?.source).toBe('imported');
  });
});

describe('degrade and caching', () => {
  test('a missing ledger file degrades to an empty list with a surfaced error', async () => {
    const result = await readSpecLedger(
      fixturePath('does-not-exist.json'),
      createFileCache()
    );

    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('ENOENT');
  });

  test('re-reading an unchanged ledger hits the file cache instead of re-parsing', async () => {
    const cache = createFileCache();
    const path = fixturePath('specs-ledger.json');

    const first = await readSpecLedger(path, cache);
    const second = await readSpecLedger(path, cache);

    expect(cache.size()).toBe(1);
    // Same memoized result object, not a re-parse.
    expect(second.entries).toBe(first.entries);
  });
});

describe('defensive titles', () => {
  test('an empty title degrades to the entry id instead of a blank cell', async () => {
    const specs = await readSpecLedger(
      fixturePath('specs-ledger.json'),
      createFileCache()
    );
    const oldPlans = await readPlanLedger(
      fixturePath('plans-ledger-old-shape.json'),
      createFileCache()
    );

    // SPEC-003 has intent: "" and old-shape PLAN-002 has subject: "".
    expect(specs.entries[2]?.title).toBe('SPEC-003');
    expect(oldPlans.entries[1]?.title).toBe('PLAN-002');
  });

  test('an over-long title is bounded to a word-boundary prefix ending in an ellipsis', async () => {
    const specs = await readSpecLedger(
      fixturePath('specs-ledger.json'),
      createFileCache()
    );

    const title = specs.entries[3]?.title ?? '';

    expect(title.length).toBeLessThanOrEqual(140);
    expect(title.endsWith('…')).toBe(true);

    // Word-boundary safe: the retained prefix is an exact prefix of the raw
    // intent and the cut lands on a space in the original text.
    const prefix = title.slice(0, -1);
    const rawIntent =
      'The mandatory pre-merge code-review audit flags the same anti-patterns review after review, but every flag is ephemeral, so the same mistake is re-litigated from scratch each time a branch lands and nothing compounds across reviews or authors.';

    expect(rawIntent.startsWith(`${prefix} `)).toBe(true);
  });
});

describe('readPlanLedger', () => {
  test('normalizes the post-SPEC-024 shape, keeping status distinct from source', async () => {
    const result = await readPlanLedger(
      fixturePath('plans-ledger-post-spec-024.json'),
      createFileCache()
    );

    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.id)).toEqual([
      'PLAN-001',
      'PLAN-002',
      'PLAN-004',
    ]);

    // PLAN-002: source (provenance) and status (lifecycle) both read
    // "allocated" and both survive normalization independently.
    expect(result.entries[1]).toEqual({
      allocatedAt: '2026-07-05T10:32:29Z',
      completedAt: null,
      id: 'PLAN-002',
      source: 'allocated',
      status: 'allocated',
      title:
        'Document the composeStory args-spread requirement in tests-react.md.',
    });

    expect(result.entries[0]?.status).toBe('completed');
    expect(result.entries[0]?.completedAt).toBe('2026-07-04T09:07:28Z');
    // Unknown lifecycle value degrades to its literal string.
    expect(result.entries[2]?.status).toBe('paused');
  });

  test('tolerates the old plan shape with no status or completed_at', async () => {
    const result = await readPlanLedger(
      fixturePath('plans-ledger-old-shape.json'),
      createFileCache()
    );

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      completedAt: null,
      id: 'PLAN-001',
      source: 'allocated',
      status: null,
      title: 'Old-shape plan row without lifecycle fields.',
    });
  });
});
