import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
  ALL_EVENTS_LABEL,
  countEventsByType,
  DEFAULT_FILTER,
  filterEvents,
  filterLabelFor,
  resolveFilterId,
} from '~/components/Sections/Work/EventFilters/filters';
import {buildEvents} from '~/components/Sections/Work/events';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

/**
 * Same fixture idiom K3 uses: happy-dom rewrites `import.meta.url` to an http
 * URL, so dom-environment tests resolve fixtures from cwd, and the fixture is
 * parsed through the schema so contract drift fails here.
 */
const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const events = buildEvents(readFixture('costs-response.json'));

test('a null query value resolves to the default filter', () => {
  expect(resolveFilterId(null)).toBe(DEFAULT_FILTER);
  expect(DEFAULT_FILTER).toBe('all');
});

test('every filter option id round-trips', () => {
  const ids = [
    'spec',
    'plan',
    'debt',
    'audit',
    'fitness',
    'forensics',
    'harden',
    'wiki',
    'review',
  ];

  for (const id of ids) {
    expect(resolveFilterId(id)).toBe(id);
  }
});

test('an unrecognized query value falls back to all, silently', () => {
  expect(resolveFilterId('nope')).toBe('all');
  expect(resolveFilterId('')).toBe('all');
  expect(resolveFilterId('Spec')).toBe('all');
  expect(resolveFilterId('spec ')).toBe('all');
});

test('an Object.prototype key falls back to all rather than resolving to an inherited member', () => {
  for (const key of [
    '__proto__',
    'constructor',
    'hasOwnProperty',
    'toString',
    'valueOf',
  ]) {
    const resolved: unknown = resolveFilterId(key);

    expect(resolved).toBe('all');
    expect(typeof resolved).toBe('string');
  }
});

test('the unknown event type is not a filter option and falls back to all', () => {
  expect(resolveFilterId('unknown')).toBe('all');
});

test('counts cover every event type, including the ones with no events', () => {
  const counts = countEventsByType(events);

  expect(counts).toStrictEqual({
    audit: 0,
    debt: 2,
    fitness: 0,
    forensics: 1,
    harden: 0,
    plan: 2,
    review: 2,
    spec: 2,
    unknown: 1,
    wiki: 0,
  });
});

test('counts of an empty list are zero for every type, never missing keys', () => {
  const counts = countEventsByType([]);

  expect(Object.values(counts)).toHaveLength(10);
  expect(Object.values(counts).every((count) => count === 0)).toBe(true);
});

test('the all filter returns every event, including unknown ones', () => {
  expect(filterEvents(events, 'all')).toHaveLength(events.length);
  expect(
    filterEvents(events, 'all').some((event) => event.type === 'unknown')
  ).toBe(true);
});

test('a type filter returns only that type', () => {
  const specs = filterEvents(events, 'spec');

  expect(specs).toHaveLength(2);
  expect(specs.every((event) => event.type === 'spec')).toBe(true);
});

test('a zero-count filter returns an empty list rather than throwing', () => {
  expect(filterEvents(events, 'audit')).toStrictEqual([]);
});

test('filtering preserves the incoming order', () => {
  const debt = filterEvents(events, 'debt');

  expect(debt.map((event) => event.key)).toStrictEqual(
    events.filter((event) => event.type === 'debt').map((event) => event.key)
  );
});

test('the filter label names the category, and the all filter names every event', () => {
  expect(filterLabelFor('all')).toBe(ALL_EVENTS_LABEL);
  expect(filterLabelFor('all')).toBe('All events');
  expect(filterLabelFor('spec')).toBe('Spec');
  expect(filterLabelFor('forensics')).toBe('Forensics');
});
