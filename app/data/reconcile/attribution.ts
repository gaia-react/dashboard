import {existsSync} from 'node:fs';
import path from 'node:path';
import type {CostAttribution, CostGroup} from '~/data/parse/cost-ledger';
import {encodeSessionCwd} from '~/data/parse/discover';
import type {LinkedSession} from '~/data/schemas/api';

/**
 * Attribution join (SPEC section 5): connects cost.jsonl groups to session
 * logs by `session_id` and partitions sessions into attributed vs ad hoc.
 * A session is attributed when ANY tier-1 (native) or tier-2 (backfill)
 * record references it; unattributed telemetry rows (both ids null, no slug)
 * reference a session without attributing it to an entry.
 */

export type AttributionJoin = {
  /** session_id -> attributing entry; first reference in file order wins. */
  bySessionId: Map<string, EntryAttribution>;
  /** entry key -> linked-session rows for the cost table, in file order. */
  linkedSessionsByEntryKey: Map<string, LinkedSession[]>;
};

/** The entry a session is attributed to, in API vocabulary (schemas/api.ts). */
export type EntryAttribution = {
  entryType: 'plan' | 'plan-slug' | 'spec';
  key: string;
};

/** Where session transcripts can be looked up. */
export type SessionLogLocator = {
  /** Resolved `$CLAUDE_CONFIG_DIR` (contains `projects/`). */
  claudeConfigDir: string;
  /** Confirmed project directories from the discovery heuristic. */
  discoveredDirectories: string[];
};

type FindSessionLogOptions = SessionLogLocator & {
  /** The cost row's `session_cwd`; null/undefined means pre-SPEC-024 or backfill. */
  sessionCwd: null | string | undefined;
  sessionId: string;
};

/**
 * Locate a referenced session's transcript file (SPEC section 5). A non-null
 * `session_cwd` forward-encodes to the exact transcript directory (SPEC-024,
 * deterministic, no fallback); otherwise the confirmed directories from the
 * discovery heuristic are searched. `undefined` means the log was deleted or
 * pruned: the session still counts in spec cost, badged "log missing".
 */
export const findSessionLogPath = (
  options: FindSessionLogOptions
): string | undefined => {
  const fileName = `${options.sessionId}.jsonl`;

  if (typeof options.sessionCwd === 'string') {
    const candidate = path.join(
      options.claudeConfigDir,
      'projects',
      encodeSessionCwd(options.sessionCwd),
      fileName
    );

    return existsSync(candidate) ? candidate : undefined;
  }

  return options.discoveredDirectories
    .map((directory) => path.join(directory, fileName))
    .find((candidate) => existsSync(candidate));
};

/**
 * Map a cost-ledger attribution to the API entry reference. Keys match the
 * cost-table row keys (PLAN section 3): "SPEC-023" | "PLAN-001" | "slug:plan".
 * Unattributed telemetry has no entry, hence `undefined`.
 */
export const toEntryAttribution = (
  attribution: CostAttribution
): EntryAttribution | undefined => {
  if (attribution.type === 'spec' || attribution.type === 'plan') {
    return {entryType: attribution.type, key: attribution.id};
  }

  if (attribution.type === 'plan-slug') {
    return {entryType: 'plan-slug', key: `slug:${attribution.slug}`};
  }

  return undefined;
};

/**
 * Join cost groups to their sessions. Deterministic: groups arrive in ledger
 * file order (parseCostLedger preserves it), and the first entry referencing
 * a session wins its attribution badge.
 */
export const joinCostGroupsToSessions = (
  groups: CostGroup[],
  locator: SessionLogLocator
): AttributionJoin => {
  const bySessionId = new Map<string, EntryAttribution>();
  const linkedSessionsByEntryKey = new Map<string, LinkedSession[]>();

  for (const group of groups) {
    const attribution = toEntryAttribution(group.attribution);

    if (attribution) {
      if (!bySessionId.has(group.sessionId)) {
        bySessionId.set(group.sessionId, attribution);
      }

      const logFound =
        findSessionLogPath({
          ...locator,
          sessionCwd: group.terminalRow.session_cwd,
          sessionId: group.sessionId,
        }) !== undefined;
      const linked = linkedSessionsByEntryKey.get(attribution.key) ?? [];

      linked.push({kind: group.kind, logFound, sessionId: group.sessionId});
      linkedSessionsByEntryKey.set(attribution.key, linked);
    }
  }

  return {bySessionId, linkedSessionsByEntryKey};
};

/**
 * Split scanned sessions into attributed vs ad hoc using the join. The same
 * predicate (membership in `bySessionId`) backs the KPI counts, the sessions
 * list, and the cost-table detail links, keeping the partition consistent
 * across all three (SPEC section 9.2).
 */
export const partitionSessions = <T extends {sessionId: string}>(
  sessions: T[],
  join: AttributionJoin
): {adHoc: T[]; attributed: T[]} => {
  const attributed: T[] = [];
  const adHoc: T[] = [];

  for (const session of sessions) {
    if (join.bySessionId.has(session.sessionId)) {
      attributed.push(session);
    } else {
      adHoc.push(session);
    }
  }

  return {adHoc, attributed};
};
