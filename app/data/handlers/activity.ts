import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import type {
  ActivityAggregation,
  SessionAttributionResolver,
} from '~/data/aggregate/activity';
import {aggregateActivity} from '~/data/aggregate/activity';
import type {FileCache} from '~/data/cache';
import type {DashboardConfig} from '~/data/config';
import type {CostGroup} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import {discoverProjectDirectories} from '~/data/parse/discover';
import type {SessionScan} from '~/data/parse/session-scan';
import {scanProjectDirectory} from '~/data/parse/session-scan';
import {loadRateTable} from '~/data/pricing/rates';
import {joinCostGroupsToSessions} from '~/data/reconcile/attribution';
import {buildSessionParseHealth} from '~/data/reconcile/parse-health';
import type {ActivityResponse} from '~/data/schemas/api';
import {activityResponseSchema} from '~/data/schemas/api';

/**
 * `GET /api/activity?tz=<IANA>` handler (PLAN section 3): pure
 * `(context, query) -> ActivityResponse`, framework-agnostic (zero Vite
 * imports; only `server/plugin.ts` may touch Vite). Composes W3's session
 * scan, W1's cost ledger (recorded dollars per session), W4's rate-table
 * pricing, W7's attribution join and parse health, and the W6 activity
 * aggregation. The output is validated against the shared response schema
 * before it is returned.
 */
export type ActivityHandlerContext = {
  cache: FileCache;
  config: DashboardConfig;
  /**
   * Override for the session_id -> entry attribution join. Defaults to W7's
   * `joinCostGroupsToSessions` over the parsed cost ledger; tests inject
   * alternatives here.
   */
  resolveAttribution?: SessionAttributionResolver;
};

export type ActivityQuery = {
  /** IANA timezone for the local-day fold (PLAN D4). Defaults to UTC. */
  tz?: string;
};

/**
 * Validate the requested timezone by asking Intl to resolve it; an invalid
 * or absent name falls back to UTC (the client always sends a browser-derived
 * zone, so this is a defensive default, not an error path).
 *
 * react-doctor flags the formatter below as rebuilt "each call"; left as-is:
 * this runs once per API request (not in a loop), and `requested` is an
 * arbitrary caller-supplied IANA name with no single dominant value, so
 * there is nothing to hoist to a module-level default the way the locale
 * formatters elsewhere in this codebase do.
 */
const resolveTimeZone = (requested: string | undefined): string => {
  if (requested === undefined || requested === '') {
    return 'UTC';
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: requested,
    }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

/**
 * Count the transcript files one confirmed project directory contributes:
 * top-level `<uuid>.jsonl` plus `<uuid>/subagents/agent-*.jsonl` (mirrors
 * what `scanProjectDirectory` reads; `tool-results/` and other entries are
 * ignored, SPEC section 4.4).
 */
const countTranscriptFiles = (projectDirectory: string): number =>
  readdirSync(projectDirectory, {recursive: true, withFileTypes: true}).filter(
    (entry) => {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        return false;
      }

      if (entry.parentPath === projectDirectory) {
        return true;
      }

      return (
        entry.name.startsWith('agent-') &&
        path.basename(entry.parentPath) === 'subagents' &&
        path.dirname(path.dirname(entry.parentPath)) === projectDirectory
      );
    }
  ).length;

/**
 * Terminal-row cost groups from cost.jsonl (W1). A missing ledger is a legal
 * state (fresh adopter), not an error.
 */
const readCostGroups = async (
  cache: FileCache,
  ledgerPath: string
): Promise<CostGroup[]> => {
  if (!existsSync(ledgerPath)) {
    return [];
  }

  const {groups} = await cache.get(ledgerPath, parseCostLedger);

  return groups;
};

/**
 * Recorded dollars per session from cost.jsonl terminal rows (SPEC section
 * 5.4: recorded dollars are authoritative wherever present). A session
 * referenced by several priced groups sums them: recorded with recorded is
 * legal, only recorded with estimated never mixes.
 */
const collectRecordedDollarsBySession = (
  groups: CostGroup[]
): Map<string, number> => {
  const recorded = new Map<string, number>();

  for (const group of groups) {
    const {dollars} = group.terminalRow;

    if (typeof dollars === 'number') {
      recorded.set(
        group.sessionId,
        (recorded.get(group.sessionId) ?? 0) + dollars
      );
    }
  }

  return recorded;
};

const scanAllProjectDirectories = async (
  context: ActivityHandlerContext
): Promise<{
  directories: string[];
  fileCount: number;
  scans: SessionScan[];
}> => {
  const directories = await discoverProjectDirectories(
    path.join(context.config.claudeConfigDir, 'projects'),
    context.config.projectRoot,
    context.cache
  );
  const scansPerDirectory = await Promise.all(
    directories.map(async (directory) =>
      scanProjectDirectory(directory, context.cache)
    )
  );

  return {
    directories,
    fileCount: directories.reduce(
      (total, directory) => total + countTranscriptFiles(directory),
      0
    ),
    scans: scansPerDirectory.flat(),
  };
};

export const handleActivity = async (
  context: ActivityHandlerContext,
  query: ActivityQuery = {}
): Promise<ActivityResponse> => {
  const {cache, config, resolveAttribution} = context;

  // The session-log scan and the cost-ledger read are independent (neither's
  // input depends on the other's output): run them together instead of one
  // after another.
  const [{directories, fileCount, scans}, costGroups] = await Promise.all([
    scanAllProjectDirectories(context),
    readCostGroups(
      cache,
      path.join(config.projectRoot, '.gaia', 'local', 'telemetry', 'cost.jsonl')
    ),
  ]);
  const rateTable = loadRateTable(
    cache,
    path.join(config.projectRoot, '.gaia', 'scripts', 'token-rates.json')
  );
  const join = joinCostGroupsToSessions(costGroups, {
    claudeConfigDir: config.claudeConfigDir,
    discoveredDirectories: directories,
  });

  const aggregation: ActivityAggregation = aggregateActivity({
    rateTable,
    recordedDollarsBySession: collectRecordedDollarsBySession(costGroups),
    resolveAttribution:
      resolveAttribution ??
      ((sessionId) => join.bySessionId.get(sessionId) ?? null),
    scans,
    timeZone: resolveTimeZone(query.tz),
  });

  const parseHealth = buildSessionParseHealth({fileCount, scans});

  if (aggregation.untimedSessionIds.length > 0) {
    parseHealth.notes.push(
      `${aggregation.untimedSessionIds.length} session(s) had no timestamped activity and were omitted from the sessions list`
    );
  }

  return activityResponseSchema.parse({
    heatmap: aggregation.heatmap,
    kpis: aggregation.kpis,
    modelTotals: aggregation.modelTotals,
    modelWeekly: aggregation.modelWeekly,
    parseHealth,
    scan: {
      activitySince: aggregation.activitySince,
      fileCount,
      scannedAt: new Date().toISOString(),
      sessionCount: scans.length,
    },
    sessions: aggregation.sessions,
  } satisfies ActivityResponse);
};
