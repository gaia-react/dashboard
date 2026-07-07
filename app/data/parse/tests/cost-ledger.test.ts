import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import type {CostGroup} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';

const fixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/cost-jsonl/cost.jsonl', import.meta.url)
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

  test('keeps an unknown kind verbatim and surfaces it in parse health', async () => {
    const {groups, health} = await parseCostLedger(fixturePath);

    const reviewGroup = findGroup(groups, (group) => group.kind === 'review');

    expect(reviewGroup.attribution).toEqual({id: 'SPEC-102', type: 'spec'});
    // Unknown fields ride through the schema and the parser untouched.
    expect(reviewGroup.terminalRow).toMatchObject({future_field: 'keep-me'});
    expect(health.unknownKinds).toEqual(['review']);
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
    expect(health.linesRead).toBe(14);
    expect(health.lineErrors).toEqual([]);
    expect(health.invalidRows).toEqual([]);
  });
});
