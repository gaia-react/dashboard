import {describe, expect, test} from 'vitest';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {
  DEFAULT_SORT,
  EVENT_SORT_OPTIONS,
  resolveSortId,
  sortEvents,
} from '~/components/Sections/Work/sort';

const buildEvent = (overrides: Partial<GaiaEvent> & Pick<GaiaEvent, 'key'>) =>
  ({
    artifact: null,
    at: '2026-07-01T00:00:00Z',
    durationSeconds: null,
    group: 'maintenance',
    label: overrides.key,
    recordedDollars: null,
    source: {
      kind: 'review',
      value: {
        at: '2026-07-01T00:00:00Z',
        durationSeconds: null,
        recordedDollars: null,
        reviewId: overrides.key,
        sessionId: overrides.key,
        totalTokens: 0,
      },
    },
    status: null,
    title: 'title',
    totalTokens: 0,
    type: 'review',
    ...overrides,
  }) satisfies GaiaEvent;

/**
 * The null-rule fixture, built so it FAILS under `value ?? 0`. `nullCost` is
 * the most recent of the three, so coercing null to zero makes it tie with
 * `zeroCost` and the recency tie-break then lifts the null above the real
 * `$0.00`. Only "nulls last, unconditionally" produces the asserted order.
 */
const nullCost = buildEvent({
  at: '2026-07-15T00:00:00Z',
  durationSeconds: null,
  key: 'null-cost',
  recordedDollars: null,
  status: null,
});

const zeroCost = buildEvent({
  at: '2026-07-10T00:00:00Z',
  durationSeconds: 0,
  key: 'zero-cost',
  recordedDollars: 0,
  status: 'draft',
});

const pricedEvent = buildEvent({
  at: '2026-07-05T00:00:00Z',
  durationSeconds: 600,
  key: 'priced',
  recordedDollars: 12.34,
  status: 'merged',
});

const nullFixture = [pricedEvent, nullCost, zeroCost];

const keysAfter = (sort: Parameters<typeof sortEvents>[1]): string[] =>
  sortEvents(nullFixture, sort).map((event) => event.key);

describe('the sort vocabulary', () => {
  test('defaults to date', () => {
    expect(DEFAULT_SORT).toBe('date');
  });

  test('carries the four DESIGN-SPEC C-10 labels in order', () => {
    expect(EVENT_SORT_OPTIONS).toEqual([
      {id: 'date', label: 'Date (newest first)'},
      {id: 'cost', label: 'Cost (highest first)'},
      {id: 'time', label: 'Time (longest first)'},
      {id: 'status', label: 'Status'},
    ]);
  });
});

describe('resolveSortId', () => {
  test('accepts every known id', () => {
    expect(resolveSortId('date')).toBe('date');
    expect(resolveSortId('cost')).toBe('cost');
    expect(resolveSortId('time')).toBe('time');
    expect(resolveSortId('status')).toBe('status');
  });

  test('falls back to the default for null and for junk', () => {
    expect(resolveSortId(null)).toBe('date');
    expect(resolveSortId('')).toBe('date');
    expect(resolveSortId('Cost')).toBe('date');
    expect(resolveSortId('cheapest')).toBe('date');
  });

  // The URL is an untrusted key source: a bare object-literal index would
  // return an inherited Object.prototype member for these four.
  test('falls back to the default for a prototype-colliding value', () => {
    expect(resolveSortId('constructor')).toBe('date');
    expect(resolveSortId('valueOf')).toBe('date');
    expect(resolveSortId('toString')).toBe('date');
    expect(resolveSortId('__proto__')).toBe('date');
  });
});

describe('nulls sort last, in every ordering', () => {
  test('date puts the newest first and does not move on null figures', () => {
    expect(keysAfter('date')).toEqual(['null-cost', 'zero-cost', 'priced']);
  });

  test('cost ranks a $0.00 event above a null-cost event', () => {
    expect(keysAfter('cost')).toEqual(['priced', 'zero-cost', 'null-cost']);
  });

  test('time ranks a zero-duration event above a null-duration event', () => {
    expect(keysAfter('time')).toEqual(['priced', 'zero-cost', 'null-cost']);
  });

  test('status ranks a null status last', () => {
    expect(keysAfter('status')).toEqual(['zero-cost', 'priced', 'null-cost']);
  });
});

describe('status ranking', () => {
  test('orders draft, ready, merged, archived, abandoned, unknown, null', () => {
    const events = [
      buildEvent({key: 'g-null', status: null}),
      buildEvent({key: 'f-unknown', status: 'completed'}),
      buildEvent({key: 'e-abandoned', status: 'abandoned'}),
      buildEvent({key: 'd-archived', status: 'archived'}),
      buildEvent({key: 'c-merged', status: 'merged'}),
      buildEvent({key: 'b-ready', status: 'ready'}),
      buildEvent({key: 'a-draft', status: 'draft'}),
    ];

    expect(sortEvents(events, 'status').map((event) => event.key)).toEqual([
      'a-draft',
      'b-ready',
      'c-merged',
      'd-archived',
      'e-abandoned',
      'f-unknown',
      'g-null',
    ]);
  });

  // The ledger status is an unconstrained pass-through, so a value colliding
  // with Object.prototype must rank as unrecognized, not throw or sort first.
  test('a prototype-colliding status ranks as unrecognized, above null', () => {
    const events = [
      buildEvent({key: 'null', status: null}),
      buildEvent({key: 'hostile', status: 'constructor'}),
      buildEvent({key: 'merged', status: 'merged'}),
    ];

    expect(sortEvents(events, 'status').map((event) => event.key)).toEqual([
      'merged',
      'hostile',
      'null',
    ]);
  });
});

describe('tie-breaking', () => {
  test('equal values keep a recency-first order', () => {
    const events = [
      buildEvent({at: '2026-07-01T00:00:00Z', key: 'older', status: 'merged'}),
      buildEvent({at: '2026-07-09T00:00:00Z', key: 'newer', status: 'merged'}),
    ];

    expect(sortEvents(events, 'status').map((event) => event.key)).toEqual([
      'newer',
      'older',
    ]);
  });

  test('an exact timestamp tie falls back to key ascending', () => {
    const events = [
      buildEvent({key: 'zeta', recordedDollars: 5}),
      buildEvent({key: 'alpha', recordedDollars: 5}),
    ];

    expect(sortEvents(events, 'cost').map((event) => event.key)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});

test('does not mutate the input array', () => {
  const input = [...nullFixture];

  sortEvents(input, 'cost');

  expect(input.map((event) => event.key)).toEqual([
    'priced',
    'null-cost',
    'zero-cost',
  ]);
});
