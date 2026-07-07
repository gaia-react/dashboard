import {readFileSync} from 'node:fs';
import type {FileCache} from '~/data/cache';
import type {RateTable, RateWindow} from '~/data/schemas/rate-table';
import {rateTableSchema} from '~/data/schemas/rate-table';

/**
 * Re-implementation of GAIA's dollar-pricing arithmetic (SPEC section 5.4;
 * upstream source of truth: `.gaia/scripts/token-pricing-lib.sh`). Prices
 * per-model, TTL-split usage against the target project's committed rate
 * table, degrading exactly like GAIA's own readout, never fabricating.
 */

/** Discriminated load result; `missing` / `unparseable` disable estimates. */
export type RateTableLoad =
  | {status: 'missing'}
  | {status: 'ok'; table: RateTable}
  | {status: 'unparseable'};

/**
 * Read and validate the rate table at `tablePath`, memoized through the P0
 * file cache. Never throws: a missing/unreadable file is `missing`; invalid
 * JSON or a shape the schema rejects is `unparseable`.
 */
export const loadRateTable = (
  cache: FileCache,
  tablePath: string
): RateTableLoad => {
  try {
    return cache.get(tablePath, (path): RateTableLoad => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        return {status: 'unparseable'};
      }

      const result = rateTableSchema.safeParse(parsed);

      return result.success ?
          {status: 'ok', table: result.data}
        : {status: 'unparseable'};
    });
  } catch {
    // statSync/readFileSync failed: no table at that path.
    return {status: 'missing'};
  }
};

export type PriceEstimate = {
  dollars: number;
  /** True when any `claude-*` model could not be priced; the figure is a floor. */
  lowerBound: boolean;
  /** The `claude-*` models missing from the table (names the lower bound). */
  unpricedModels: string[];
};

/** Per-model usage, TTL-split (SPEC section 4.4), in tokens. */
export type UsageBuckets = {
  cacheRead: number;
  cacheWrite1h: number;
  cacheWrite5m: number;
  freshInput: number;
  output: number;
};

/**
 * Pick the pricing window covering `anchorDay` (YYYY-MM-DD): the first entry
 * whose `effective_through` is undated (open-ended sticker rate) or >= the
 * anchor day, INCLUSIVE. Mirrors upstream `rate_window` (day-granularity
 * lexicographic compare). Returns undefined when the model has no windows.
 */
const selectRateWindow = (
  windows: RateWindow[],
  anchorDay: string
): RateWindow | undefined =>
  windows.find(
    (window) =>
      window.effective_through === undefined ||
      anchorDay <= window.effective_through
  );

/**
 * Price per-model, TTL-split usage against a loaded rate table at the given
 * run-time anchor (ISO timestamp; day granularity is used for window
 * selection). Degradation mirrors upstream `priced_row`: non-`claude-` keys
 * are ignored silently; a `claude-*` model missing from the table contributes
 * zero and marks the figure a named lower bound.
 */
export const estimateDollars = (
  table: RateTable,
  usageByModel: Record<string, UsageBuckets>,
  anchor: string
): PriceEstimate => {
  const anchorDay = anchor.slice(0, 10);
  const multipliers = table.cache_multipliers;
  const unpricedModels: string[] = [];
  let dollars = 0;

  const claudeEntries = Object.entries(usageByModel).filter(([model]) =>
    model.startsWith('claude-')
  );

  for (const [model, buckets] of claudeEntries) {
    const window = selectRateWindow(table.models[model] ?? [], anchorDay);

    if (window === undefined) {
      unpricedModels.push(model);
    } else {
      dollars +=
        (buckets.freshInput * window.input +
          buckets.cacheWrite5m * window.input * multipliers.write_5m +
          buckets.cacheWrite1h * window.input * multipliers.write_1h +
          buckets.cacheRead * window.input * multipliers.read +
          buckets.output * window.output) /
        1_000_000;
    }
  }

  return {dollars, lowerBound: unpricedModels.length > 0, unpricedModels};
};
