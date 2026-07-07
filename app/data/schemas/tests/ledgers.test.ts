import {describe, expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {planLedgerSchema, specLedgerSchema} from '~/data/schemas/ledgers';

const readFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../../test/fixtures/ledgers/${name}`, import.meta.url)
      ),
      'utf8'
    )
  );

describe('specLedgerSchema', () => {
  test('parses a specs ledger with mixed sources, progressing statuses, and an ID gap', () => {
    const result = specLedgerSchema.safeParse(readFixture('specs-ledger.json'));

    expect(result.success).toBe(true);

    const specs = result.data?.specs ?? [];

    // Ledger order preserved verbatim; SPEC-004 gap is not filled in.
    expect(specs.map((spec) => spec.id)).toEqual([
      'SPEC-001',
      'SPEC-002',
      'SPEC-003',
      'SPEC-005',
      'SPEC-006',
    ]);
    expect(specs.map((spec) => spec.source)).toEqual([
      'backfilled',
      'allocated',
      'allocated',
      'allocated',
      'imported',
    ]);
    expect(specs[0]?.merged_at).toBe('2026-05-09T08:22:10Z');
    // merged_at is optional before a spec merges.
    expect(specs[1]?.merged_at).toBeUndefined();
  });

  test('passes an unknown status through as its literal string without throwing', () => {
    const result = specLedgerSchema.safeParse(readFixture('specs-ledger.json'));

    expect(result.success).toBe(true);
    expect(result.data?.specs[3]?.status).toBe('superseded');
  });

  test('passes an unknown source through as its literal string without throwing', () => {
    const result = specLedgerSchema.safeParse(readFixture('specs-ledger.json'));

    expect(result.success).toBe(true);
    // SPEC-006 carries source "imported", outside the observed vocabulary
    // ("allocated" / "backfilled"); it must survive verbatim, so a regression
    // narrowing source to an enum fails here.
    expect(result.data?.specs[4]?.source).toBe('imported');
  });
});

describe('planLedgerSchema', () => {
  test('parses the post-SPEC-024 shape and keeps status distinct from source', () => {
    const result = planLedgerSchema.safeParse(
      readFixture('plans-ledger-post-spec-024.json')
    );

    expect(result.success).toBe(true);

    const plans = result.data?.plans ?? [];

    expect(plans.map((plan) => plan.id)).toEqual([
      'PLAN-001',
      'PLAN-002',
      'PLAN-004',
    ]);
    // PLAN-002: both fields read "allocated" yet stay distinct
    // (source is provenance, status is lifecycle).
    expect(plans[1]?.source).toBe('allocated');
    expect(plans[1]?.status).toBe('allocated');
    expect(plans[1]?.completed_at).toBeNull();
    expect(plans[0]?.status).toBe('completed');
    expect(plans[0]?.completed_at).toBe('2026-07-04T09:07:28Z');
    // Unknown lifecycle value passes through as its literal string.
    expect(plans[2]?.status).toBe('paused');
  });

  test('parses the old plan shape that lacks status and completed_at', () => {
    const result = planLedgerSchema.safeParse(
      readFixture('plans-ledger-old-shape.json')
    );

    expect(result.success).toBe(true);

    const plans = result.data?.plans ?? [];

    expect(plans).toHaveLength(2);
    expect(plans[0]?.status).toBeUndefined();
    expect(plans[0]?.completed_at).toBeUndefined();
    expect(plans[0]?.subject).toBe(
      'Old-shape plan row without lifecycle fields.'
    );
  });
});
