import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {buildEvents} from '~/components/Sections/Work/events';
import {resolveWorkSelection} from '~/components/Sections/Work/selection';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

/**
 * Vitest runs from the repo root; happy-dom rewrites `import.meta.url` to an
 * http URL, so dom-environment tests resolve fixtures from cwd instead.
 * Parsed through the real response schema (same discipline as
 * `Work/tests/events.test.ts`) so a drifted fixture fails here, not inside a
 * component render.
 */
const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

// Ten real events (4 entries, 2 ad-hoc reviews, 4 commands), spanning spec,
// plan, review, debt, forensics, and one unrecognized command (gaia-teleport
// -> 'unknown'), newest-first: command:gaia-debt...7b0a (2026-07-15, itself a
// debt command) is the most recent event of any type. The sole forensics
// command (2026-07-12) sits well below it in the unfiltered order, which is
// what makes it useful for proving a filter actually narrows the candidates.
const events = buildEvents(readFixture('costs-response.json'));
const mostRecentKey = 'command:gaia-debt-20260715T114955Z-7b0a';
const soleForensicsKey = 'command:gaia-forensics-20260712T100200Z-4c1d';

test('with no ?entry=, selects the most recent event across every type', () => {
  const selection = resolveWorkSelection(events, null, null);

  expect(selection).toStrictEqual({
    correction: null,
    event: events.find((event) => event.key === mostRecentKey),
    filter: 'all',
  });
});

test('with no ?entry= and a live filter, selects the most recent event WITHIN that filter, not overall', () => {
  const selection = resolveWorkSelection(events, null, 'forensics');

  expect(selection.filter).toBe('forensics');
  expect(selection.event?.key).toBe(soleForensicsKey);
  // The globally most recent event is a debt command, not this one: proves
  // the filter actually narrows the candidate set rather than being ignored.
  expect(selection.event?.key).not.toBe(mostRecentKey);
  expect(selection.correction).toBeNull();
});

test('an ?entry= naming an event the current filter already shows selects it, filter unchanged', () => {
  const selection = resolveWorkSelection(events, 'SPEC-018', 'spec');

  expect(selection).toStrictEqual({
    correction: null,
    event: events.find((event) => event.key === 'SPEC-018'),
    filter: 'spec',
  });
});

test('an ?entry= naming an event the current filter HIDES widens the filter to all rather than hiding the target', () => {
  const selection = resolveWorkSelection(events, 'SPEC-018', 'debt');

  expect(selection.filter).toBe('all');
  expect(selection.event?.key).toBe('SPEC-018');
  expect(selection.correction).toBe('reset-filter');
});

test('an ?entry= naming nothing in the list falls back to the most recent event and drops the param', () => {
  const selection = resolveWorkSelection(events, 'no-such-key', null);

  expect(selection.correction).toBe('drop-entry');
  expect(selection.event?.key).toBe(mostRecentKey);
  expect(selection.filter).toBe('all');
});

test('an unresolvable ?entry= still respects the current filter for its fallback', () => {
  const selection = resolveWorkSelection(events, 'no-such-key', 'forensics');

  expect(selection.correction).toBe('drop-entry');
  expect(selection.filter).toBe('forensics');
  expect(selection.event?.key).toBe(soleForensicsKey);
});

test('a filter with zero live events selects nothing, without throwing or defaulting to some other event', () => {
  // The fixture carries no audit events at all.
  const selection = resolveWorkSelection(events, null, 'audit');

  expect(selection).toStrictEqual({
    correction: null,
    event: null,
    filter: 'audit',
  });
});

test('an unrecognized ?filter= value resolves to all rather than a prototype member, matching filters.ts', () => {
  const selection = resolveWorkSelection(events, null, 'constructor');

  expect(selection.filter).toBe('all');
  expect(typeof selection.filter).toBe('string');
});
