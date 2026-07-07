import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {buildCostEntries} from '~/data/aggregate/cost-entries';
import type {FileCache} from '~/data/cache';
import type {DashboardConfig} from '~/data/config';
import type {CostLedgerResult} from '~/data/parse/cost-ledger';
import {parseCostLedger} from '~/data/parse/cost-ledger';
import {discoverProjectDirectories} from '~/data/parse/discover';
import type {LedgerReadResult} from '~/data/parse/ledgers';
import {readPlanLedger, readSpecLedger} from '~/data/parse/ledgers';
import {loadRateTable} from '~/data/pricing/rates';
import type {AttributionJoin} from '~/data/reconcile/attribution';
import {joinCostGroupsToSessions} from '~/data/reconcile/attribution';
import {buildCostParseHealth} from '~/data/reconcile/parse-health';
import type {CostsResponse, ParseHealthSlice} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

/**
 * `GET /api/costs` (PLAN section 3): pure `(context) => CostsResponse`, zero
 * Vite imports (npx constraint, SPEC section 3). Composes config + the W1/W2
 * parsers + the cost-entries aggregator + the W4 rate-table load + W7's
 * attribution join and parse-health builders. The endpoint takes no query
 * parameters. The output is validated against the shared Zod schema before it
 * is returned.
 */

/** What a handler needs from the server adapter (built in P3). */
export type HandlerContext = {
  cache: FileCache;
  config: DashboardConfig;
};

const EMPTY_COST_RESULT: CostLedgerResult = {
  groups: [],
  health: {
    invalidRows: [],
    lineErrors: [],
    linesRead: 0,
    nativeBackfillCollisions: [],
    unknownKinds: [],
    unsupportedSchemaVersions: [],
  },
};

type CostLedgerRead = {
  /** Set when the file exists but streaming it failed outright. */
  readFailure: null | string;
  result: CostLedgerResult;
  scanned: boolean;
};

const readCostLedgerFile = async (
  filePath: string,
  cache: FileCache
): Promise<CostLedgerRead> => {
  // An absent cost.jsonl is a legal fresh-adopter state, not an error.
  if (!existsSync(filePath)) {
    return {readFailure: null, result: EMPTY_COST_RESULT, scanned: false};
  }

  try {
    return {
      readFailure: null,
      result: await cache.get(filePath, parseCostLedger),
      scanned: true,
    };
  } catch (error) {
    return {
      readFailure: `${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      result: EMPTY_COST_RESULT,
      scanned: true,
    };
  }
};

type LedgerRead = {
  result: LedgerReadResult;
  scanned: boolean;
};

const readLedgerFile = async (
  filePath: string,
  cache: FileCache,
  read: (filePath: string, cache: FileCache) => Promise<LedgerReadResult>
): Promise<LedgerRead> => {
  if (!existsSync(filePath)) {
    return {result: {entries: [], errors: []}, scanned: false};
  }

  return {result: await read(filePath, cache), scanned: true};
};

/**
 * The upstream `rate_table_id` recipe (SPEC section 11, U5): sha256 of the
 * committed file's raw bytes, first 16 hex, `sha256:`-prefixed.
 */
const computeRateTableId = (filePath: string): null | string => {
  try {
    return `sha256:${createHash('sha256')
      .update(readFileSync(filePath))
      .digest('hex')
      .slice(0, 16)}`;
  } catch {
    return null;
  }
};

type ParseHealthInput = {
  costRead: CostLedgerRead;
  planRead: LedgerRead;
  specRead: LedgerRead;
};

/**
 * Compose W7's cost-side slice (SPEC section 6.8) with the one state its
 * inputs cannot express: a cost.jsonl that exists but failed to stream at
 * all, which counts as one scanned, unparseable file plus a note.
 */
const composeParseHealth = ({
  costRead,
  planRead,
  specRead,
}: ParseHealthInput): ParseHealthSlice => {
  const slice = buildCostParseHealth({
    costLedger:
      costRead.scanned && costRead.readFailure === null ?
        costRead.result.health
      : undefined,
    planLedger: planRead.scanned ? planRead.result : undefined,
    specLedger: specRead.scanned ? specRead.result : undefined,
  });

  if (costRead.readFailure !== null) {
    // The builder emits the cost.jsonl counter first.
    slice.counters[0].filesScanned = 1;
    slice.counters[0].filesUnparseable = 1;
    slice.notes.unshift(costRead.readFailure);
  }

  return slice;
};

/**
 * W7's join answers "does this session id have a transcript file?" per linked
 * group; a session linked from several groups has a log when any lookup found
 * one. `buildCostEntries` resolves by session id alone, hence the fold.
 */
const buildLogFoundResolver = (
  join: AttributionJoin
): ((sessionId: string) => boolean) => {
  const logFoundBySessionId = new Map<string, boolean>();

  for (const linked of [...join.linkedSessionsByEntryKey.values()].flat()) {
    logFoundBySessionId.set(
      linked.sessionId,
      (logFoundBySessionId.get(linked.sessionId) ?? false) || linked.logFound
    );
  }

  return (sessionId) => logFoundBySessionId.get(sessionId) ?? false;
};

export const getCosts = async (
  context: HandlerContext
): Promise<CostsResponse> => {
  const {cache, config} = context;
  const localDirectory = path.join(config.projectRoot, '.gaia', 'local');
  const ratesPath = path.join(
    config.projectRoot,
    '.gaia',
    'scripts',
    'token-rates.json'
  );

  const rateTableLoad = loadRateTable(cache, ratesPath);

  // Four independent reads (different files, different cache keys): run
  // together rather than one after another (the cache's own doc comment
  // anticipates concurrent gets sharing one read per path).
  const [costRead, specRead, planRead, discoveredDirectories] =
    await Promise.all([
      readCostLedgerFile(
        path.join(localDirectory, 'telemetry', 'cost.jsonl'),
        cache
      ),
      readLedgerFile(
        path.join(localDirectory, 'specs', 'ledger.json'),
        cache,
        readSpecLedger
      ),
      readLedgerFile(
        path.join(localDirectory, 'plans', 'ledger.json'),
        cache,
        readPlanLedger
      ),
      discoverProjectDirectories(
        path.join(config.claudeConfigDir, 'projects'),
        config.projectRoot,
        cache
      ),
    ]);
  const join = joinCostGroupsToSessions(costRead.result.groups, {
    claudeConfigDir: config.claudeConfigDir,
    discoveredDirectories,
  });

  const {costSince, entries, recordedDollars} = buildCostEntries({
    costGroups: costRead.result.groups,
    planLedgerEntries: planRead.result.entries,
    resolveSessionLogFound: buildLogFoundResolver(join),
    specLedgerEntries: specRead.result.entries,
  });

  const slugPlanCount = entries.filter(
    (entry) => entry.entryType === 'plan-slug'
  ).length;
  const mergedSpecCount = specRead.result.entries.filter(
    (entry) => entry.status === 'merged'
  ).length;

  return costsResponseSchema.parse({
    coverage: {costSince},
    entries,
    kpis: {
      // Pre-ledger slug plans count toward the plans KPI (SPEC section 4.5).
      plans: {total: planRead.result.entries.length + slugPlanCount},
      recordedDollars,
      specs: {
        merged: mergedSpecCount,
        total: specRead.result.entries.length,
      },
    },
    parseHealth: composeParseHealth({costRead, planRead, specRead}),
    project: {
      claudeConfigDir: config.claudeConfigDir,
      name: config.projectName,
      root: config.projectRoot,
    },
    rateTable: {
      id: rateTableLoad.status === 'ok' ? computeRateTableId(ratesPath) : null,
      status: rateTableLoad.status,
    },
  } satisfies CostsResponse);
};
