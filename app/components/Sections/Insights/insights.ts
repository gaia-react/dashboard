import type {
  ActivityResponse,
  CostEntry,
  SessionSummary,
} from '~/data/schemas/api';

/**
 * Pure "highlights" reducers for the Insights section (feedback): the most
 * expensive work, the longest sessions, the busiest day and model, and the
 * total recorded time. Each is a small, directly-testable function over the
 * already-fetched API slices; the component only formats and lays them out.
 */

const SYNTHETIC_MODEL = '<synthetic>';

export type CostlyEntry = {dollars: number; key: string; title: string};

/** Specs and plans with a recorded dollar figure, most expensive first. */
export const topCostlyEntries = (
  entries: CostEntry[],
  limit = 5
): CostlyEntry[] =>
  entries
    .flatMap((entry) =>
      (
        entry.totals.recordedDollars !== null &&
        entry.totals.recordedDollars > 0
      ) ?
        [
          {
            dollars: entry.totals.recordedDollars,
            key: entry.key,
            title: entry.title,
          },
        ]
      : []
    )
    .toSorted((first, second) => second.dollars - first.dollars)
    .slice(0, limit);

export type LongSession = {
  durationSeconds: number;
  sessionId: string;
  title: string;
};

/** The longest single sessions by wall-clock duration, longest first. */
export const longestSessions = (
  sessions: SessionSummary[],
  limit = 5
): LongSession[] =>
  sessions
    .toSorted((first, second) => second.durationSeconds - first.durationSeconds)
    .slice(0, limit)
    .map((session) => ({
      durationSeconds: session.durationSeconds,
      sessionId: session.sessionId,
      title: session.title ?? session.sessionId,
    }));

export type ActiveDay = {
  date: string;
  sessionCount: number;
  totalTokens: number;
};

/**
 * The single day with the most total tokens, or null if no day had any.
 * Phase 8 v2: this was the day with the most OUTPUT tokens; the metric moved
 * to total tokens (all four buckets), so a day that led on output but not on
 * total may no longer win here. That is the intended new basis, not a bug.
 */
export const mostActiveDay = (
  heatmap: ActivityResponse['heatmap']
): ActiveDay | null =>
  heatmap.reduce<ActiveDay | null>(
    (best, day) =>
      (
        day.totalTokens > 0 &&
        (best === null || day.totalTokens > best.totalTokens)
      ) ?
        {
          date: day.date,
          sessionCount: day.sessionCount,
          totalTokens: day.totalTokens,
        }
      : best,
    null
  );

export type BusiestModel = {model: string; totalTokens: number};

/**
 * The real model (never `<synthetic>`) with the most total tokens.
 * Phase 8 v2: this was the model with the most OUTPUT tokens; the metric
 * moved to total tokens, so the winner may differ from the output-based one.
 */
export const busiestModel = (
  modelTotals: ActivityResponse['modelTotals']
): BusiestModel | null =>
  modelTotals.reduce<BusiestModel | null>(
    (best, entry) =>
      (
        entry.model !== SYNTHETIC_MODEL &&
        entry.totalTokens > 0 &&
        (best === null || entry.totalTokens > best.totalTokens)
      ) ?
        {model: entry.model, totalTokens: entry.totalTokens}
      : best,
    null
  );

/** Total recorded spec/plan work time, in seconds (nulls count as zero). */
export const totalRecordedWorkSeconds = (entries: CostEntry[]): number =>
  entries.reduce((sum, entry) => sum + (entry.totals.durationSeconds ?? 0), 0);
