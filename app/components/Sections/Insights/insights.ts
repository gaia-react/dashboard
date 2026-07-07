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

export type ActiveDay = {date: string; output: number; sessionCount: number};

/** The single day with the most output tokens, or null if no day had any. */
export const mostActiveDay = (
  heatmap: ActivityResponse['heatmap']
): ActiveDay | null =>
  heatmap.reduce<ActiveDay | null>(
    (best, day) =>
      (
        day.buckets.output > 0 &&
        (best === null || day.buckets.output > best.output)
      ) ?
        {
          date: day.date,
          output: day.buckets.output,
          sessionCount: day.sessionCount,
        }
      : best,
    null
  );

export type BusiestModel = {model: string; output: number};

/** The real model (never `<synthetic>`) with the most output tokens. */
export const busiestModel = (
  modelTotals: ActivityResponse['modelTotals']
): BusiestModel | null =>
  modelTotals.reduce<BusiestModel | null>(
    (best, entry) =>
      (
        entry.model !== SYNTHETIC_MODEL &&
        entry.buckets.output > 0 &&
        (best === null || entry.buckets.output > best.output)
      ) ?
        {model: entry.model, output: entry.buckets.output}
      : best,
    null
  );

/** Total recorded spec/plan work time, in seconds (nulls count as zero). */
export const totalRecordedWorkSeconds = (entries: CostEntry[]): number =>
  entries.reduce((sum, entry) => sum + (entry.totals.durationSeconds ?? 0), 0);
