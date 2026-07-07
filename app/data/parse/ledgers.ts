import {readFile} from 'node:fs/promises';
import type {FileCache} from '~/data/cache';
import type {PlanLedgerEntry, SpecLedgerEntry} from '~/data/schemas/ledgers';
import {planLedgerSchema, specLedgerSchema} from '~/data/schemas/ledgers';

export type LedgerReadResult = {
  entries: NormalizedLedgerEntry[];
  /** Problems that degraded the read (missing file, bad JSON, contract drift). */
  errors: string[];
};

/**
 * A specs/plans ledger row normalized for aggregation (SPEC section 4.2).
 * `status` and `source` pass through verbatim, including unknown values;
 * `null` marks fields the row does not carry (old plan shape, unmerged spec).
 * `completedAt` is `merged_at` for specs and `completed_at` for plans.
 */
export type NormalizedLedgerEntry = {
  allocatedAt: null | string;
  completedAt: null | string;
  id: string;
  source: null | string;
  status: null | string;
  title: string;
};

const failure = (message: string): LedgerReadResult => ({
  entries: [],
  errors: [message],
});

/** Bound on a normalized title, ellipsis included (defensive rendering cap). */
const TITLE_MAX_LENGTH = 140;

const ELLIPSIS = '…';

/**
 * The SPEC-024 title repair is best-effort by contract, so normalize
 * defensively (SPEC section 4.2): an empty/missing title falls back to the
 * entry id, and an over-long one becomes a word-boundary-safe bounded prefix
 * ending in an ellipsis.
 */
const normalizeTitle = (raw: string | undefined, fallback: string): string => {
  const trimmed = raw?.trim() ?? '';

  if (trimmed === '') {
    return fallback;
  }

  if (trimmed.length <= TITLE_MAX_LENGTH) {
    return trimmed;
  }

  const slice = trimmed.slice(0, TITLE_MAX_LENGTH - ELLIPSIS.length);
  const lastSpaceIndex = slice.lastIndexOf(' ');
  const prefix = lastSpaceIndex > 0 ? slice.slice(0, lastSpaceIndex) : slice;

  return `${prefix.trimEnd()}${ELLIPSIS}`;
};

const normalizeSpecEntry = (entry: SpecLedgerEntry): NormalizedLedgerEntry => ({
  allocatedAt: entry.allocated_at ?? null,
  completedAt: entry.merged_at ?? null,
  id: entry.id,
  source: entry.source ?? null,
  status: entry.status ?? null,
  title: normalizeTitle(entry.intent, entry.id),
});

const normalizePlanEntry = (entry: PlanLedgerEntry): NormalizedLedgerEntry => ({
  allocatedAt: entry.allocated_at ?? null,
  completedAt: entry.completed_at ?? null,
  id: entry.id,
  source: entry.source ?? null,
  status: entry.status ?? null,
  title: normalizeTitle(entry.subject, entry.id),
});

const parseSpecLedgerFile = async (path: string): Promise<LedgerReadResult> => {
  const raw = await readFile(path, 'utf8');
  const parsed = specLedgerSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    return failure(
      `${path}: specs ledger failed validation: ${parsed.error.message}`
    );
  }

  return {entries: parsed.data.specs.map(normalizeSpecEntry), errors: []};
};

const parsePlanLedgerFile = async (path: string): Promise<LedgerReadResult> => {
  const raw = await readFile(path, 'utf8');
  const parsed = planLedgerSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    return failure(
      `${path}: plans ledger failed validation: ${parsed.error.message}`
    );
  }

  return {entries: parsed.data.plans.map(normalizePlanEntry), errors: []};
};

const readLedger = async (
  path: string,
  cache: FileCache,
  parseFile: (path: string) => Promise<LedgerReadResult>
): Promise<LedgerReadResult> => {
  try {
    return await cache.get(path, parseFile);
  } catch (error) {
    return failure(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Read + validate `specs/ledger.json`, returning normalized entries in ledger
 * order (ID gaps are normal; nothing is synthesized). Never throws on missing
 * or malformed content: the problem is surfaced in `errors` instead.
 */
export const readSpecLedger = async (
  path: string,
  cache: FileCache
): Promise<LedgerReadResult> => readLedger(path, cache, parseSpecLedgerFile);

/**
 * Read + validate `plans/ledger.json` in either shape: post-SPEC-024 rows
 * carry `status`/`completed_at`, old rows do not (both normalize to `null`).
 * Same degrade-never-throw contract as `readSpecLedger`.
 */
export const readPlanLedger = async (
  path: string,
  cache: FileCache
): Promise<LedgerReadResult> => readLedger(path, cache, parsePlanLedgerFile);
