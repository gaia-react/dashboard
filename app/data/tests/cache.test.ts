import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {mkdtempSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFileCache} from '~/data/cache';

let directory: string;
let file: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'gaia-cache-'));
  file = path.join(directory, 'data.txt');
});

afterEach(() => {
  rmSync(directory, {force: true, recursive: true});
});

describe('createFileCache', () => {
  test('computes once and returns the cached value while the file is unchanged', () => {
    writeFileSync(file, 'alpha');
    const cache = createFileCache();
    let calls = 0;

    const read = (source: string) => {
      calls += 1;

      return source;
    };

    const first = cache.get(file, read);
    const second = cache.get(file, read);

    expect(first).toBe(file);
    expect(second).toBe(file);
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
  });

  test('recomputes when the file size changes', () => {
    writeFileSync(file, 'alpha');
    const cache = createFileCache();
    let calls = 0;

    const read = () => {
      calls += 1;

      return calls;
    };

    expect(cache.get(file, read)).toBe(1);
    writeFileSync(file, 'alpha-plus-more');
    expect(cache.get(file, read)).toBe(2);
    expect(calls).toBe(2);
  });

  test('recomputes when the mtime changes even if the size is identical', () => {
    writeFileSync(file, 'alpha');
    const cache = createFileCache();
    let calls = 0;

    const read = () => {
      calls += 1;

      return calls;
    };

    expect(cache.get(file, read)).toBe(1);
    // Same byte count, but a newer mtime.
    writeFileSync(file, 'gamma');
    const future = new Date(Date.now() + 60_000);
    utimesSync(file, future, future);
    expect(cache.get(file, read)).toBe(2);
    expect(calls).toBe(2);
  });

  test('caches an in-flight promise so concurrent gets share one read', async () => {
    writeFileSync(file, 'alpha');
    const cache = createFileCache();
    let calls = 0;

    const read = async () => {
      calls += 1;

      return calls;
    };

    const [a, b] = await Promise.all([
      cache.get(file, read),
      cache.get(file, read),
    ]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });
});
