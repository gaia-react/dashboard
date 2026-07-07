import {z} from 'zod';

/**
 * Zod schemas for `.gaia/local/{specs,plans}/ledger.json` (SPEC section 4.2).
 *
 * Field names mirror the on-disk snake_case contract; the parse layer
 * (`app/data/parse/ledgers.ts`) maps them to camelCase at the boundary.
 * Everything is loose and tolerant by design: unknown `status` / `source`
 * values pass through as their literal strings (the dashboard renders them
 * verbatim, SPEC section 4.2), and unknown fields are preserved, never
 * rejected.
 */

export const specLedgerEntrySchema = z.looseObject({
  allocated_at: z.string().optional(),
  id: z.string(),
  intent: z.string().optional(),
  merged_at: z.string().nullish(),
  source: z.string().optional(),
  status: z.string().optional(),
});

export const specLedgerSchema = z.looseObject({
  specs: z.array(specLedgerEntrySchema),
  version: z.number().optional(),
});

/**
 * Tolerates BOTH plan shapes: the post-SPEC-024 shape carries `status`
 * (canonical `allocated | completed | abandoned`, `abandoned` reserved with no
 * writer yet) and `completed_at` (null/absent until completed); the old shape
 * lacks both. `status` is lifecycle and `source` is provenance; the two are
 * distinct even though both can read `"allocated"`.
 */
export const planLedgerEntrySchema = z.looseObject({
  allocated_at: z.string().optional(),
  completed_at: z.string().nullish(),
  id: z.string(),
  source: z.string().optional(),
  status: z.string().optional(),
  subject: z.string().optional(),
});

export const planLedgerSchema = z.looseObject({
  plans: z.array(planLedgerEntrySchema),
  version: z.number().optional(),
});

export type PlanLedger = z.infer<typeof planLedgerSchema>;

export type PlanLedgerEntry = z.infer<typeof planLedgerEntrySchema>;

export type SpecLedger = z.infer<typeof specLedgerSchema>;

export type SpecLedgerEntry = z.infer<typeof specLedgerEntrySchema>;
