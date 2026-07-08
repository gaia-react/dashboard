import {z} from 'zod';

/**
 * Zod schemas and inferred types for the two API responses (PLAN section 3):
 * `GET /api/costs` and `GET /api/activity?tz=<IANA>`.
 *
 * These are the shared contract every Phase 2+ workstream builds to. Handlers
 * validate their OUTPUT against the schemas; handlers and the client import
 * the inferred types. Field names are camelCase at this boundary: the parsers'
 * on-disk snake_case bucket keys are mapped here, never leaked to the client.
 *
 * All timestamps are UTC ISO-8601 strings (trailing `Z`); the client renders
 * local time (SPEC section 5). Day-valued fields (`heatmap[].date`,
 * `modelWeekly[].weekStart`) are `YYYY-MM-DD` in the requested timezone.
 */

/**
 * Token buckets in GAIA's vocabulary, cache write collapsed to one number.
 * Maps the parsers' `fresh_input` / `cache_write` / `cache_read` / `output`.
 * Not exported: only used to compose the schemas below in this file. The
 * inferred `Buckets` type (exported at the bottom) is the public contract
 * piece other modules actually import.
 */
const bucketsSchema = z.object({
  cacheRead: z.number(),
  cacheWrite: z.number(),
  freshInput: z.number(),
  output: z.number(),
});

/**
 * Per-model / per-agent-type buckets: cache write split by TTL, mirroring the
 * cost ledger's `by_model` / `by_agent_type` value shape (`cache_write_5m` /
 * `cache_write_1h`), camelCased. Collapsing the split reproduces `Buckets`.
 * Not exported: same reasoning as `bucketsSchema` above, the `ModelBuckets`
 * type is the public piece.
 */
const modelBucketsSchema = z.object({
  cacheRead: z.number(),
  cacheWrite1h: z.number(),
  cacheWrite5m: z.number(),
  freshInput: z.number(),
  output: z.number(),
});

/**
 * Skip/unparseable counters for one input source (SPEC section 6.8), e.g.
 * `cost.jsonl`, `specs/ledger.json`, `plans/ledger.json`, `session-logs`.
 * `linesSkipped` aggregates `streamJsonl` per-line errors plus rows rejected
 * by a schema (unsupported `schema_version`); `filesUnparseable` counts files
 * that yielded nothing at all.
 *
 * Known limitation (P3 handoff, session-logs source only): the session
 * scanner (`parse/session-scan.ts`) folds each session's main + subagent
 * transcript files into one session-level aggregate before returning, so a
 * wholly-malformed transcript FILE cannot be distinguished, cheaply and
 * without re-plumbing the scanner's return contract, from a partially-skipped
 * one. `buildSessionParseHealth` therefore hardcodes `filesUnparseable: 0` for
 * `session-logs`; a fully-malformed transcript still surfaces via its lines
 * counted in `linesSkipped`, just not as a distinct file count.
 *
 * Not exported: only used to build `parseHealthSliceSchema` below. The
 * inferred `ParseHealthCounter` type is the public contract piece.
 */
const parseHealthCounterSchema = z.object({
  filesScanned: z.number(),
  filesUnparseable: z.number(),
  linesRead: z.number(),
  linesSkipped: z.number(),
  source: z.string(),
});

/**
 * One side's parse-health slice (SPEC section 6.8). `/api/costs` carries the
 * cost-side counters, `/api/activity` the session-side ones; the client footer
 * merges the two (concatenate `counters` and `notes`, union the unknowns).
 * `notes` carries one-off upstream anomalies worth surfacing verbatim, e.g. a
 * native-over-backfill collision or an archived phase the backfill missed.
 */
export const parseHealthSliceSchema = z.object({
  counters: z.array(parseHealthCounterSchema),
  notes: z.array(z.string()),
  unknownKinds: z.array(z.string()),
  unknownStatuses: z.array(z.string()),
});

/**
 * A cost-ledger session reference; `logFound: false` renders "log missing".
 * Not exported: only used to build `costEntrySchema` below. The inferred
 * `LinkedSession` type is the public contract piece.
 */
const linkedSessionSchema = z.object({
  kind: z.string(),
  logFound: z.boolean(),
  sessionId: z.string(),
});

/**
 * GAIA SPEC-032 adversarial-audit drill-down carried onto a spec/plan phase
 * (buckets camelCased, cache-write collapsed like `Buckets`). A strict subset
 * of the enclosing phase, so it renders as detail and is NEVER summed into any
 * phase / entry / grand total. `intensity` is null on plan audits (SPEC-only).
 * Not exported: only used to build `phaseRollupSchema` below. The inferred
 * `AdversarialAudit` type is the public contract piece.
 */
const adversarialAuditSchema = z.object({
  buckets: bucketsSchema,
  dollars: z.number().nullable(),
  elapsedSeconds: z.number(),
  intensity: z.string().nullable(),
  lenses: z.array(z.string()),
});

/**
 * Per-phase detail for an expanded cost-table row (SPEC section 6.3).
 * `byModel` / `byAgentType` are null on backfill and pre-attribution rows.
 * `audit` is present only on the spec/plan phases that carried a SPEC-032
 * adversarial-audit annotation (most rows omit it).
 * Not exported: only used to build `costEntrySchema` below. The inferred
 * `PhaseRollup` type is the public contract piece.
 */
const phaseRollupSchema = z.object({
  audit: adversarialAuditSchema.optional(),
  buckets: bucketsSchema,
  byAgentType: z.record(z.string(), modelBucketsSchema).nullable(),
  byModel: z.record(z.string(), modelBucketsSchema).nullable(),
  durationSeconds: z.number().nullable(),
  /** 'spec' | 'plan' | 'execute', unknown kinds pass through verbatim. */
  kind: z.string(),
  recordedDollars: z.number().nullable(),
  source: z.literal(['backfill', 'native']),
});

/** One row of the specs & plans cost table (SPEC section 6.3). */
export const costEntrySchema = z.object({
  entryType: z.literal(['plan', 'plan-slug', 'spec']),
  /** Null for slug rows (pre-ledger archived plans). */
  id: z.string().nullable(),
  /** "SPEC-023" | "PLAN-001" | "slug:plan". */
  key: z.string(),
  partial: z.boolean(),
  phases: z.array(phaseRollupSchema),
  sessions: z.array(linkedSessionSchema),
  /** `allocated_at`, or the earliest backfill `ts` for slug rows. */
  sortAt: z.iso.datetime(),
  source: z.literal(['backfill', 'mixed', 'native', 'none']),
  /** Ledger pass-through; unknown values render verbatim. Null on slug rows. */
  status: z.string().nullable(),
  /** Intent / subject / slug. */
  title: z.string(),
  totals: z.object({
    buckets: bucketsSchema,
    durationSeconds: z.number().nullable(),
    recordedDollars: z.number().nullable(),
  }),
});

/**
 * One ad-hoc code-review row (GAIA SPEC-032): a `code-review-audit` review with
 * no spec/plan association, so it has no cost-table entry. Surfaced on its own
 * (never folded into the `recordedDollars` KPI, which is spec & plan work) so
 * its net-new recorded spend stays visible instead of silently inflating a KPI.
 */
export const adHocReviewSchema = z.object({
  /** Coverage timestamp (`started_at`, else `ts`). */
  at: z.iso.datetime(),
  buckets: bucketsSchema,
  durationSeconds: z.number().nullable(),
  recordedDollars: z.number().nullable(),
  /** Producer `review_id` (one row per run); null if the row omitted it. */
  reviewId: z.string().nullable(),
  sessionId: z.string(),
});

/** `GET /api/costs` (PLAN section 3). */
export const costsResponseSchema = z.object({
  /**
   * Ad-hoc (null spec_id / plan_id) `code-review-audit` reviews (SPEC-032):
   * recorded spend with no spec/plan row. Empty for projects with none;
   * `.default([])` lets pre-SPEC-032 response fixtures omit the field.
   */
  adHocReviews: z.array(adHocReviewSchema).default([]),
  /** Earliest cost row ts, for the section 6.1 coverage disclosure. */
  coverage: z.object({costSince: z.iso.datetime().nullable()}),
  /** Section 6.3 rows, chronological. */
  entries: z.array(costEntrySchema),
  kpis: z.object({
    /** `merged` counts ledger plans with a normalized `merged` status; slug
     * (pre-ledger) plans have no status and count only toward `total`. */
    plans: z.object({merged: z.number(), total: z.number()}),
    /** Tiers 1+2 only, never mixed with estimates (SPEC section 5 rule 3). */
    recordedDollars: z.number(),
    specs: z.object({merged: z.number(), total: z.number()}),
  }),
  /** Cost-side counters. */
  parseHealth: parseHealthSliceSchema,
  project: z.object({
    claudeConfigDir: z.string(),
    name: z.string(),
    root: z.string(),
  }),
  rateTable: z.object({
    id: z.string().nullable(),
    status: z.literal(['missing', 'ok', 'unparseable']),
  }),
});

/** One session row for the sessions list (SPEC section 6.6). */
export const sessionSummarySchema = z.object({
  /** Null means ad hoc. */
  attribution: z
    .object({
      entryType: z.literal(['plan', 'plan-slug', 'spec']),
      key: z.string(),
    })
    .nullable(),
  buckets: bucketsSchema,
  /**
   * Null when the session is unpriceable (rate table unusable and no recorded
   * row). Recorded and estimated figures never sum (SPEC section 5 rule 3).
   */
  dollars: z
    .object({
      basis: z.literal(['estimated', 'recorded']),
      lowerBound: z.boolean(),
      value: z.number(),
    })
    .nullable(),
  durationSeconds: z.number(),
  endedAt: z.iso.datetime(),
  gitBranch: z.string().nullable(),
  models: z.array(z.string()),
  sessionId: z.string(),
  startedAt: z.iso.datetime(),
  /** ai-title, else truncated lastPrompt, else null (client shows the uuid). */
  title: z.string().nullable(),
  turnCount: z.number(),
});

/** `GET /api/activity?tz=<IANA>` (PLAN section 3). */
export const activityResponseSchema = z.object({
  /** One cell per local-tz day (requested tz), full session-log history. */
  heatmap: z.array(
    z.object({
      buckets: bucketsSchema,
      date: z.iso.date(),
      sessionCount: z.number(),
    })
  ),
  kpis: z.object({
    /** In the requested tz. */
    activeDays: z.number(),
    /** Null when the rate table is unusable (SPEC section 5.4). */
    estimatedAdHocDollars: z
      .object({lowerBound: z.boolean(), value: z.number()})
      .nullable(),
    /** All activity, token-denominated. */
    totalBuckets: bucketsSchema,
  }),
  modelTotals: z.array(z.object({buckets: bucketsSchema, model: z.string()})),
  modelWeekly: z.array(
    z.object({
      outputByModel: z.record(z.string(), z.number()),
      weekStart: z.iso.date(),
    })
  ),
  /** Session-side counters. */
  parseHealth: parseHealthSliceSchema,
  scan: z.object({
    activitySince: z.iso.datetime().nullable(),
    fileCount: z.number(),
    scannedAt: z.iso.datetime(),
    sessionCount: z.number(),
  }),
  /** Reverse-chronological, full set; the client paginates. */
  sessions: z.array(sessionSummarySchema),
});

/** Non-200 error envelope, `{error: {code, message}}` (PLAN section 3). */
export const apiErrorSchema = z.object({
  error: z.object({code: z.string(), message: z.string()}),
});

export type ActivityResponse = z.infer<typeof activityResponseSchema>;

export type AdHocReview = z.infer<typeof adHocReviewSchema>;

export type AdversarialAudit = z.infer<typeof adversarialAuditSchema>;

export type ApiError = z.infer<typeof apiErrorSchema>;

export type Buckets = z.infer<typeof bucketsSchema>;

export type CostEntry = z.infer<typeof costEntrySchema>;

export type CostsResponse = z.infer<typeof costsResponseSchema>;

export type LinkedSession = z.infer<typeof linkedSessionSchema>;

export type ModelBuckets = z.infer<typeof modelBucketsSchema>;

export type ParseHealthCounter = z.infer<typeof parseHealthCounterSchema>;

export type ParseHealthSlice = z.infer<typeof parseHealthSliceSchema>;

export type PhaseRollup = z.infer<typeof phaseRollupSchema>;

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
