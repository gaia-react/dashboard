import fs from 'node:fs';
import path from 'node:path';
import {
  getLegacyLiveSessionsDir,
  getLiveSessionsDir,
} from '../lib/impeccable-paths.mjs';

const COMPLETED_PHASES = new Set(['completed', 'discarded']);

export const createLiveSessionStore = ({
  cwd = process.cwd(),
  sessionId,
} = {}) => {
  const rootDir = getLiveSessionsDir(cwd);
  const legacyRootDir = getLegacyLiveSessionsDir(cwd);
  fs.mkdirSync(rootDir, {recursive: true});
  const snapshotCache = new Map();

  const loadCachedOrRebuild = (id) => {
    const cached = snapshotCache.get(id);
    if (cached) return cached;
    const journalPath = getReadableJournalPath(id);
    const rebuilt = rebuildSnapshotFromJournal(journalPath, id);
    snapshotCache.set(id, rebuilt);

    return rebuilt;
  };

  const getReadableJournalPath = (id) => {
    const primary = getJournalPath(rootDir, id);
    if (fs.existsSync(primary)) return primary;
    const legacy = getJournalPath(legacyRootDir, id);
    if (fs.existsSync(legacy)) return legacy;

    return primary;
  };

  return {
    appendEvent: (event) => {
      const normalized = normalizeEvent(event, sessionId);
      const journalPath = getJournalPath(rootDir, normalized.id);
      const snapshotPath = getSnapshotPath(rootDir, normalized.id);
      const legacyJournalPath = getJournalPath(legacyRootDir, normalized.id);

      if (!fs.existsSync(journalPath) && fs.existsSync(legacyJournalPath)) {
        fs.copyFileSync(legacyJournalPath, journalPath);
      }
      const prior = loadCachedOrRebuild(normalized.id);
      const seq = prior.nextSeq;
      const entry = {
        event: normalized,
        id: normalized.id,
        seq,
        ts: new Date().toISOString(),
        type: normalized.type,
      };
      fs.appendFileSync(journalPath, `${JSON.stringify(entry)}\n`);
      const next = applyEvent(prior.snapshot, entry, prior.diagnostics);
      snapshotCache.set(normalized.id, {
        diagnostics: next.diagnostics || [],
        nextSeq: seq + 1,
        snapshot: next,
      });
      writeSnapshot(snapshotPath, next);

      return next;
    },
    getSnapshot: (id = sessionId, options = {}) => {
      if (!id) throw new Error('session id required');
      const journalPath = getReadableJournalPath(id);
      const snapshotPath = getSnapshotPath(rootDir, id);
      const rebuilt = rebuildSnapshotFromJournal(journalPath, id);
      snapshotCache.set(id, rebuilt);
      writeSnapshot(snapshotPath, rebuilt.snapshot);
      if (
        !options.includeCompleted &&
        COMPLETED_PHASES.has(rebuilt.snapshot.phase)
      )
        return null;

      return rebuilt.snapshot;
    },
    legacyRootDir,
    listActiveSessions: () => {
      const ids = new Set();

      for (const dir of [legacyRootDir, rootDir]) {
        if (!fs.existsSync(dir)) continue;

        for (const name of fs.readdirSync(dir)) {
          if (name.endsWith('.jsonl')) ids.add(name.slice(0, -'.jsonl'.length));
        }
      }

      return [...ids]
        .sort()
        .map((id) => this.getSnapshot(id))
        .filter(Boolean);
    },
    rootDir,
  };
};

const normalizeEvent = (event, fallbackId) => {
  if (!event || typeof event !== 'object')
    throw new Error('event object required');
  const id = event.id || fallbackId;
  if (!id || typeof id !== 'string') throw new Error('event id required');
  if (!event.type || typeof event.type !== 'string')
    throw new Error('event type required');

  return {...event, id};
};

const getJournalPath = (rootDir, id) =>
  path.join(rootDir, `${safeSessionId(id)}.jsonl`);

const getSnapshotPath = (rootDir, id) =>
  path.join(rootDir, `${safeSessionId(id)}.snapshot.json`);

const safeSessionId = (id) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new Error(`invalid session id: ${id}`);

  return id;
};

const baseSnapshot = (id) => ({
  activeOwner: null,
  annotationArtifacts: [],
  arrivedVariants: 0,
  checkpointRevision: 0,
  deliveryLease: null,
  diagnostics: [],
  expectedVariants: 0,
  fallbackMode: null,
  id,
  pageUrl: null,
  paramValues: {},
  pendingEvent: null,
  pendingEventSeq: null,
  phase: 'new',
  previewFile: null,
  previewMode: null,
  sourceFile: null,
  sourceMarkers: {},
  updatedAt: null,
  visibleVariant: null,
});

const rebuildSnapshotFromJournal = (journalPath, id) => {
  let snapshot = baseSnapshot(id);
  const diagnostics = [];
  let nextSeq = 1;
  if (!fs.existsSync(journalPath)) return {diagnostics, nextSeq, snapshot};

  const lines = fs.readFileSync(journalPath, 'utf-8').split('\n');

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== 'object')
        throw new Error('entry is not object');
      if (Number.isInteger(entry.seq))
        nextSeq = Math.max(nextSeq, entry.seq + 1);
      snapshot = applyEvent(snapshot, entry);
    } catch (error) {
      diagnostics.push({
        error: 'journal_parse_failed',
        line: index + 1,
        message: error.message,
      });
    }
  }
  snapshot.diagnostics = [...snapshot.diagnostics, ...diagnostics];

  return {diagnostics, nextSeq, snapshot};
};

const applyEvent = (snapshot, entry, inheritedDiagnostics = []) => {
  const event = entry.event || entry;
  const next = {
    ...snapshot,
    annotationArtifacts: [...(snapshot.annotationArtifacts || [])],
    diagnostics: [...(snapshot.diagnostics || [])],
    paramValues: {...snapshot.paramValues},
    sourceMarkers: {...snapshot.sourceMarkers},
    updatedAt: entry.ts || new Date().toISOString(),
  };

  if (inheritedDiagnostics.length > 0 && next.diagnostics.length === 0) {
    next.diagnostics = [...inheritedDiagnostics];
  }

  switch (event.type) {
    case 'accept':

    case 'accept_intent': {
      next.phase = 'accept_requested';
      next.visibleVariant = Number(event.variantId ?? next.visibleVariant);
      if (event.paramValues) next.paramValues = {...event.paramValues};
      next.pendingEventSeq = entry.seq ?? next.pendingEventSeq;
      next.pendingEvent = toPendingEvent(event);
      break;
    }
    case 'agent_done':

    case 'variants_ready': {
      next.phase =
        event.carbonize === true ? 'carbonize_required' : 'variants_ready';
      next.sourceFile = event.sourceFile ?? event.file ?? next.sourceFile;
      next.previewFile = event.previewFile ?? next.previewFile;
      next.previewMode = event.previewMode ?? next.previewMode;
      next.arrivedVariants =
        event.arrivedVariants ??
        (next.expectedVariants || next.arrivedVariants || 0);
      next.pendingEventSeq = null;
      next.pendingEvent = null;

      if (event.carbonize === true) {
        next.diagnostics.push({
          error: 'carbonize_cleanup_required',
          file: event.file || null,
          message:
            'Accepted variant still has carbonize markers that must be folded into source CSS.',
        });
      }
      break;
    }

    case 'agent_error': {
      next.phase = 'agent_error';
      next.pendingEventSeq = null;
      next.pendingEvent = null;
      next.diagnostics.push({
        error: 'agent_error',
        message: event.message || 'unknown agent error',
      });
      break;
    }

    case 'checkpoint': {
      if (COMPLETED_PHASES.has(next.phase)) {
        next.diagnostics.push({
          error: 'checkpoint_after_terminal_ignored',
          phase: event.phase ?? null,
          revision: event.revision ?? null,
        });
        break;
      }

      if ((event.revision ?? 0) >= (next.checkpointRevision ?? 0)) {
        next.phase = event.phase ?? next.phase;
        next.checkpointRevision = event.revision ?? next.checkpointRevision;
        next.activeOwner = event.owner ?? next.activeOwner;
        next.arrivedVariants = event.arrivedVariants ?? next.arrivedVariants;
        next.visibleVariant = event.visibleVariant ?? next.visibleVariant;
        next.sourceFile = event.sourceFile ?? next.sourceFile;
        next.previewFile = event.previewFile ?? next.previewFile;
        next.previewMode = event.previewMode ?? next.previewMode;
        if (event.paramValues) next.paramValues = {...event.paramValues};
      } else {
        next.diagnostics.push({
          error: 'stale_checkpoint_ignored',
          revision: event.revision,
        });
      }
      break;
    }

    case 'complete': {
      next.phase = 'completed';
      next.sourceFile = event.sourceFile ?? event.file ?? next.sourceFile;
      next.previewFile = event.previewFile ?? next.previewFile;
      next.previewMode = event.previewMode ?? next.previewMode;
      next.pendingEventSeq = null;
      next.pendingEvent = null;
      break;
    }

    case 'discard': {
      next.phase = 'discard_requested';
      next.pendingEventSeq = entry.seq ?? next.pendingEventSeq;
      next.pendingEvent = toPendingEvent(event);
      break;
    }

    case 'discarded': {
      next.phase = 'discarded';
      next.pendingEventSeq = null;
      next.pendingEvent = null;
      break;
    }

    case 'generate': {
      next.phase = 'generate_requested';
      next.pageUrl = event.pageUrl ?? next.pageUrl;
      next.expectedVariants = event.count ?? next.expectedVariants;
      next.pendingEventSeq = entry.seq ?? next.pendingEventSeq;
      next.pendingEvent = toPendingEvent(event);
      if (event.screenshotPath)
        upsertArtifact(next.annotationArtifacts, {
          path: event.screenshotPath,
          type: 'screenshot',
        });
      break;
    }

    case 'manual_edit_apply': {
      next.phase = 'manual_edit_apply_requested';
      next.pageUrl = event.pageUrl ?? next.pageUrl;
      next.pendingEventSeq = entry.seq ?? next.pendingEventSeq;
      next.pendingEvent = toPendingEvent(event);
      break;
    }

    case 'steer': {
      next.phase = 'steer_requested';
      next.pageUrl = event.pageUrl ?? next.pageUrl;
      next.pendingEventSeq = entry.seq ?? next.pendingEventSeq;
      next.pendingEvent = toPendingEvent(event);
      break;
    }

    case 'steer_done': {
      next.phase = 'steer_done';
      next.sourceFile = event.sourceFile ?? event.file ?? next.sourceFile;
      next.previewFile = event.previewFile ?? next.previewFile;
      next.previewMode = event.previewMode ?? next.previewMode;
      next.message = event.message ?? next.message;
      next.pendingEventSeq = null;
      next.pendingEvent = null;
      break;
    }

    default: {
      next.diagnostics.push({error: 'unknown_event_type', type: event.type});
      break;
    }
  }

  return next;
};

const toPendingEvent = (event) => {
  const pending = {...event};
  delete pending.token;

  return pending;
};

const upsertArtifact = (artifacts, artifact) => {
  if (
    !artifacts.some(
      (existing) =>
        existing.path === artifact.path && existing.type === artifact.type
    )
  ) {
    artifacts.push(artifact);
  }
};

const writeSnapshot = (snapshotPath, snapshot) => {
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
};
