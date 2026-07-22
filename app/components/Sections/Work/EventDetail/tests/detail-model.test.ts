import {expect, test} from 'vitest';
import {
  agentBarRows,
  agentMix,
  auditBlocks,
  auditIntensity,
  detailSections,
  entryPhases,
  eventFigures,
  linkedSessionRefs,
  modelMix,
  phaseCostValues,
  phaseElapsedValues,
  runIdOf,
  singleSeries,
} from '~/components/Sections/Work/EventDetail/detail-model';
import {
  bareCommand,
  debtCommand,
  plan004,
  plan009,
  review,
  spec018,
  spec032,
} from '~/components/Sections/Work/EventDetail/tests/detail-fixtures';
import type {PhaseRollup} from '~/data/schemas/api';

const phase = (overrides: Partial<PhaseRollup>): PhaseRollup => ({
  byAgentType: null,
  byModel: null,
  durationSeconds: null,
  kind: 'execute',
  recordedDollars: null,
  source: 'native',
  totalTokens: 0,
  ...overrides,
});

test('a cost entry gets every section', () => {
  expect(detailSections(spec032)).toStrictEqual({
    auditBlock: true,
    modelAndAgentCharts: true,
    phaseBars: true,
    runIdRow: false,
  });
});

test('a command event gets the charts and the run id, never phases or an audit', () => {
  expect(detailSections(debtCommand)).toStrictEqual({
    auditBlock: false,
    modelAndAgentCharts: true,
    phaseBars: false,
    runIdRow: true,
  });
});

test('an ad-hoc review gets the reduced composition: no charts at all', () => {
  expect(detailSections(review)).toStrictEqual({
    auditBlock: false,
    modelAndAgentCharts: false,
    phaseBars: false,
    runIdRow: false,
  });
});

test('the metric figures are the recorded three, nulls preserved', () => {
  expect(eventFigures(spec032)).toStrictEqual({
    dollars: 12.34,
    durationSeconds: 5400,
    totalTokens: 4_200_000,
  });
  expect(eventFigures(plan004)).toStrictEqual({
    dollars: null,
    durationSeconds: null,
    totalTokens: 320_000,
  });
});

test('model mix sums the per-phase maps of an entry', () => {
  expect(modelMix(spec032)).toStrictEqual({
    'claude-opus-4-8': 1_200_000,
    'claude-sonnet-4-6': 3_000_000,
  });
});

test('agent mix sums the per-phase maps of an entry', () => {
  expect(agentMix(spec032)).toStrictEqual({
    'general-purpose': 3_400_000,
    'task-docs-wiki': 300_000,
    'task-tests': 500_000,
  });
});

test('an entry whose every phase is null has no breakdown, not an empty one', () => {
  expect(modelMix(plan004)).toBeNull();
  expect(agentMix(plan004)).toBeNull();
});

test('a command reads its own flat maps and a review has none', () => {
  expect(modelMix(debtCommand)).toStrictEqual({'claude-sonnet-4-6': 410_000});
  expect(agentMix(debtCommand)).toStrictEqual({'general-purpose': 410_000});
  expect(modelMix(bareCommand)).toBeNull();
  expect(modelMix(review)).toBeNull();
  expect(agentMix(review)).toBeNull();
});

test('exactly one positive series is the single-series case', () => {
  expect(singleSeries({'claude-sonnet-4-6': 1_100_000})).toStrictEqual({
    key: 'claude-sonnet-4-6',
    value: 1_100_000,
  });
  expect(singleSeries({a: 5, b: 0})).toStrictEqual({key: 'a', value: 5});
});

test('two series, an empty map, and a null map are all not the single case', () => {
  expect(singleSeries({a: 5, b: 3})).toBeNull();
  expect(singleSeries({})).toBeNull();
  expect(singleSeries({a: 0})).toBeNull();
  expect(singleSeries(null)).toBeNull();
});

test('agent rows come back largest first with display labels', () => {
  expect(agentBarRows({'general-purpose': 100, 'task-docs-wiki': 400})).toEqual(
    [
      {label: 'Task - Docs wiki', value: 400},
      {label: 'General purpose', value: 100},
    ]
  );
});

test('an agent-type name that collides with Object.prototype keeps its own total', () => {
  // `byAgentType` keys are read straight from ../gaia, so a key named after
  // an inherited member must resolve to its recorded value, never to the
  // inherited function (which `?? 0` would not catch).
  const rows = agentBarRows({constructor: 300, toString: 50, valueOf: 10});

  expect(rows).toEqual([
    {label: 'Constructor', value: 300},
    {label: 'Tostring', value: 50},
    {label: 'Valueof', value: 10},
  ]);
});

test('one audit block per audit-carrying phase, in phase order', () => {
  expect(
    auditBlocks(plan009).map((block) => [
      block.phaseKind,
      block.audit.dollars,
      block.phaseDollars,
    ])
  ).toEqual([
    ['plan', 0.5, 2],
    ['execute', 0.3, null],
  ]);
});

test('an entry with no audit on any phase yields no blocks', () => {
  expect(auditBlocks(spec018)).toEqual([]);
  expect(auditBlocks(debtCommand)).toEqual([]);
});

test('intensity is a spec-only badge and only when an audit recorded one', () => {
  expect(auditIntensity(spec032)).toBe('deep');
  // Plan audits carry `intensity: null`, so a plan never shows the badge.
  expect(auditIntensity(plan009)).toBeNull();
  expect(auditIntensity(spec018)).toBeNull();
});

test('phase measures read the three named phases and nothing else', () => {
  const phases = entryPhases(spec032);

  expect(phaseCostValues(phases)).toStrictEqual({
    execute: 7,
    plan: 2.24,
    spec: 3.1,
  });
  expect(phaseElapsedValues(phases)).toStrictEqual({
    execute: 3300,
    plan: 900,
    spec: 1200,
  });
});

test('an absent phase and a phase with no recorded figure both read null', () => {
  const phases = [phase({durationSeconds: 1200, kind: 'spec'})];

  expect(phaseCostValues(phases)).toStrictEqual({
    execute: null,
    plan: null,
    spec: null,
  });
  expect(phaseElapsedValues(phases)).toStrictEqual({
    execute: null,
    plan: null,
    spec: 1200,
  });
});

test('a phase kind that collides with Object.prototype cannot reach the result', () => {
  // `kind` is z.string() upstream ("unknown kinds pass through verbatim"), so
  // it is untrusted. Matching it against a literal, rather than indexing an
  // object by it, is what keeps the result shape fixed at three keys.
  const phases = [
    phase({kind: 'constructor', recordedDollars: 99}),
    phase({kind: '__proto__', recordedDollars: 98}),
    phase({kind: 'spec', recordedDollars: 1}),
  ];
  const values = phaseCostValues(phases);

  expect(Object.keys(values).toSorted((a, b) => a.localeCompare(b))).toEqual([
    'execute',
    'plan',
    'spec',
  ]);
  expect(values.spec).toBe(1);
  expect(values.execute).toBeNull();
});

test('linked sessions come from the entry list, or the one session otherwise', () => {
  expect(linkedSessionRefs(spec032)).toEqual([
    {logFound: true, sessionId: '3158fe6d-4480-42d3-8e70-1c4ecbfc2057'},
    {logFound: false, sessionId: '9a41c0b2-7f3d-4a11-b0c8-52e6d9f7a331'},
  ]);
  expect(linkedSessionRefs(debtCommand)).toEqual([
    {logFound: true, sessionId: 'aa11bb22-cc33-44dd-88ee-ff0011223344'},
  ]);
  expect(linkedSessionRefs(review)).toEqual([
    {logFound: true, sessionId: '51f0aa9c-2d3e-4f50-6172-8394a5b6c7d8'},
  ]);
  expect(linkedSessionRefs(plan004)).toEqual([]);
});

test('the run id belongs to command events only, and may be missing', () => {
  expect(runIdOf(debtCommand)).toBe('gaia-debt-20260715T114955Z-7b0a');
  expect(runIdOf(bareCommand)).toBeNull();
  expect(runIdOf(spec032)).toBeNull();
  expect(runIdOf(review)).toBeNull();
});
