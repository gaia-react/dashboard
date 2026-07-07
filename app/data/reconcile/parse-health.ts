import type {CostLedgerHealth} from '~/data/parse/cost-ledger';
import type {LineError} from '~/data/parse/jsonl-stream';
import type {LedgerReadResult} from '~/data/parse/ledgers';
import type {ScanCounters} from '~/data/parse/session-scan';
import type {ParseHealthCounter, ParseHealthSlice} from '~/data/schemas/api';

/**
 * Parse-health slices (SPEC section 6.8): skip/unknown counters per input
 * source, shaped as the ParseHealthSlice from schemas/api.ts. The costs
 * handler builds the cost-side slice, the activity handler the session-side
 * one; the client footer merges the two.
 */

/** Spec ledger status vocabulary (SPEC section 4.2); others are unknown. */
const KNOWN_SPEC_STATUSES = new Set(['draft', 'merged', 'specified']);

/** Plan ledger status vocabulary (SPEC-024); others are unknown. */
const KNOWN_PLAN_STATUSES = new Set(['abandoned', 'allocated', 'completed']);

export type CostParseHealthInput = {
  /** undefined = cost.jsonl absent, a legal empty state (never an error). */
  costLedger?: CostLedgerHealth;
  /** undefined = plans/ledger.json absent. */
  planLedger?: LedgerReadResult;
  /** undefined = specs/ledger.json absent. */
  specLedger?: LedgerReadResult;
};

const costLedgerCounter = (
  health: CostLedgerHealth | undefined
): ParseHealthCounter => {
  const linesSkipped =
    health ?
      health.lineErrors.length +
      health.invalidRows.length +
      health.unsupportedSchemaVersions.length
    : 0;
  const linesRead = health?.linesRead ?? 0;

  return {
    filesScanned: health ? 1 : 0,
    filesUnparseable: linesRead > 0 && linesSkipped === linesRead ? 1 : 0,
    linesRead,
    linesSkipped,
    source: 'cost.jsonl',
  };
};

/** Ledgers are single JSON documents, so line counters stay zero; a read that
 * yielded nothing counts as one unparseable file. */
const ledgerCounter = (
  source: string,
  result: LedgerReadResult | undefined
): ParseHealthCounter => ({
  filesScanned: result ? 1 : 0,
  filesUnparseable: result && result.errors.length > 0 ? 1 : 0,
  linesRead: 0,
  linesSkipped: 0,
  source,
});

const collectUnknownStatuses = (
  into: string[],
  result: LedgerReadResult | undefined,
  knownStatuses: Set<string>
): void => {
  for (const entry of result?.entries ?? []) {
    if (
      entry.status !== null &&
      !knownStatuses.has(entry.status) &&
      !into.includes(entry.status)
    ) {
      into.push(entry.status);
    }
  }
};

const costLedgerNotes = (health: CostLedgerHealth | undefined): string[] => {
  if (!health) {
    return [];
  }

  return [
    ...health.nativeBackfillCollisions.map(
      (key) =>
        `cost.jsonl: native row overrides backfill for group ${key} (backfill is idempotent, so this is an upstream bug)`
    ),
    ...health.unsupportedSchemaVersions.map(
      ({lineNumber, schemaVersion}) =>
        `cost.jsonl line ${lineNumber}: unsupported schema_version ${schemaVersion}`
    ),
  ];
};

/**
 * Cost-side slice for `/api/costs`: cost.jsonl stream/schema skips, ledger
 * read failures, unknown `kind` and `status` values, and upstream anomalies
 * (native-over-backfill collisions, unsupported schema versions) as notes.
 */
export const buildCostParseHealth = (
  input: CostParseHealthInput
): ParseHealthSlice => {
  const unknownStatuses: string[] = [];

  collectUnknownStatuses(
    unknownStatuses,
    input.specLedger,
    KNOWN_SPEC_STATUSES
  );
  collectUnknownStatuses(
    unknownStatuses,
    input.planLedger,
    KNOWN_PLAN_STATUSES
  );

  return {
    counters: [
      costLedgerCounter(input.costLedger),
      ledgerCounter('specs/ledger.json', input.specLedger),
      ledgerCounter('plans/ledger.json', input.planLedger),
    ],
    notes: [
      ...costLedgerNotes(input.costLedger),
      ...(input.specLedger?.errors ?? []),
      ...(input.planLedger?.errors ?? []),
    ],
    unknownKinds: [...(input.costLedger?.unknownKinds ?? [])],
    unknownStatuses,
  };
};

export type SessionParseHealthInput = {
  /** Transcript files scanned (main + subagent). */
  fileCount: number;
  scans: SessionScanHealth[];
};

/** The health-relevant part of one session's scan (see SessionScan). */
export type SessionScanHealth = {
  counters: ScanCounters;
  errors: LineError[];
  turnCount: number;
};

/**
 * Session-side slice for `/api/activity`. The scanner does not track raw line
 * totals (transcript metadata lines are skipped by design), so `linesRead`
 * counts the lines the scan considered: included messages plus excluded and
 * malformed lines. `linesSkipped` is malformed JSON plus assistant lines
 * without readable usage; `<synthetic>` exclusions are by-design filtering,
 * not skips. Session logs have no `kind`/`status` vocabulary, so the unknown
 * arrays stay empty on this side.
 */
export const buildSessionParseHealth = (
  input: SessionParseHealthInput
): ParseHealthSlice => {
  let linesRead = 0;
  let linesSkipped = 0;

  for (const scan of input.scans) {
    linesRead +=
      scan.turnCount +
      scan.counters.syntheticExcluded +
      scan.counters.usageMissingExcluded +
      scan.errors.length;
    linesSkipped += scan.errors.length + scan.counters.usageMissingExcluded;
  }

  return {
    counters: [
      {
        filesScanned: input.fileCount,
        filesUnparseable: 0,
        linesRead,
        linesSkipped,
        source: 'session-logs',
      },
    ],
    notes: [],
    unknownKinds: [],
    unknownStatuses: [],
  };
};
