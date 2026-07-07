import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {mergeParseHealth} from '~/components/Sections/ParseHealth/merge-parse-health';
import type {ParseHealthSlice} from '~/data/schemas/api';
import {parseHealthSliceSchema} from '~/data/schemas/api';

// This suite runs under happy-dom (app/components/**), which rewrites
// import.meta.url to an http URL, so fixtures resolve from cwd instead.
const loadFixture = (fileName: string): ParseHealthSlice => {
  const fixturePath = path.join(
    process.cwd(),
    'test/fixtures/parse-health',
    fileName
  );

  return parseHealthSliceSchema.parse(
    JSON.parse(readFileSync(fixturePath, 'utf8'))
  );
};

const costsDirty = loadFixture('costs-dirty.json');
const activityDirty = loadFixture('activity-dirty.json');
const costsClean = loadFixture('costs-clean.json');
const activityClean = loadFixture('activity-clean.json');

test('concatenates counters and notes from both slices', () => {
  const merged = mergeParseHealth(costsDirty, activityDirty);

  expect(merged.counters).toEqual([
    ...costsDirty.counters,
    ...activityDirty.counters,
  ]);
  expect(merged.notes).toEqual([...costsDirty.notes, ...activityDirty.notes]);
});

test('unions unknown kinds and statuses, deduplicated', () => {
  const merged = mergeParseHealth(costsDirty, activityDirty);

  // "review" appears in both fixtures' unknownKinds; the union keeps one.
  expect(merged.unknownKinds).toEqual(['review']);
  expect(merged.unknownStatuses).toEqual(['superseded', 'paused']);
});

test('is clean only when both slices have zero skips/unparseable, no unknowns, no notes', () => {
  expect(mergeParseHealth(costsClean, activityClean).isClean).toBe(true);
  expect(mergeParseHealth(costsDirty, activityClean).isClean).toBe(false);
  expect(mergeParseHealth(costsClean, activityDirty).isClean).toBe(false);
});
