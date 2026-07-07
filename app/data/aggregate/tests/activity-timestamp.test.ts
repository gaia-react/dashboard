import {describe, expect, test} from 'vitest';
import {aggregateActivity} from '~/data/aggregate/activity';
import type {SessionScan} from '~/data/parse/session-scan';
import {activityResponseSchema, sessionSummarySchema} from '~/data/schemas/api';

/**
 * P2 handoff item 1 (timestamp hardening), activity side:
 * `SessionSummary.startedAt` / `endedAt` come from W3's raw session
 * transcript timestamps (`span.startedAt` / `span.endedAt`), and
 * `scan.activitySince` folds the same raw values. All three feed
 * non-nullable/nullable `z.iso.datetime()` at the API boundary, which
 * rejects date-only and offset-form values a real transcript can carry.
 */

const makeScan = (partial: Partial<SessionScan> = {}): SessionScan => ({
  byModel: {},
  counters: {syntheticExcluded: 0, usageMissingExcluded: 0},
  durationSeconds: 0,
  endedAt: undefined,
  errors: [],
  gitBranch: undefined,
  hourlyUtc: {},
  models: [],
  sessionId: 'default-session',
  startedAt: undefined,
  title: 'default-session',
  turnCount: 0,
  ...partial,
});

const aggregate = (
  scans: SessionScan[]
): ReturnType<typeof aggregateActivity> =>
  aggregateActivity({
    rateTable: {status: 'missing'},
    recordedDollarsBySession: new Map(),
    scans,
    timeZone: 'UTC',
  });

describe('aggregateActivity: session span timestamp hardening', () => {
  test('a date-only startedAt/endedAt canonicalizes to UTC midnight', () => {
    const result = aggregate([
      makeScan({
        endedAt: '2026-05-06',
        sessionId: 'date-only-session',
        startedAt: '2026-05-05',
      }),
    ]);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].startedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(result.sessions[0].endedAt).toBe('2026-05-06T00:00:00.000Z');
    expect(() => sessionSummarySchema.parse(result.sessions[0])).not.toThrow();
  });

  test('an offset-form startedAt canonicalizes to its UTC equivalent', () => {
    const result = aggregate([
      makeScan({
        endedAt: '2026-05-06T00:00:00Z',
        sessionId: 'offset-session',
        startedAt: '2026-05-05T23:25:51+02:00',
      }),
    ]);

    expect(result.sessions[0].startedAt).toBe('2026-05-05T21:25:51.000Z');
    expect(() => sessionSummarySchema.parse(result.sessions[0])).not.toThrow();
  });

  test('a wholly unparseable startedAt degrades the session out of the list rather than throwing', () => {
    const result = aggregate([
      makeScan({
        endedAt: '2026-05-06T00:00:00Z',
        sessionId: 'garbage-session',
        startedAt: 'not-a-timestamp',
      }),
    ]);

    expect(result.sessions).toEqual([]);
    expect(result.untimedSessionIds).toEqual(['garbage-session']);
  });
});

describe('aggregateActivity: activitySince timestamp hardening', () => {
  test('canonicalizes the earliest startedAt and ignores a garbage-only scan', () => {
    const result = aggregate([
      makeScan({
        endedAt: '2026-05-06T00:00:00Z',
        sessionId: 'valid-session',
        startedAt: '2026-05-05',
      }),
      makeScan({
        endedAt: '2026-05-06T00:00:00Z',
        sessionId: 'garbage-session',
        startedAt: 'not-a-timestamp',
      }),
    ]);

    expect(result.activitySince).toBe('2026-05-05T00:00:00.000Z');
    expect(() =>
      activityResponseSchema.shape.scan.shape.activitySince.parse(
        result.activitySince
      )
    ).not.toThrow();
  });

  test('every scan unparseable or timeless degrades activitySince to null', () => {
    const result = aggregate([
      makeScan({sessionId: 'untimed-session'}),
      makeScan({
        endedAt: '2026-05-06T00:00:00Z',
        sessionId: 'garbage-session',
        startedAt: 'not-a-timestamp',
      }),
    ]);

    expect(result.activitySince).toBeNull();
    expect(() =>
      activityResponseSchema.shape.scan.shape.activitySince.parse(
        result.activitySince
      )
    ).not.toThrow();
  });
});
