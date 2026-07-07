import {describe, expect, test} from 'vitest';
import {
  DEFAULT_SORT,
  nextSortState,
  sortEntries,
} from '~/components/Sections/CostTable/sort';
import type {SortableCostEntry} from '~/components/Sections/CostTable/sort';

const buildEntry = (
  overrides: Partial<SortableCostEntry> & Pick<SortableCostEntry, 'id'>
): SortableCostEntry => ({
  sortAt: '2026-01-01T00:00:00Z',
  status: null,
  title: overrides.id ?? 'untitled',
  totals: {durationSeconds: null, recordedDollars: null},
  ...overrides,
});

describe('DEFAULT_SORT', () => {
  test('defaults to the ID column, descending', () => {
    expect(DEFAULT_SORT).toEqual({column: 'id', direction: 'desc'});
  });
});

describe('nextSortState', () => {
  test('toggles direction when clicking the already-active column', () => {
    const afterFirstClick = nextSortState(DEFAULT_SORT, 'id');

    expect(afterFirstClick).toEqual({column: 'id', direction: 'asc'});

    const afterSecondClick = nextSortState(afterFirstClick, 'id');

    expect(afterSecondClick).toEqual({column: 'id', direction: 'desc'});
  });

  test('switching to a new column resets to that column own default', () => {
    expect(nextSortState(DEFAULT_SORT, 'title')).toEqual({
      column: 'title',
      direction: 'asc',
    });
    // Switching back to id still defaults to descending, not whatever
    // direction the previous column happened to be on.
    expect(nextSortState({column: 'title', direction: 'desc'}, 'id')).toEqual({
      column: 'id',
      direction: 'desc',
    });
  });
});

describe('sortEntries: id-desc default', () => {
  test('sorts ids descending', () => {
    const entries = [
      buildEntry({id: 'SPEC-1'}),
      buildEntry({id: 'SPEC-3'}),
      buildEntry({id: 'SPEC-2'}),
    ];

    expect(sortEntries(entries, DEFAULT_SORT).map((entry) => entry.id)).toEqual(
      ['SPEC-3', 'SPEC-2', 'SPEC-1']
    );
  });
});

describe('sortEntries: ascending toggle', () => {
  test('reverses order when the direction flips to ascending', () => {
    const entries = [
      buildEntry({id: 'SPEC-1'}),
      buildEntry({id: 'SPEC-3'}),
      buildEntry({id: 'SPEC-2'}),
    ];

    expect(
      sortEntries(entries, {column: 'id', direction: 'asc'}).map(
        (entry) => entry.id
      )
    ).toEqual(['SPEC-1', 'SPEC-2', 'SPEC-3']);
  });
});

describe('sortEntries: status chronological order', () => {
  test('orders draft < ready < merged < archived ascending', () => {
    const entries = [
      buildEntry({id: 'a', status: 'archived'}),
      buildEntry({id: 'b', status: 'merged'}),
      buildEntry({id: 'c', status: 'draft'}),
      buildEntry({id: 'd', status: 'ready'}),
    ];

    expect(
      sortEntries(entries, {column: 'status', direction: 'asc'}).map(
        (entry) => entry.status
      )
    ).toEqual(['draft', 'ready', 'merged', 'archived']);
  });

  test('reverses to archived < merged < ready < draft descending', () => {
    const entries = [
      buildEntry({id: 'a', status: 'archived'}),
      buildEntry({id: 'b', status: 'merged'}),
      buildEntry({id: 'c', status: 'draft'}),
      buildEntry({id: 'd', status: 'ready'}),
    ];

    expect(
      sortEntries(entries, {column: 'status', direction: 'desc'}).map(
        (entry) => entry.status
      )
    ).toEqual(['archived', 'merged', 'ready', 'draft']);
  });
});

describe('sortEntries: abandoned pinned last', () => {
  test('stays last ascending, behind every lifecycle stage', () => {
    const entries = [
      buildEntry({id: 'a', status: 'abandoned'}),
      buildEntry({id: 'b', status: 'draft'}),
      buildEntry({id: 'c', status: 'archived'}),
    ];

    expect(
      sortEntries(entries, {column: 'status', direction: 'asc'}).map(
        (entry) => entry.status
      )
    ).toEqual(['draft', 'archived', 'abandoned']);
  });

  test('stays last descending too, direction never floats it to the top', () => {
    const entries = [
      buildEntry({id: 'a', status: 'abandoned'}),
      buildEntry({id: 'b', status: 'draft'}),
      buildEntry({id: 'c', status: 'archived'}),
    ];

    expect(
      sortEntries(entries, {column: 'status', direction: 'desc'}).map(
        (entry) => entry.status
      )
    ).toEqual(['archived', 'draft', 'abandoned']);
  });
});
