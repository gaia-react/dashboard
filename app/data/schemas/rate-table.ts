import {z} from 'zod';

/**
 * Zod schema for the target project's committed rate table,
 * `.gaia/scripts/token-rates.json` (SPEC section 5.4). Field names mirror the
 * external file's snake_case contract on purpose.
 *
 * Loose everywhere: unknown fields pass through so upstream additions never
 * break parsing. A table that fails this schema is "unparseable" and disables
 * dollar estimates entirely; it never throws into callers.
 */

/**
 * One pricing window: per-MTok input/output rates. Dated entries
 * (`effective_through`, inclusive, day granularity) are intro-pricing windows;
 * the final undated entry is the open-ended sticker rate.
 */
export const rateWindowSchema = z.looseObject({
  effective_through: z.string().optional(),
  input: z.number(),
  output: z.number(),
});

export const rateTableSchema = z.looseObject({
  cache_multipliers: z.looseObject({
    read: z.number(),
    write_1h: z.number(),
    write_5m: z.number(),
  }),
  models: z.record(z.string(), z.array(rateWindowSchema)),
});

export type RateTable = z.infer<typeof rateTableSchema>;

export type RateWindow = z.infer<typeof rateWindowSchema>;
