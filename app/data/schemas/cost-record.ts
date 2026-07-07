import {z} from 'zod';

/**
 * Zod schemas for one cost.jsonl row (SPEC section 4.1). Field names mirror
 * the on-disk contract (snake_case); mapping to camelCase happens at the API
 * boundary, not here.
 *
 * Evolution rules: the contract is additive-only without a schema_version
 * bump, so every object here is loose (unknown fields pass through) and
 * enum-ish strings (`kind`, `source`) accept any value. The ONLY hard failure
 * is a `schema_version` we do not support.
 */

/** cost.jsonl schema versions this reader understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** Top-level `buckets` totals: cache write is a single collapsed number. */
const bucketTotalsSchema = z.looseObject({
  cache_read: z.number(),
  cache_write: z.number(),
  fresh_input: z.number(),
  output: z.number(),
});

/**
 * Per-entry `by_model` / `by_agent_type` values: cache write is split by TTL
 * (5m/1h). Collapsing the split and summing across `by_agent_type` entries
 * must reproduce the top-level buckets/total exactly (contract invariant,
 * fixture-tested).
 */
const splitBucketsSchema = z.looseObject({
  cache_read: z.number(),
  cache_write_1h: z.number(),
  cache_write_5m: z.number(),
  fresh_input: z.number(),
  output: z.number(),
});

export const costRecordSchema = z.looseObject({
  buckets: bucketTotalsSchema,
  /** Omitted entirely (never {}) when attribution fails or on backfill rows. */
  by_agent_type: z.record(z.string(), splitBucketsSchema).optional(),
  /** Omitted means "predates per-model attribution"; dollars is null there. */
  by_model: z.record(z.string(), splitBucketsSchema).optional(),
  dollars: z.number().nullable().optional(),
  duration_available: z.boolean().optional(),
  duration_seconds: z.number().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  final: z.boolean(),
  /** Known kinds today: execute, plan, spec. Any string is accepted. */
  kind: z.string(),
  partial: z.boolean().optional(),
  plan_id: z.string().nullable().optional(),
  /** Display-only, except slug-attributed backfill rows (SPEC section 4.1). */
  plan_slug: z.string().nullable().optional(),
  rate_table_id: z.string().nullable().optional(),
  schema_version: z.literal(SUPPORTED_SCHEMA_VERSION),
  seq: z.number(),
  /** Present (value or null) on post-SPEC-024 native rows; absent before. */
  session_cwd: z.string().nullable().optional(),
  session_id: z.string(),
  /** "backfill" marks vintage cost.md rows; absent on native rows. */
  source: z.string().optional(),
  spec_id: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  total: z.number(),
  ts: z.string(),
});

export type CostBucketTotals = z.infer<typeof bucketTotalsSchema>;

export type CostRecord = z.infer<typeof costRecordSchema>;

export type CostSplitBuckets = z.infer<typeof splitBucketsSchema>;
