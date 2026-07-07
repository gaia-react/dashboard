import type {LineError} from '~/data/parse/jsonl-stream';
import {streamJsonl} from '~/data/parse/jsonl-stream';
import type {CostRecord} from '~/data/schemas/cost-record';
import {
  costRecordSchema,
  SUPPORTED_SCHEMA_VERSION,
} from '~/data/schemas/cost-record';

/**
 * cost.jsonl reader (SPEC sections 4.1 and 5): streams the ledger, groups rows
 * by (attribution key, kind, session_id), and reduces each group to its
 * terminal row. Rows are CUMULATIVE snapshots, so a group's cost is its
 * terminal row, never a sum across rows.
 */

/** How a group is attributed. spec_id and plan_id are never both set. */
export type CostAttribution =
  | {id: string; type: 'plan'}
  | {id: string; type: 'spec'}
  /** Both-null backfill row with a plan_slug: a pre-ledger archived plan. */
  | {slug: string; type: 'plan-slug'}
  /** Both-null otherwise: legal degraded telemetry, kept, never dropped. */
  | {type: 'unattributed'};

/** One (attribution, kind, session) group reduced to its terminal row. */
export type CostGroup = {
  attribution: CostAttribution;
  kind: string;
  /** Rows folded into this group (native path; backfill groups are 1). */
  rowCount: number;
  sessionId: string;
  source: 'backfill' | 'native';
  /**
   * The final:true row when one exists (preferred regardless of seq, since
   * the append-time final-flag rewrite is best-effort), else the max-seq row.
   */
  terminalRow: CostRecord;
};

/** Parse-health counters surfaced in the SPEC section 6.8 footer. */
export type CostLedgerHealth = {
  /** Rows that JSON-parsed but failed the cost-record schema. */
  invalidRows: {lineNumber: number; message: string}[];
  /** Lines that were not valid JSON (from the streaming reader). */
  lineErrors: LineError[];
  linesRead: number;
  /**
   * Group keys where a native row collided with a backfill row. The backfill
   * is idempotent, so this is an upstream bug; native wins.
   */
  nativeBackfillCollisions: string[];
  /** kind values outside the known spec | plan | execute set, verbatim, in first-seen order. */
  unknownKinds: string[];
  /** Rows rejected because their schema_version is not supported. */
  unsupportedSchemaVersions: {lineNumber: number; schemaVersion: number}[];
};

export type CostLedgerResult = {
  groups: CostGroup[];
  health: CostLedgerHealth;
};

const KNOWN_KINDS = new Set(['execute', 'plan', 'spec']);

const isBackfill = (row: CostRecord): boolean => row.source === 'backfill';

const deriveAttribution = (row: CostRecord): CostAttribution => {
  if (row.spec_id) {
    return {id: row.spec_id, type: 'spec'};
  }

  if (row.plan_id) {
    return {id: row.plan_id, type: 'plan'};
  }

  if (isBackfill(row) && row.plan_slug) {
    return {slug: row.plan_slug, type: 'plan-slug'};
  }

  return {type: 'unattributed'};
};

const attributionKey = (attribution: CostAttribution): string => {
  if (attribution.type === 'spec' || attribution.type === 'plan') {
    return `${attribution.type}:${attribution.id}`;
  }

  if (attribution.type === 'plan-slug') {
    return `plan-slug:${attribution.slug}`;
  }

  return 'unattributed';
};

/** final:true wins regardless of seq; ties and fallback resolve by max seq. */
const selectTerminalRow = (rows: CostRecord[]): CostRecord => {
  const finalRows = rows.filter((row) => row.final);
  const candidates = finalRows.length > 0 ? finalRows : rows;
  let terminal = candidates[0];

  for (const row of candidates) {
    if (row.seq > terminal.seq) {
      terminal = row;
    }
  }

  return terminal;
};

type PendingGroup = {
  attribution: CostAttribution;
  backfillRows: CostRecord[];
  kind: string;
  nativeRows: CostRecord[];
  sessionId: string;
};

const readSchemaVersion = (record: unknown): number | undefined => {
  if (typeof record === 'object' && record !== null) {
    const version = (record as {schema_version?: unknown}).schema_version;

    if (typeof version === 'number') {
      return version;
    }
  }

  return undefined;
};

/**
 * Stream a cost.jsonl file into terminal-row-per-group records ready for
 * aggregation. Never throws on bad content: malformed lines, invalid rows,
 * and unsupported schema versions are counted in `health` and skipped.
 *
 * Deliberately takes no FileCache, unlike the sibling readers (ledgers.ts,
 * rates.ts): its `(path) => Promise<CostLedgerResult>` shape is exactly the
 * `FileCache.get` compute contract, so call sites memoize with
 * `cache.get(path, parseCostLedger)` (both handlers do, sharing one parse of
 * cost.jsonl per server cache). The siblings embed the cache because they
 * also normalize read errors into their result shapes.
 */
export const parseCostLedger = async (
  path: string
): Promise<CostLedgerResult> => {
  const pending = new Map<string, PendingGroup>();
  const invalidRows: CostLedgerHealth['invalidRows'] = [];
  const unsupportedSchemaVersions: CostLedgerHealth['unsupportedSchemaVersions'] =
    [];
  const unknownKinds = new Set<string>();

  const streamResult = await streamJsonl(path, (record, lineNumber) => {
    const parsed = costRecordSchema.safeParse(record);

    if (!parsed.success) {
      const version = readSchemaVersion(record);

      if (version !== undefined && version !== SUPPORTED_SCHEMA_VERSION) {
        unsupportedSchemaVersions.push({lineNumber, schemaVersion: version});
      } else {
        invalidRows.push({lineNumber, message: parsed.error.message});
      }

      return;
    }

    const row = parsed.data;

    if (!KNOWN_KINDS.has(row.kind)) {
      unknownKinds.add(row.kind);
    }

    const attribution = deriveAttribution(row);
    const key = `${attributionKey(attribution)}|${row.kind}|${row.session_id}`;
    const group = pending.get(key) ?? {
      attribution,
      backfillRows: [],
      kind: row.kind,
      nativeRows: [],
      sessionId: row.session_id,
    };

    if (isBackfill(row)) {
      group.backfillRows.push(row);
    } else {
      group.nativeRows.push(row);
    }

    pending.set(key, group);
  });

  const groups: CostGroup[] = [];
  const nativeBackfillCollisions: string[] = [];

  for (const [key, group] of pending) {
    const hasNative = group.nativeRows.length > 0;

    if (hasNative && group.backfillRows.length > 0) {
      nativeBackfillCollisions.push(key);
    }

    // Native rows win a collision (backfill is idempotent; SPEC section 4.1).
    const rows = hasNative ? group.nativeRows : group.backfillRows;

    groups.push({
      attribution: group.attribution,
      kind: group.kind,
      rowCount: rows.length,
      sessionId: group.sessionId,
      source: hasNative ? 'native' : 'backfill',
      terminalRow: selectTerminalRow(rows),
    });
  }

  return {
    groups,
    health: {
      invalidRows,
      lineErrors: streamResult.errors,
      linesRead: streamResult.linesRead,
      nativeBackfillCollisions,
      unknownKinds: [...unknownKinds],
      unsupportedSchemaVersions,
    },
  };
};
