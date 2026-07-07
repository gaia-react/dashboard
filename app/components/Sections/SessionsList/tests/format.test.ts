import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
  costEntryAnchorId,
  costViewForEntryType,
  countSessionsByAttribution,
  filterSessions,
  formatSessionDateTime,
  formatSessionDollars,
  formatSessionDuration,
  formatSessionModels,
  pageForSession,
  paginateSessions,
  resolveSessionTypeFilter,
  sessionDisplayTitle,
  SESSIONS_PAGE_SIZE,
  totalPageCount,
  totalTokenCount,
  uniqueModelNames,
  workTabHref,
} from '~/components/Sections/SessionsList/format';
import {activityResponseSchema} from '~/data/schemas/api';
import type {SessionSummary} from '~/data/schemas/api';

// This suite runs under happy-dom (app/components/**), which rewrites
// import.meta.url to an http URL, so fixtures resolve from cwd instead
// (mirrors app/components/Sections/ParseHealth/tests/index.test.tsx).
const loadFixture = (fileName: string): SessionSummary[] => {
  const fixturePath = path.join(
    process.cwd(),
    'test/fixtures/sessions-list',
    fileName
  );

  return activityResponseSchema.parse(
    JSON.parse(readFileSync(fixturePath, 'utf8'))
  ).sessions;
};

const sessions = loadFixture('populated.json');

const getFixtureSession = (sessionId: string): SessionSummary => {
  const found = sessions.find((session) => session.sessionId === sessionId);

  if (!found) {
    throw new Error(`fixture is missing session ${sessionId}`);
  }

  return found;
};

const untitledSession = getFixtureSession(
  'aaaaaaaa-0000-4000-8000-000000000002'
);
const titledSession = getFixtureSession('aaaaaaaa-0000-4000-8000-000000000001');

test('SESSIONS_PAGE_SIZE is 50 (PLAN D5)', () => {
  expect(SESSIONS_PAGE_SIZE).toBe(50);
});

test('countSessionsByAttribution partitions by attribution presence', () => {
  expect(countSessionsByAttribution(sessions)).toEqual({
    adHoc: 51,
    attributed: 3,
  });
});

test('uniqueModelNames collects every distinct model across all sessions, sorted', () => {
  expect(uniqueModelNames(sessions)).toEqual([
    'claude-haiku-4-5',
    'claude-opus-4-1',
    'claude-sonnet-4-5',
  ]);
});

test('filterSessions with "all" returns every session untouched', () => {
  expect(filterSessions(sessions, 'all', 'all')).toHaveLength(54);
});

test('filterSessions narrows to GAIA (attributed) sessions only', () => {
  const gaiaOnly = filterSessions(sessions, 'gaia', 'all');

  expect(gaiaOnly).toHaveLength(3);
  expect(gaiaOnly.every((session) => session.attribution !== null)).toBe(true);
});

test('resolveSessionTypeFilter maps the URL value, defaulting to all', () => {
  expect(resolveSessionTypeFilter('gaia')).toBe('gaia');
  expect(resolveSessionTypeFilter('ad-hoc')).toBe('ad-hoc');
  expect(resolveSessionTypeFilter(null)).toBe('all');
  expect(resolveSessionTypeFilter('bogus')).toBe('all');
});

test('pageForSession finds the 1-indexed page holding a session, else null', () => {
  const first = sessions[0]?.sessionId ?? '';
  const onPageTwo = sessions[SESSIONS_PAGE_SIZE]?.sessionId ?? '';

  expect(pageForSession(sessions, first)).toBe(1);
  expect(pageForSession(sessions, onPageTwo)).toBe(2);
  expect(pageForSession(sessions, 'not-a-real-id')).toBeNull();
});

test('formatSessionModels humanizes and joins model ids', () => {
  expect(formatSessionModels(['claude-opus-4-8', 'claude-sonnet-5'])).toBe(
    'Claude Opus 4.8, Claude Sonnet 5'
  );
  expect(formatSessionModels([])).toBe('');
});

test('filterSessions narrows to ad hoc sessions only', () => {
  const adHocOnly = filterSessions(sessions, 'ad-hoc', 'all');

  expect(adHocOnly).toHaveLength(51);
  expect(adHocOnly.every((session) => session.attribution === null)).toBe(true);
});

test('filterSessions narrows by model', () => {
  const haikuOnly = filterSessions(sessions, 'all', 'claude-haiku-4-5');

  expect(haikuOnly).toHaveLength(1);
  expect(haikuOnly[0]?.sessionId).toBe('aaaaaaaa-0000-4000-8000-000000000002');
});

test('filterSessions applies type and model filters together', () => {
  const combined = filterSessions(sessions, 'ad-hoc', 'claude-sonnet-4-5');

  // The two ad hoc claude-sonnet-4-5 sessions (one multi-model) plus every
  // filler session.
  expect(combined).toHaveLength(51);
});

test('paginateSessions slices 50 per page', () => {
  const attributedAndAdHoc = filterSessions(sessions, 'all', 'all');

  expect(paginateSessions(attributedAndAdHoc, 1)).toHaveLength(50);
  expect(paginateSessions(attributedAndAdHoc, 2)).toHaveLength(4);
});

test('totalPageCount rounds up and floors at one page', () => {
  expect(totalPageCount(54)).toBe(2);
  expect(totalPageCount(50)).toBe(1);
  expect(totalPageCount(0)).toBe(1);
});

test('totalTokenCount sums all four buckets', () => {
  expect(
    totalTokenCount({
      cacheRead: 42_000,
      cacheWrite: 3000,
      freshInput: 1200,
      output: 8000,
    })
  ).toBe(54_200);
});

test('sessionDisplayTitle falls back to the session id when title is null', () => {
  expect(sessionDisplayTitle(untitledSession)).toBe(untitledSession.sessionId);
});

test('sessionDisplayTitle uses the title when present', () => {
  expect(sessionDisplayTitle(titledSession)).toBe('Ship the ledger repair');
});

test('costEntryAnchorId slugs the cost-entry key for SPEC/PLAN/slug rows', () => {
  expect(costEntryAnchorId('SPEC-001')).toBe('cost-entry-SPEC-001');
  expect(costEntryAnchorId('PLAN-002')).toBe('cost-entry-PLAN-002');
  expect(costEntryAnchorId('slug:vintage-plan')).toBe(
    'cost-entry-slug-vintage-plan'
  );
});

test('costViewForEntryType maps entry types to the specs/plans view', () => {
  expect(costViewForEntryType('spec')).toBe('specs');
  expect(costViewForEntryType('plan')).toBe('plans');
  expect(costViewForEntryType('plan-slug')).toBe('plans');
});

test('workTabHref builds the Work-tab deep link for an entry', () => {
  expect(workTabHref('SPEC-001', 'spec')).toBe(
    '?tab=work&work=specs&entry=SPEC-001'
  );
  expect(workTabHref('slug:vintage-plan', 'plan-slug')).toBe(
    '?tab=work&work=plans&entry=slug%3Avintage-plan'
  );
});

test('formatSessionDuration renders hours, minutes, and seconds', () => {
  expect(formatSessionDuration(2520)).toBe('42m 00s');
  expect(formatSessionDuration(3720)).toBe('1h 02m');
  expect(formatSessionDuration(45)).toBe('45s');
});

test('formatSessionDollars formats as USD currency', () => {
  expect(formatSessionDollars(14.35)).toBe('$14.35');
  expect(formatSessionDollars(0.75)).toBe('$0.75');
});

test('formatSessionDateTime formats a UTC ISO timestamp', () => {
  expect(formatSessionDateTime('2026-07-07T15:00:00Z')).toEqual(
    expect.any(String)
  );
  expect(formatSessionDateTime('2026-07-07T15:00:00Z').length).toBeGreaterThan(
    0
  );
});
