import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import type {FileCache} from '../cache';
import type {AssistantUsage} from '../schemas/session-lines';
import {
  aiTitleLineSchema,
  assistantLineSchema,
  lastPromptLineSchema,
} from '../schemas/session-lines';
import {sortAlphabetically} from '../sort';
import type {LineError} from './jsonl-stream';
import {streamJsonl} from './jsonl-stream';

/** Hourly-UTC buckets: hour-start ISO timestamp -> model -> totals.
 * Timezone-independent; handlers fold hours into local days (PLAN D4). */
export type HourlyBuckets = Record<string, Record<string, TokenBuckets>>;

/** Exclusion counters surfaced to parse health (SPEC section 6.8). */
export type ScanCounters = {
  syntheticExcluded: number;
  usageMissingExcluded: number;
};

/** Cached per-file parse result (one transcript file, main or subagent). */
export type SessionFileScan = {
  aiTitle: string | undefined;
  byModel: Record<string, TokenBuckets>;
  counters: ScanCounters;
  errors: LineError[];
  /** First string `cwd` field in the file's records, any line type; consumed
   * by discovery confirmation so it shares this cache entry per path. */
  firstCwd: string | undefined;
  firstTimestamp: string | undefined;
  gitBranch: string | undefined;
  hourlyUtc: HourlyBuckets;
  lastPrompt: string | undefined;
  lastTimestamp: string | undefined;
  /** Distinct included `message.id` count after dedupe and exclusions. */
  messageCount: number;
};

/** Session-level aggregation: main transcript + subagent transcripts. */
export type SessionScan = {
  byModel: Record<string, TokenBuckets>;
  counters: ScanCounters;
  durationSeconds: number | undefined;
  endedAt: string | undefined;
  errors: LineError[];
  gitBranch: string | undefined;
  hourlyUtc: HourlyBuckets;
  models: string[];
  sessionId: string;
  startedAt: string | undefined;
  title: string;
  turnCount: number;
};

/** Token buckets in GAIA's vocabulary (SPEC section 4.4 bucket mapping). */
export type TokenBuckets = {
  cacheRead: number;
  /** Total cache write (authoritative); the 5m/1h split can undercount when
   * `usage.cache_creation` is absent on old lines. */
  cacheWrite: number;
  cacheWrite1h: number;
  cacheWrite5m: number;
  freshInput: number;
  output: number;
};

const TITLE_MAX_LENGTH = 80;
const ELLIPSIS = '…';
const SYNTHETIC_MODEL = '<synthetic>';
const UNKNOWN_MODEL = 'unknown';
const MILLISECONDS_PER_HOUR = 3_600_000;

const emptyBuckets = (): TokenBuckets => ({
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  cacheWrite5m: 0,
  freshInput: 0,
  output: 0,
});

/** SPEC section 4.4 bucket mapping from Anthropic usage fields. */
const toBuckets = (usage: AssistantUsage): TokenBuckets => ({
  cacheRead: usage.cache_read_input_tokens ?? 0,
  cacheWrite: usage.cache_creation_input_tokens ?? 0,
  cacheWrite1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
  cacheWrite5m: usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
  freshInput: usage.input_tokens ?? 0,
  output: usage.output_tokens ?? 0,
});

const addBuckets = (target: TokenBuckets, source: TokenBuckets): void => {
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.cacheWrite1h += source.cacheWrite1h;
  target.cacheWrite5m += source.cacheWrite5m;
  target.freshInput += source.freshInput;
  target.output += source.output;
};

const bucketInto = (
  byModel: Record<string, TokenBuckets>,
  model: string,
  buckets: TokenBuckets
): void => {
  byModel[model] ??= emptyBuckets();
  addBuckets(byModel[model], buckets);
};

/** UTC hour-start ISO key for a parseable timestamp, else undefined. */
const toHourKey = (timestamp: string | undefined): string | undefined => {
  if (timestamp === undefined) {
    return undefined;
  }

  const milliseconds = Date.parse(timestamp);

  if (Number.isNaN(milliseconds)) {
    return undefined;
  }

  return new Date(
    Math.floor(milliseconds / MILLISECONDS_PER_HOUR) * MILLISECONDS_PER_HOUR
  ).toISOString();
};

type IncludedMessage = {
  buckets: TokenBuckets;
  model: string;
  timestamp: string | undefined;
};

const lineType = (record: unknown): string | undefined => {
  if (typeof record === 'object' && !!record) {
    const {type} = record as {type?: unknown};

    if (typeof type === 'string') {
      return type;
    }
  }

  return undefined;
};

/**
 * Parse one transcript file (main or subagent): dedupe by `message.id` with
 * last-seen usage winning, exclude `<synthetic>` and usage-less lines, and
 * fold the surviving messages into per-model and hourly-UTC bucket totals
 * (SPEC section 4.4 extraction rules).
 */
type FileScanState = {
  aiTitle: string | undefined;
  counters: ScanCounters;
  firstCwd: string | undefined;
  gitBranch: string | undefined;
  /** Insertion-ordered; setting an existing id again keeps one entry per id
   * while the value (usage) is replaced, so the LAST occurrence wins even
   * when its usage is smaller than an earlier one. */
  includedMessages: Map<string, IncludedMessage>;
  lastPrompt: string | undefined;
};

const recordAssistantLine = (
  record: unknown,
  lineNumber: number,
  state: FileScanState
): void => {
  const outcome = assistantLineSchema.safeParse(record);

  if (!outcome.success) {
    // An assistant line the schema cannot read carries no countable usage;
    // treat it like a usage-less line for parse health.
    state.counters.usageMissingExcluded += 1;

    return;
  }

  const line = outcome.data;

  if (line.gitBranch) {
    state.gitBranch = line.gitBranch;
  }

  if (line.message.model === SYNTHETIC_MODEL) {
    state.counters.syntheticExcluded += 1;
  } else if (line.message.usage === undefined) {
    state.counters.usageMissingExcluded += 1;
  } else {
    state.includedMessages.set(line.message.id ?? `line-${lineNumber}`, {
      buckets: toBuckets(line.message.usage),
      model: line.message.model ?? UNKNOWN_MODEL,
      timestamp: line.timestamp,
    });
  }
};

export const scanSessionFile = async (
  filePath: string
): Promise<SessionFileScan> => {
  const state: FileScanState = {
    aiTitle: undefined,
    counters: {syntheticExcluded: 0, usageMissingExcluded: 0},
    firstCwd: undefined,
    gitBranch: undefined,
    includedMessages: new Map<string, IncludedMessage>(),
    lastPrompt: undefined,
  };

  const streamResult = await streamJsonl(filePath, (record, lineNumber) => {
    if (state.firstCwd === undefined && typeof record === 'object' && record) {
      const {cwd} = record as {cwd?: unknown};

      if (typeof cwd === 'string') {
        state.firstCwd = cwd;
      }
    }

    const type = lineType(record);

    if (type === 'ai-title') {
      const outcome = aiTitleLineSchema.safeParse(record);

      if (outcome.success) {
        state.aiTitle = outcome.data.aiTitle;
      }
    } else if (type === 'last-prompt') {
      const outcome = lastPromptLineSchema.safeParse(record);

      if (outcome.success) {
        state.lastPrompt = outcome.data.lastPrompt;
      }
    } else if (type === 'assistant') {
      recordAssistantLine(record, lineNumber, state);
    }
  });

  const byModel: Record<string, TokenBuckets> = {};
  const hourlyUtc: HourlyBuckets = {};
  let firstMilliseconds = Number.POSITIVE_INFINITY;
  let lastMilliseconds = Number.NEGATIVE_INFINITY;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;

  for (const {buckets, model, timestamp} of state.includedMessages.values()) {
    bucketInto(byModel, model, buckets);

    const hourKey = toHourKey(timestamp);

    if (hourKey !== undefined && timestamp !== undefined) {
      hourlyUtc[hourKey] ??= {};
      bucketInto(hourlyUtc[hourKey], model, buckets);

      const milliseconds = Date.parse(timestamp);

      if (milliseconds < firstMilliseconds) {
        firstMilliseconds = milliseconds;
        firstTimestamp = timestamp;
      }

      if (milliseconds > lastMilliseconds) {
        lastMilliseconds = milliseconds;
        lastTimestamp = timestamp;
      }
    }
  }

  return {
    aiTitle: state.aiTitle,
    byModel,
    counters: state.counters,
    errors: streamResult.errors,
    firstCwd: state.firstCwd,
    firstTimestamp,
    gitBranch: state.gitBranch,
    hourlyUtc,
    lastPrompt: state.lastPrompt,
    lastTimestamp,
    messageCount: state.includedMessages.size,
  };
};

const truncateTitle = (text: string): string =>
  text.length > TITLE_MAX_LENGTH ?
    `${text.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}${ELLIPSIS}`
  : text;

/** Title precedence: ai-title (last wins) -> last-prompt (truncated) -> uuid. */
const deriveTitle = (mainScan: SessionFileScan, sessionId: string): string => {
  if (mainScan.aiTitle !== undefined) {
    return mainScan.aiTitle;
  }

  if (mainScan.lastPrompt !== undefined) {
    return truncateTitle(mainScan.lastPrompt);
  }

  return sessionId;
};

const listSubagentFiles = (
  projectDirectory: string,
  sessionId: string
): string[] => {
  const subagentsDirectory = path.join(
    projectDirectory,
    sessionId,
    'subagents'
  );

  if (!existsSync(subagentsDirectory)) {
    return [];
  }

  return sortAlphabetically(
    readdirSync(subagentsDirectory, {withFileTypes: true})
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith('agent-') &&
          entry.name.endsWith('.jsonl')
      )
      .map((entry) => path.join(subagentsDirectory, entry.name))
  );
};

const earlier = (
  a: string | undefined,
  b: string | undefined
): string | undefined => {
  if (a === undefined) {
    return b;
  }

  if (b === undefined) {
    return a;
  }

  return Date.parse(a) <= Date.parse(b) ? a : b;
};

const later = (
  a: string | undefined,
  b: string | undefined
): string | undefined => {
  if (a === undefined) {
    return b;
  }

  if (b === undefined) {
    return a;
  }

  return Date.parse(a) >= Date.parse(b) ? a : b;
};

/**
 * Scan one session: the main `<sessionId>.jsonl` transcript plus any
 * `<sessionId>/subagents/agent-*.jsonl` files, all attributed to the parent
 * session id (SPEC section 4.4). Per-file parses go through the cache, so a
 * warm refresh re-reads only files whose (mtime, size) changed. Title and
 * gitBranch come from the main transcript; token totals, hourly buckets,
 * span, and turn count include subagent activity.
 */
export const scanSession = async (
  projectDirectory: string,
  sessionId: string,
  cache: FileCache
): Promise<SessionScan> => {
  const mainPath = path.join(projectDirectory, `${sessionId}.jsonl`);
  const filePaths = [
    mainPath,
    ...listSubagentFiles(projectDirectory, sessionId),
  ];
  const fileScans = await Promise.all(
    filePaths.map(async (filePath) => cache.get(filePath, scanSessionFile))
  );
  const [mainScan] = fileScans;

  const byModel: Record<string, TokenBuckets> = {};
  const hourlyUtc: HourlyBuckets = {};
  const counters: ScanCounters = {
    syntheticExcluded: 0,
    usageMissingExcluded: 0,
  };
  const errors: LineError[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let turnCount = 0;

  for (const fileScan of fileScans) {
    for (const [model, buckets] of Object.entries(fileScan.byModel)) {
      bucketInto(byModel, model, buckets);
    }

    for (const [hourKey, models] of Object.entries(fileScan.hourlyUtc)) {
      hourlyUtc[hourKey] ??= {};

      for (const [model, buckets] of Object.entries(models)) {
        bucketInto(hourlyUtc[hourKey], model, buckets);
      }
    }

    counters.syntheticExcluded += fileScan.counters.syntheticExcluded;
    counters.usageMissingExcluded += fileScan.counters.usageMissingExcluded;
    errors.push(...fileScan.errors);
    turnCount += fileScan.messageCount;
    startedAt = earlier(startedAt, fileScan.firstTimestamp);
    endedAt = later(endedAt, fileScan.lastTimestamp);
  }

  const durationSeconds =
    startedAt !== undefined && endedAt !== undefined ?
      Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)
    : undefined;

  return {
    byModel,
    counters,
    durationSeconds,
    endedAt,
    errors,
    gitBranch: mainScan.gitBranch,
    hourlyUtc,
    models: sortAlphabetically(Object.keys(byModel)),
    sessionId,
    startedAt,
    title: deriveTitle(mainScan, sessionId),
    turnCount,
  };
};

/**
 * Scan every session in a confirmed project directory: each top-level
 * `<uuid>.jsonl` is a session; `<uuid>/tool-results/` and other non-jsonl
 * entries are ignored. Order follows the sorted file names; callers sort by
 * time as needed.
 */
export const scanProjectDirectory = async (
  projectDirectory: string,
  cache: FileCache
): Promise<SessionScan[]> => {
  const sessionIds = sortAlphabetically(
    readdirSync(projectDirectory, {withFileTypes: true})
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name.slice(0, -'.jsonl'.length))
  );

  return Promise.all(
    sessionIds.map(async (sessionId) =>
      scanSession(projectDirectory, sessionId, cache)
    )
  );
};
