import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {buildEvents} from '~/components/Sections/Work/events';
import type {CostsResponse, SessionSummary} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

/**
 * Shared setup for the detail panel's two component suites. Not a `.test.`
 * file, so vitest does not collect it.
 *
 * Vitest runs from the repo root; happy-dom rewrites `import.meta.url` to an
 * http URL, so dom-environment tests resolve fixtures from cwd instead. Every
 * fixture is parsed through `costsResponseSchema`, so one that has drifted
 * out of contract shape fails here rather than at the next phase boundary.
 */
const readFixture = (relativePath: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/work', relativePath),
        'utf8'
      )
    )
  );

const events = buildEvents(readFixture('costs-response.json'));
const auditEvents = buildEvents(readFixture('detail/audit-cases.json'));

const byKey = (list: GaiaEvent[], key: string): GaiaEvent => {
  const found = list.find((event) => event.key === key);

  if (found === undefined) {
    throw new Error(`no event with key ${key}`);
  }

  return found;
};

/** Spec entry, three phases, an audit on the spec phase, two sessions. */
export const spec032 = byKey(events, 'SPEC-032');

/** Spec entry, one execute phase, exactly one model, no audit. */
export const spec018 = byKey(events, 'SPEC-018');

/** Backfill plan entry: no recorded figures, no breakdowns, no sessions. */
export const plan004 = byKey(events, 'PLAN-004');

export const review = byKey(
  events,
  'review:7b0a1c2d-3e4f-5061-7283-94a5b6c7d8e9'
);

/** Command event with a run id, a PR, and both scalar maps. */
export const debtCommand = byKey(
  events,
  'command:gaia-debt-20260715T114955Z-7b0a'
);

/** Command event with no run id, no github, and no breakdowns. */
export const bareCommand = byKey(
  events,
  'command:cc33dd44-ee55-66ff-a011-223344556677'
);

/** Plan entry carrying an audit on two phases, one of them with null cost. */
export const plan009 = byKey(auditEvents, 'PLAN-009');

/**
 * Plan entry whose one phase recorded a real, measured zero dollars (not a
 * missing figure) alongside a real, non-zero audit cost. Distinguishes the
 * audit-share meter's "phase cost is null" empty branch from its "phase cost
 * is exactly 0" empty branch, per DESIGN-SPEC 7.4 ("phase dollars null or
 * 0").
 */
export const plan010 = byKey(auditEvents, 'PLAN-010');

export const SPEC_SESSION_ID = '3158fe6d-4480-42d3-8e70-1c4ecbfc2057';

export const MISSING_LOG_SESSION_ID = '9a41c0b2-7f3d-4a11-b0c8-52e6d9f7a331';

const buildSession = (sessionId: string): SessionSummary => ({
  attribution: null,
  dollars: null,
  durationSeconds: 1800,
  endedAt: '2026-07-14T09:30:00Z',
  gitBranch: null,
  models: [],
  sessionId,
  startedAt: '2026-07-14T09:00:00Z',
  title: 'Draft the audit cost contract',
  totalTokens: 120_000,
  turnCount: 12,
});

/** A resolved `/api/activity` that carries no matching row: the join misses. */
export const emptyJoin = new Map<string, SessionSummary>();

export const joined = new Map<string, SessionSummary>([
  [SPEC_SESSION_ID, buildSession(SPEC_SESSION_ID)],
]);

export const stripValues = (strip: HTMLElement): (null | string)[] =>
  [...strip.querySelectorAll('dd')].map((node) => node.textContent);

export const stripLabels = (strip: HTMLElement): (null | string)[] =>
  [...strip.querySelectorAll('dt')].map((node) => node.textContent);

/**
 * The metric strip's `<dd>` elements themselves (not just their text), so a
 * test can assert a class on one without reaching for raw DOM traversal
 * inside a `.test.ts(x)` file (the testing-library eslint rules only cover
 * files matching that glob, this one does not).
 */
export const stripValueNodes = (strip: HTMLElement): Element[] => [
  ...strip.querySelectorAll('dd'),
];

/** Every descendant carrying the card/panel radius, for the no-nested-card
 * check: a bordered box inside the panel's own border is always wrong. */
export const roundedMdDescendants = (root: Element): Element[] => [
  ...root.querySelectorAll('.rounded-md'),
];

/** Whether any descendant of `root` carries an `aria-live` attribute
 * (DESIGN-SPEC 11.13: the panel adds none of its own). */
export const hasAriaLiveDescendant = (root: Element): boolean =>
  root.querySelector('[aria-live]') !== null;
