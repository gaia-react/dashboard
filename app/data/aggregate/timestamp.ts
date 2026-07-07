/**
 * Raw upstream timestamps (cost.jsonl `ts`/`started_at`, ledger
 * `allocated_at`/`completed_at`/`merged_at`, session transcript timestamps)
 * are validated as loose strings at their parse boundary (SPEC section 3:
 * additive-only, unknown-tolerant), so they can arrive date-only
 * ("2026-05-05") or offset-form ("2026-05-05T23:25:51+02:00"). The API
 * contract requires trailing-Z `z.iso.datetime()` strings; either raw form
 * fails that schema and would 500 the whole endpoint on a single row.
 *
 * `canonicalizeTimestamp` accepts anything `Date.parse` can read and
 * normalizes it to canonical trailing-Z form. A wholly unparseable value
 * (or an absent one) returns null so the caller falls through to its own
 * fallback instead of throwing.
 */
export const canonicalizeTimestamp = (
  raw: null | string | undefined
): null | string => {
  if (raw === null || raw === undefined) {
    return null;
  }

  const milliseconds = Date.parse(raw);

  return Number.isNaN(milliseconds) ? null : (
      new Date(milliseconds).toISOString()
    );
};
