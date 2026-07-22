import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {
  buildEvents,
  resolveCommandType,
} from '~/components/Sections/Work/events';
import type {CommandEvent, CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

/**
 * Vitest runs from the repo root; happy-dom rewrites `import.meta.url` to an
 * http URL, so dom-environment tests resolve fixtures from cwd instead. Both
 * fixtures are parsed through `costsResponseSchema` rather than read raw: a
 * fixture that has drifted out of contract shape must fail here, not at the
 * next phase boundary.
 */
const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const costs = readFixture('costs-response.json');
const emptyCosts = readFixture('costs-empty.json');

const byKey = (events: GaiaEvent[], key: string): GaiaEvent => {
  const found = events.find((event) => event.key === key);

  if (found === undefined) {
    throw new Error(`no event with key ${key}`);
  }

  return found;
};

const buildCommand = (overrides: Partial<CommandEvent>): CommandEvent => ({
  at: '2026-07-01T00:00:00Z',
  byAgentType: null,
  byModel: null,
  command: 'gaia-debt',
  durationSeconds: null,
  github: null,
  recordedDollars: null,
  runId: null,
  sessionId: 'session-0',
  totalTokens: 0,
  ...overrides,
});

const withCommands = (commands: CommandEvent[]): CostsResponse => ({
  ...emptyCosts,
  commandEvents: commands,
});

test('both work fixtures parse against the response contract', () => {
  expect(costs.entries).toHaveLength(4);
  expect(costs.adHocReviews).toHaveLength(2);
  expect(costs.commandEvents).toHaveLength(4);
  expect(emptyCosts.entries).toHaveLength(0);
});

test('collapses all three source shapes into one list', () => {
  const events = buildEvents(costs);

  expect(events).toHaveLength(10);
  expect(events.filter((event) => event.source.kind === 'entry')).toHaveLength(
    4
  );
  expect(events.filter((event) => event.source.kind === 'review')).toHaveLength(
    2
  );
  expect(
    events.filter((event) => event.source.kind === 'command')
  ).toHaveLength(4);
});

test('an empty response builds an empty list rather than throwing', () => {
  expect(buildEvents(emptyCosts)).toEqual([]);
});

test('maps a spec entry to its exact GaiaEvent', () => {
  const event = byKey(buildEvents(costs), 'SPEC-032');
  const entry = costs.entries[0];

  expect(event).toEqual({
    artifact: {number: 741, repo: 'gaia-react/gaia', type: 'pr'},
    at: '2026-07-14T09:00:00Z',
    durationSeconds: 5400,
    group: 'work',
    key: 'SPEC-032',
    label: 'SPEC-032',
    recordedDollars: 12.34,
    source: {kind: 'entry', value: entry},
    status: 'merged',
    title: 'Audit cost tracking and the recorded-spend drill-down.',
    totalTokens: 4_200_000,
    type: 'spec',
  });
});

test('maps an ad-hoc review to its exact GaiaEvent', () => {
  const event = byKey(
    buildEvents(costs),
    'review:7b0a1c2d-3e4f-5061-7283-94a5b6c7d8e9'
  );

  expect(event).toEqual({
    artifact: null,
    at: '2026-07-13T14:20:00Z',
    durationSeconds: 420,
    group: 'maintenance',
    key: 'review:7b0a1c2d-3e4f-5061-7283-94a5b6c7d8e9',
    label: 'Code review 7b0a1c2d',
    recordedDollars: 1.87,
    source: {kind: 'review', value: costs.adHocReviews[0]},
    status: null,
    title: 'Ad-hoc code review, not attributed to a spec or plan',
    totalTokens: 260_000,
    type: 'review',
  });
});

test('maps a command event to its exact GaiaEvent', () => {
  const event = byKey(
    buildEvents(costs),
    'command:gaia-debt-20260715T114955Z-7b0a'
  );

  expect(event).toEqual({
    artifact: {number: 769, repo: 'gaia-react/gaia', type: 'pr'},
    at: '2026-07-15T11:49:55Z',
    durationSeconds: 1320,
    group: 'work',
    key: 'command:gaia-debt-20260715T114955Z-7b0a',
    label: 'gaia-debt',
    recordedDollars: 3.05,
    source: {kind: 'command', value: costs.commandEvents[0]},
    status: null,
    title: 'Technical debt sweep',
    totalTokens: 410_000,
    type: 'debt',
  });
});

test('passes entry.key through verbatim for spec, plan, and slug rows', () => {
  const keys = buildEvents(costs)
    .filter((event) => event.source.kind === 'entry')
    .map((event) => event.key);

  expect(keys).toContain('SPEC-032');
  expect(keys).toContain('PLAN-004');
  expect(keys).toContain('slug:offline-mode');
});

test('a slug entry with no id falls back to its key as the label', () => {
  const event = byKey(buildEvents(costs), 'slug:offline-mode');

  expect(event.label).toBe('slug:offline-mode');
  expect(event.status).toBeNull();
  expect(event.type).toBe('plan');
  expect(event.group).toBe('work');
});

test('a plan-slug entry maps to the plan type, not its own type', () => {
  const event = byKey(buildEvents(costs), 'PLAN-004');

  expect(event.type).toBe('plan');
});

test('a review with no reviewId keys and labels off the session id', () => {
  const event = byKey(
    buildEvents(costs),
    'review:e3f4a5b6-c7d8-49e0-b1c2-d3e4f5061728'
  );

  expect(event.label).toBe('Code review e3f4a5b6');
});

test('a command with no runId keys off the session id', () => {
  const event = byKey(
    buildEvents(costs),
    'command:cc33dd44-ee55-66ff-a011-223344556677'
  );

  expect(event.type).toBe('debt');
  expect(event.artifact).toBeNull();
});

test('never coerces a null figure to zero', () => {
  const event = byKey(buildEvents(costs), 'PLAN-004');

  expect(event.recordedDollars).toBeNull();
  expect(event.durationSeconds).toBeNull();
});

test('a real zero figure survives as a zero', () => {
  const event = byKey(buildEvents(costs), 'slug:offline-mode');

  expect(event.recordedDollars).toBe(0);
  expect(event.durationSeconds).toBe(0);
});

test('gaia-debt is the only command in the Work group', () => {
  const commandEvents = buildEvents(costs).filter(
    (event) => event.source.kind === 'command'
  );
  const workCommands = commandEvents
    .filter((event) => event.group === 'work')
    .map((event) => event.label);

  expect(workCommands).toEqual(['gaia-debt', 'gaia-debt']);
  expect(
    commandEvents
      .filter((event) => event.group === 'maintenance')
      .map((event) => event.label)
  ).toEqual(['gaia-forensics', 'gaia-teleport']);
});

test('maps every recognized command name to its event type', () => {
  expect(resolveCommandType('gaia-audit')).toBe('audit');
  expect(resolveCommandType('gaia-debt')).toBe('debt');
  expect(resolveCommandType('gaia-fitness')).toBe('fitness');
  expect(resolveCommandType('gaia-forensics')).toBe('forensics');
  expect(resolveCommandType('gaia-harden')).toBe('harden');
  expect(resolveCommandType('gaia-wiki')).toBe('wiki');
});

test('an unrecognized command degrades to unknown with the generic subject', () => {
  const event = byKey(
    buildEvents(costs),
    'command:gaia-teleport-20260707T091200Z-9e2f'
  );

  expect(event.type).toBe('unknown');
  expect(event.title).toBe('GAIA command run');
  expect(event.group).toBe('maintenance');
  expect(event.label).toBe('gaia-teleport');
});

/**
 * The untrusted-key rule. `command` is `z.string()` off a record in
 * `../gaia`, so a value colliding with an inherited `Object.prototype` member
 * is reachable from upstream data. A bare object-literal index would return
 * that member instead of falling through to the `unknown` fallback; these
 * four names are the ones that have actually shipped this bug twice.
 */
for (const hostile of ['constructor', 'valueOf', 'toString', '__proto__']) {
  test(`a command named ${hostile} degrades to unknown and does not throw`, () => {
    expect(resolveCommandType(hostile)).toBe('unknown');

    const events = buildEvents(
      withCommands([buildCommand({command: hostile, runId: 'run-x'})])
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('unknown');
    expect(events[0].title).toBe('GAIA command run');
    expect(events[0].label).toBe(hostile);
    expect(events[0].group).toBe('maintenance');
  });
}

test('returns events newest first, ties broken by key ascending', () => {
  const events = buildEvents(costs);
  const timestamps = events.map((event) => Date.parse(event.at));

  expect(timestamps).toEqual(timestamps.toSorted((a, b) => b - a));
  expect(events[0].key).toBe('command:gaia-debt-20260715T114955Z-7b0a');
});

test('breaks an exact timestamp tie by key ascending', () => {
  const events = buildEvents(
    withCommands([
      buildCommand({command: 'gaia-wiki', runId: 'zeta'}),
      buildCommand({command: 'gaia-wiki', runId: 'alpha'}),
    ])
  );

  expect(events.map((event) => event.key)).toEqual([
    'command:alpha',
    'command:zeta',
  ]);
});
