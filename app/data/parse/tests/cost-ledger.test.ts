import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import type {CostGroup} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';

const fixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/cost-jsonl/cost.jsonl', import.meta.url)
);

const commandFixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/cost-ledger/cost.jsonl', import.meta.url)
);

const findGroup = (
  groups: CostGroup[],
  predicate: (group: CostGroup) => boolean
): CostGroup => {
  const group = groups.find(predicate);

  if (!group) {
    throw new Error('expected group not found in fixture parse');
  }

  return group;
};

describe('parseCostLedger', () => {
  test('prefers the final:true row over a higher-seq non-final row', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const specGroup = findGroup(
      groups,
      (group) =>
        group.attribution.type === 'spec' &&
        group.attribution.id === 'SPEC-100' &&
        group.kind === 'execute'
    );

    // Rows are cumulative (seq 0..2, totals 9100 / 13650 / 17000). The
    // terminal row is the final:true one at seq 1, NOT the max-seq row and
    // never a sum across rows.
    expect(specGroup.terminalRow.seq).toBe(1);
    expect(specGroup.terminalRow.total).toBe(13_650);
    expect(specGroup.rowCount).toBe(3);
  });

  test('falls back to the max-seq row when no row is marked final', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const planGroup = findGroup(
      groups,
      (group) =>
        group.attribution.type === 'plan' && group.attribution.id === 'PLAN-001'
    );

    // seq 0..2, none final; totals 1130 / 2260 / 3390. Terminal is seq 2.
    expect(planGroup.terminalRow.seq).toBe(2);
    expect(planGroup.terminalRow.total).toBe(3390);
    expect(planGroup.rowCount).toBe(3);
  });

  test('native wins a native+backfill collision and the collision is noted', async () => {
    const {groups, health} = await parseCostLedger(fixturePath);

    const collidingGroups = groups.filter(
      (group) =>
        group.attribution.type === 'spec' &&
        group.attribution.id === 'SPEC-101' &&
        group.kind === 'spec'
    );

    // One group, not two: native and backfill rows share the same
    // (attribution, kind, session) key.
    expect(collidingGroups).toHaveLength(1);
    expect(collidingGroups[0].source).toBe('native');
    // Native row's totals, not the backfill row's (150 vs 154).
    expect(collidingGroups[0].terminalRow.total).toBe(150);
    expect(health.nativeBackfillCollisions).toEqual([
      'spec:SPEC-101|spec|cccccccc-1111-2222-3333-444444444444',
    ]);
  });

  test('keeps a both-null row as unattributed, never dropped', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const degradedGroup = findGroup(
      groups,
      (group) => group.attribution.type === 'unattributed'
    );

    expect(degradedGroup.terminalRow.total).toBe(709);
    // partial rows are badged, not excluded.
    expect(degradedGroup.terminalRow.partial).toBe(true);
  });

  test('groups both-null backfill rows by plan_slug', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const slugGroups = groups.filter(
      (group) =>
        group.attribution.type === 'plan-slug' &&
        group.attribution.slug === 'legacy-plan'
    );

    // Two (kind, session) groups under one slug, all backfill-sourced.
    expect(slugGroups).toHaveLength(2);
    expect(slugGroups.every((group) => group.source === 'backfill')).toBe(true);

    const planPhase = findGroup(slugGroups, (group) => group.kind === 'plan');
    const executePhase = findGroup(
      slugGroups,
      (group) => group.kind === 'execute'
    );

    // Recorded dollars/duration only where the vintage source had them.
    expect(planPhase.terminalRow.dollars).toBeCloseTo(13.58, 10);
    expect(planPhase.terminalRow.duration_seconds).toBe(3067);
    expect(executePhase.terminalRow.dollars).toBeNull();
    expect(executePhase.terminalRow.duration_seconds).toBeNull();
  });

  test('keeps a known kind row with unknown fields verbatim, without flagging it unknown', async () => {
    const {groups, health} = await parseCostLedger(fixturePath);

    const reviewGroup = findGroup(groups, (group) => group.kind === 'review');

    expect(reviewGroup.attribution).toEqual({id: 'SPEC-102', type: 'spec'});
    // Unknown fields ride through the schema and the parser untouched.
    expect(reviewGroup.terminalRow).toMatchObject({future_field: 'keep-me'});
    // review is a known kind (KNOWN_KINDS); this fixture carries no
    // genuinely unknown kind, so unknownKinds is empty here. The
    // command-ledger fixture below covers the genuine-unknown-kind case.
    expect(health.unknownKinds).toEqual([]);
  });

  test('rejects an unsupported schema_version row and counts it in health', async () => {
    const {groups, health} = await parseCostLedger(fixturePath);

    const versionTwoGroups = groups.filter(
      (group) =>
        group.attribution.type === 'spec' && group.attribution.id === 'SPEC-999'
    );

    expect(versionTwoGroups).toHaveLength(0);
    expect(health.unsupportedSchemaVersions).toEqual([
      {lineNumber: 14, schemaVersion: 2},
    ]);
    // Every other fixture line parsed cleanly.
    expect(health.linesRead).toBe(17);
    expect(health.lineErrors).toEqual([]);
    expect(health.invalidRows).toEqual([]);
  });

  test('rides the SPEC-032 audit annotation through onto the terminal row', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const specGroup = findGroup(
      groups,
      (group) =>
        group.attribution.type === 'spec' &&
        group.attribution.id === 'SPEC-101' &&
        group.kind === 'spec'
    );

    // The nested audit is an unknown-to-the-old-schema field; it survives
    // parsing untouched, snake_case intact (camelCasing happens downstream).
    expect(specGroup.terminalRow.audit?.adversarial).toMatchObject({
      buckets: {cache_read: 30, cache_write: 20, fresh_input: 5, output: 40},
      dollars: 0.01,
      elapsed_seconds: 45,
      intensity: 'standard',
      lenses: ['FG', 'TST', 'COV', 'RT'],
    });
  });

  test('keys review rows by review_id so same-session runs are not collapsed', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    // Two code-review-audit runs share one session; folding by (attribution,
    // kind, session) like a cumulative phase would drop one. Each review_id is
    // its own single-row group instead.
    const reviewRuns = groups.filter(
      (group) =>
        group.kind === 'review' &&
        group.sessionId === 'rrrrrrrr-1111-2222-3333-444444444444'
    );

    expect(reviewRuns).toHaveLength(2);
    expect(reviewRuns.every((group) => group.rowCount === 1)).toBe(true);
    expect(
      reviewRuns
        .map((group) => group.terminalRow.dollars ?? 0)
        .toSorted((a, b) => a - b)
    ).toEqual([1, 2]);
  });

  test('keeps an ad-hoc review unattributed while preserving its source tag', async () => {
    const {groups} = await parseCostLedger(fixturePath);

    const adHocReview = findGroup(
      groups,
      (group) =>
        group.kind === 'review' &&
        group.sessionId === 'ssssssss-1111-2222-3333-444444444444'
    );

    // Null spec_id/plan_id degrades to unattributed, but the identifying
    // source tag rides through on the terminal row (never collapsed away).
    expect(adHocReview.attribution).toEqual({type: 'unattributed'});
    expect(adHocReview.terminalRow.source).toBe('code-review-audit');
    expect(adHocReview.terminalRow.review_id).toBe('agent-adhoc0001');
    expect(adHocReview.terminalRow.dollars).toBe(0.75);
  });
});

describe('parseCostLedger: command rows (SPEC-032 gaia-* commands)', () => {
  test('command and review are known kinds; a genuine unknown kind still surfaces', async () => {
    const {health} = await parseCostLedger(commandFixturePath);

    expect(health.unknownKinds).toEqual(['triage']);
  });

  test('a command row is not dropped and produces its own group', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const commandGroup = findGroup(
      groups,
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00001-1111-2222-3333-444444444444'
    );

    // No spec_id/plan_id on a command row: legal degraded attribution.
    expect(commandGroup.attribution).toEqual({type: 'unattributed'});
    expect(commandGroup.terminalRow.command).toBe('gaia-debt');
  });

  test('the github field survives parsing on the pr shape', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const commandGroup = findGroup(
      groups,
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00001-1111-2222-3333-444444444444'
    );

    expect(commandGroup.terminalRow.github).toEqual({
      number: 769,
      repo: 'gaia-react/gaia',
      type: 'pr',
    });
  });

  test('the github field survives parsing on the issue shape (gaia-forensics)', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const commandGroup = findGroup(
      groups,
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00002-1111-2222-3333-444444444444'
    );

    expect(commandGroup.terminalRow.command).toBe('gaia-forensics');
    expect(commandGroup.terminalRow.github).toEqual({
      number: 42,
      repo: 'gaia-react/gaia',
      type: 'issue',
    });
  });

  test('a command row with no github key parses with github absent', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const commandGroup = findGroup(
      groups,
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00003-1111-2222-3333-444444444444'
    );

    expect(commandGroup.terminalRow.github).toBeUndefined();
  });

  test('a command row with no run_id still produces a group (base key fallback)', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const noRunIdGroups = groups.filter(
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00004-1111-2222-3333-444444444444'
    );

    expect(noRunIdGroups).toHaveLength(1);
    expect(noRunIdGroups[0].terminalRow.run_id).toBeUndefined();
  });

  test('two command rows sharing a session but different run_id produce two groups', async () => {
    const {groups} = await parseCostLedger(commandFixturePath);

    const sameSessionGroups = groups.filter(
      (group) =>
        group.kind === 'command' &&
        group.sessionId === 'cmd00005-1111-2222-3333-444444444444'
    );

    expect(sameSessionGroups).toHaveLength(2);
    expect(sameSessionGroups.every((group) => group.rowCount === 1)).toBe(true);
    expect(
      sameSessionGroups
        .map((group) => group.terminalRow.run_id)
        .toSorted((a, b) => (a ?? '').localeCompare(b ?? ''))
    ).toEqual([
      'gaia-wiki-20260718T100000Z-aaaa',
      'gaia-wiki-20260718T110000Z-bbbb',
    ]);
  });
});
