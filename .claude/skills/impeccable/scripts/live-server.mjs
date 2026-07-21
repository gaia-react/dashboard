#!/usr/bin/env node
/**
 * Live variant mode server (self-contained, zero dependencies).
 *
 * Serves the browser script (/live.js), the detection overlay (/detect.js),
 * uses Server-Sent Events (SSE) for server→browser push, and HTTP POST for
 * browser→server events. Agent communicates via HTTP long-poll (/poll).
 *
 * Usage:
 *   node <scripts_path>/live-server.mjs              # start
 *   node <scripts_path>/live-server.mjs stop         # stop + remove injected live.js tag
 *   node <scripts_path>/live-server.mjs stop --keep-inject   # stop only
 *   node <scripts_path>/live-server.mjs --help
 */

import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadContext} from './context.mjs';
import {parseDesignMd} from './lib/design-parser.mjs';
import {
  getDesignSidecarPath,
  getLiveAnnotationsDir,
  getLiveDir,
  readLiveServerInfo,
  removeLiveServerInfo,
  resolveDesignSidecarPath,
  writeLiveServerInfo,
} from './lib/impeccable-paths.mjs';
import {
  assembleLiveBrowserScript,
  assertLiveBrowserScriptParts,
  readLiveBrowserScriptParts,
  resolveLiveBrowserScriptParts,
} from './live/browser-script-parts.mjs';
import {validateEvent} from './live/event-validation.mjs';
import {
  createManualApplyController,
  summarizeManualApplyFailures,
} from './live/manual-apply.mjs';
import {createManualEditRoutes} from './live/manual-edit-routes.mjs';
import {countByPage as countPendingByPage} from './live/manual-edits-buffer.mjs';
import {createLiveSessionStore} from './live/session-store.mjs';
import {
  applyDeferredSvelteComponentAccepts,
  removeAllSvelteComponentSessions,
} from './live/svelte-component.mjs';
import {LIVE_COMMANDS} from './live/vocabulary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PRODUCT.md / DESIGN.md live wherever context.mjs resolves. The generated
// DESIGN sidecar is project-local at .impeccable/design.json, with legacy
// DESIGN.json fallback for existing projects.
const PROJECT_CONTEXT = loadContext(process.cwd());
const CONTEXT_DIR = PROJECT_CONTEXT.contextDir;
const DESIGN_MD_PATH =
  PROJECT_CONTEXT.designPath ?
    path.resolve(process.cwd(), PROJECT_CONTEXT.designPath)
  : null;
const DEFAULT_POLL_TIMEOUT = 600_000; // 10 min — agent re-polls on timeout anyway
const SSE_HEARTBEAT_INTERVAL = 30_000; // keepalive ping every 30s

// ---------------------------------------------------------------------------
// Port detection
// ---------------------------------------------------------------------------

const findOpenPort = async (start = 8400) =>
  new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(start, '127.0.0.1', () => {
      const {port} = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findOpenPort(start + 1)));
  });

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const state = {
  exitTimer: null,
  lastAgentPollingBroadcast: null,
  // Updated whenever a /poll long-poll request arrives or is resolved with an
  // event. Used to detect "a chat agent is likely attached" without requiring
  // a poll to be parked at the exact moment we dispatch.
  lastPollAt: 0,
  leaseTimer: null,
  manualEditActivity: null,
  nextEventSeq: 1,
  nextManualEditSeq: 1,
  // Deferreds for in-flight chat-routed Apply events. Keyed by event id; each
  // entry is resolved when the chat agent POSTs an ack carrying the batch
  // result, or rejected when the hard timeout fires.
  pendingApplyDeferreds: new Map(),
  pendingEvents: [], // browser events waiting for agent ack ({ event, leaseUntil })
  pendingPolls: [], // agent poll callbacks waiting for browser events
  port: null,
  sessionDir: null, // per-session tmp dir for annotation screenshots
  sessionStore: null,
  sseClients: new Set(), // SSE response objects (server→browser push)
  timedOutApplyIds: new Map(),
  token: null,
};

const CHAT_POLL_FRESHNESS_MS = 60_000;
const POLL_LEASE_EXPIRY_TIMER_GRACE_MS = 2;
const DEBUG_MANUAL_EDIT_EVENTS = /^(1|true|yes)$/i.test(
  process.env.IMPECCABLE_LIVE_DEBUG_EVENTS || ''
);

const manualApply = createManualApplyController({
  acknowledgePendingEvent,
  cwd: () => process.cwd(),
  enqueueEvent,
  flushPendingPolls,
  pendingApplyDeferreds: state.pendingApplyDeferreds,
  pendingEvents: state.pendingEvents,
  recordManualEditActivity,
  timedOutApplyIds: state.timedOutApplyIds,
});

const manualEditRoutes = createManualEditRoutes({
  chatAgentLikelyActive,
  cwd: () => process.cwd(),
  env: () => process.env,
  getManualEditStatus,
  getToken: () => state.token,
  manualApply,
  recordManualEditActivity,
});

const chatAgentLikelyActive = () => {
  if (state.pendingPolls.length > 0) return true;
  if (!state.lastPollAt) return false;

  return Date.now() - state.lastPollAt < CHAT_POLL_FRESHNESS_MS;
};

// Cap per-annotation upload size. A full 1920×1080 PNG is typically <1 MB;
// cap at 10 MB to guard against runaway writes from a misbehaving client.
const MAX_ANNOTATION_BYTES = 10 * 1024 * 1024;

const enqueueEvent = (event) => {
  if (
    !event ||
    (event.id &&
      state.pendingEvents.some(
        (entry) =>
          entry.event?.id === event.id && entry.event?.type === event.type
      ))
  )
    return;
  state.pendingEvents.push({event, leaseUntil: 0, seq: state.nextEventSeq++});
  flushPendingPolls();
};

const restorePendingEventsFromStore = () => {
  if (!state.sessionStore) return;

  for (const snapshot of state.sessionStore.listActiveSessions()) {
    if (snapshot.pendingEvent) enqueueEvent(snapshot.pendingEvent);
  }
};

const findAvailablePendingEvent = (now = Date.now()) => {
  for (const entry of state.pendingEvents) {
    if (entry.leaseUntil && entry.leaseUntil > now) continue;

    return entry;
  }

  return null;
};

const leaseEvent = (entry, leaseMs) => {
  if (!entry.event?.id) {
    const index = state.pendingEvents.indexOf(entry);
    if (index !== -1) state.pendingEvents.splice(index, 1);

    return entry.event;
  }
  entry.leaseUntil = Date.now() + leaseMs;
  scheduleLeaseFlush();
  broadcastAgentPollingIfChanged();

  return entry.event;
};

const acknowledgePendingEvent = (id) => {
  if (!id) return false;
  const index = state.pendingEvents.findIndex(
    (entry) => entry.event?.id === id
  );
  if (index === -1) return false;
  const acknowledged = state.pendingEvents[index].event;
  state.pendingEvents.splice(index, 1);
  scheduleLeaseFlush();
  broadcastAgentPollingIfChanged();

  return acknowledged;
};

const findPendingEventById = (id) => {
  if (!id) return null;
  const entry = state.pendingEvents.find((item) => item.event?.id === id);

  return entry?.event || null;
};

const summarizePendingEventForStatus = (entry) => {
  const event = entry.event || {};
  const summary = {
    id: event.id,
    leased: !!(entry.leaseUntil && entry.leaseUntil > Date.now()),
    leaseUntil: entry.leaseUntil || null,
    type: event.type,
  };

  if (event.type === 'manual_edit_apply') {
    summary.pageUrl = event.pageUrl || null;
    summary.chunk = event.chunk || null;
    summary.repair = event.repair || null;
    summary.evidencePath = event.evidencePath || null;
    summary.agentAction =
      event.agentAction || manualApply.buildAgentAction(event);
    summary.manualApplySummary = manualApply.summarizeEvent(
      event,
      manualApply.getDeferred(event.id)?.batch || event.batch
    );
  }

  return summary;
};

const summarizeActiveSessionForClient = (snapshot = {}) => ({
  arrivedVariants: snapshot.arrivedVariants ?? 0,
  checkpointRevision: snapshot.checkpointRevision ?? 0,
  expectedVariants: snapshot.expectedVariants ?? 0,
  id: snapshot.id,
  pageUrl: snapshot.pageUrl ?? null,
  paramValues: snapshot.paramValues || {},
  phase: snapshot.phase,
  previewFile: snapshot.previewFile ?? null,
  previewMode: snapshot.previewMode ?? null,
  sourceFile: snapshot.sourceFile ?? null,
  visibleVariant: snapshot.visibleVariant ?? null,
});

const activeSessionSummaries = () => {
  if (!state.sessionStore) return [];

  return state.sessionStore
    .listActiveSessions()
    .map((snapshot) => summarizeActiveSessionForClient(snapshot));
};

const cancelQueuedAnonymousExitEvents = () => {
  let removed = 0;

  for (let index = state.pendingEvents.length - 1; index >= 0; index -= 1) {
    const event = state.pendingEvents[index]?.event;
    if (event?.type !== 'exit' || event.id) continue;
    state.pendingEvents.splice(index, 1);
    removed += 1;
  }

  if (removed > 0) {
    scheduleLeaseFlush();
    broadcastAgentPollingIfChanged();
  }

  return removed;
};

const scheduleLeaseFlush = () => {
  if (state.leaseTimer) {
    clearTimeout(state.leaseTimer);
    state.leaseTimer = null;
  }
  const now = Date.now();
  const nextLeaseUntil = state.pendingEvents
    .map((entry) => entry.leaseUntil || 0)
    .filter((leaseUntil) => leaseUntil > now)
    .sort((a, b) => a - b)[0];
  if (!nextLeaseUntil) return;
  state.leaseTimer = setTimeout(
    () => {
      state.leaseTimer = null;
      flushPendingPolls();
      broadcastAgentPollingIfChanged();
    },
    Math.max(0, nextLeaseUntil - now + POLL_LEASE_EXPIRY_TIMER_GRACE_MS)
  );
};

const flushPendingPolls = () => {
  let changed = false;

  while (state.pendingPolls.length > 0) {
    const entry = findAvailablePendingEvent();

    if (!entry) {
      scheduleLeaseFlush();
      broadcastAgentPollingIfChanged();

      return;
    }
    const poll = state.pendingPolls.shift();
    poll.resolve(leaseEvent(entry, poll.leaseMs));
    changed = true;
  }
  scheduleLeaseFlush();
  if (changed) broadcastAgentPollingIfChanged();
};

const agentPollingConnected = () => {
  const now = Date.now();

  return (
    state.pendingPolls.length > 0 ||
    state.pendingEvents.some(
      (entry) => entry.leaseUntil && entry.leaseUntil > now
    )
  );
};

const broadcastAgentPollingIfChanged = () => {
  const connected = agentPollingConnected();
  if (state.lastAgentPollingBroadcast === connected) return;
  state.lastAgentPollingBroadcast = connected;
  broadcast({connected, type: 'agent_polling'});
};

/** Push a message to all connected SSE clients. */
const broadcast = (message) => {
  const data = `data: ${JSON.stringify(message)}\n\n`;

  for (const res of state.sseClients) {
    try {
      res.write(data);
    } catch {
      /* client gone */
    }
  }
};

const recordManualEditActivity = (type, details = {}) => {
  const entry = {
    seq: state.nextManualEditSeq++,
    ts: new Date().toISOString(),
    type,
    ...details,
  };
  state.manualEditActivity = entry;

  if (DEBUG_MANUAL_EDIT_EVENTS) {
    try {
      const filePath = path.join(
        getLiveDir(process.cwd()),
        'manual-edit-events.jsonl'
      );
      fs.mkdirSync(path.dirname(filePath), {recursive: true});
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
    } catch {
      /* diagnostics are best-effort; never block live mode on observability */
    }
  }
  broadcast(entry);

  return entry;
};

const getManualEditStatus = () => {
  try {
    const {perPage, totalCount} = countPendingByPage(process.cwd());

    return {lastActivity: state.manualEditActivity, perPage, totalCount};
  } catch (error) {
    return {
      error: error.message,
      lastActivity: state.manualEditActivity,
      perPage: {},
      totalCount: null,
    };
  }
};

// ---------------------------------------------------------------------------
// Load scripts
// ---------------------------------------------------------------------------

const loadBrowserScripts = () => {
  // Detection script: prefer the skill-bundled detector, then fall back to
  // source/npm package locations for local development and older installs.
  // This one IS cached — detect.js rarely changes during a session.
  const detectPaths = [
    path.join(__dirname, 'detector', 'detect-antipatterns-browser.js'),
    path.join(
      __dirname,
      '..',
      '..',
      'cli',
      'engine',
      'detect-antipatterns-browser.js'
    ),
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'cli',
      'engine',
      'detect-antipatterns-browser.js'
    ),
    path.join(
      process.cwd(),
      'node_modules',
      'impeccable',
      'cli',
      'engine',
      'detect-antipatterns-browser.js'
    ),
  ];
  let detectScript = '';

  for (const p of detectPaths) {
    try {
      detectScript = fs.readFileSync(p, 'utf-8');
      break;
    } catch {
      /* try next */
    }
  }

  // Browser script parts: DO NOT cache. Return paths so the /live.js handler
  // can re-read every part on each request. Editing browser code during
  // iteration should land on the next tab reload, not require a server restart.
  const liveScriptParts = resolveLiveBrowserScriptParts(__dirname);

  try {
    assertLiveBrowserScriptParts(liveScriptParts);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }

  return {detectScript, liveScriptParts};
};

const hasProjectContext = () => !!PROJECT_CONTEXT.hasProduct;

const statOrNull = (filePath) => {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
};

// HTTP request handler
// ---------------------------------------------------------------------------

const createRequestHandler =
  ({detectScript, liveScriptParts}) =>
  (req, res) => {
    const url = new URL(req.url, `http://localhost:${state.port}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();

      return;
    }

    const p = url.pathname;

    // --- Scripts ---
    if (p === '/live.js') {
      // Re-read from disk each request so edits to live-browser.js land on
      // the next tab reload. No-store headers prevent browser caching across
      // sessions — during iteration, a cached old script silently breaks
      // every subsequent session.
      let parts;

      try {
        parts = readLiveBrowserScriptParts(liveScriptParts);
      } catch (error) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end(`Error reading live browser scripts: ${error.message}`);

        return;
      }
      const body = assembleLiveBrowserScript({
        parts,
        port: state.port,
        token: state.token,
        vocabulary: LIVE_COMMANDS,
      });
      res.writeHead(200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Content-Type': 'application/javascript',
        Pragma: 'no-cache',
      });
      res.end(body);

      return;
    }

    if (p === '/detect.js' || p === '/') {
      if (!detectScript) {
        res.writeHead(404);
        res.end('Not available');

        return;
      }
      res.writeHead(200, {'Content-Type': 'application/javascript'});
      res.end(detectScript);

      return;
    }

    // --- Vendored modern-screenshot (UMD build) ---
    // Lazy-loaded by live.js when the user clicks Go; exposes
    // window.modernScreenshot.domToBlob(...) for capture.
    if (p === '/modern-screenshot.js') {
      const vendorPath = path.join(__dirname, 'modern-screenshot.umd.js');

      try {
        res.writeHead(200, {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': 'application/javascript',
        });
        res.end(fs.readFileSync(vendorPath));
      } catch {
        res.writeHead(404);
        res.end('Vendor script not found');
      }

      return;
    }

    // --- Annotation upload (browser → server, raw PNG body) ---
    // Client generates the eventId, POSTs the PNG, then POSTs the generate
    // event with screenshotPath already set. Keeps bytes out of the SSE/poll
    // bridge and preserves the "one shot from the user's POV" UX.
    if (p === '/annotation' && req.method === 'POST') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401);
        res.end('Unauthorized');

        return;
      }
      const eventId = url.searchParams.get('eventId');

      if (!eventId || !/^[A-Za-z0-9_-]{1,64}$/.test(eventId)) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Invalid eventId'}));

        return;
      }

      if ((req.headers['content-type'] || '').toLowerCase() !== 'image/png') {
        res.writeHead(415, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Content-Type must be image/png'}));

        return;
      }

      if (!state.sessionDir) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Session dir unavailable'}));

        return;
      }
      const chunks = [];
      let total = 0;
      let aborted = false;
      req.on('data', (c) => {
        if (aborted) return;
        total += c.length;

        if (total > MAX_ANNOTATION_BYTES) {
          aborted = true;
          res.writeHead(413, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Payload too large'}));
          req.destroy();

          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (aborted) return;
        const absPath = path.join(state.sessionDir, `${eventId}.png`);

        try {
          fs.writeFileSync(absPath, Buffer.concat(chunks));
        } catch (error) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: `Write failed: ${error.message}`}));

          return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true, path: absPath}));
      });
      req.on('error', () => {
        if (!aborted) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Upload failed'}));
        }
      });

      return;
    }

    // --- Health ---
    if (p === '/status') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Unauthorized'}));

        return;
      }
      const sessions = activeSessionSummaries();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          activeSessions: sessions,
          agentPolling: agentPollingConnected(),
          connectedClients: state.sseClients.size,
          manualEdits: getManualEditStatus(),
          pendingEvents: state.pendingEvents.map((entry) =>
            summarizePendingEventForStatus(entry)
          ),
          port: state.port,
          status: 'ok',
        })
      );

      return;
    }

    if (p === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          connectedClients: state.sseClients.size,
          hasProjectContext: hasProjectContext(),
          mode: 'variant',
          port: state.port,
          status: 'ok',
        })
      );

      return;
    }

    // --- Design system (unified v2 response) + raw ---
    //   /design-system.json    returns both parsed DESIGN.md and .impeccable/design.json
    //                          sidecar when present. Panel merges them:
    //                            { present, parsed, sidecar, hasMd, hasSidecar,
    //                              mdNewerThanJson, parseError?, sidecarError? }
    //                          - parsed: output of parseDesignMd (frontmatter
    //                            + six canonical sections) when DESIGN.md exists.
    //                          - sidecar: .impeccable/design.json contents when present.
    //                            Expected shape: schemaVersion 2, carrying
    //                            extensions + components + narrative.
    //   /design-system/raw     returns DESIGN.md markdown verbatim
    if (p === '/design-system.json' || p === '/design-system/raw') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401);
        res.end('Unauthorized');

        return;
      }

      const mdPath = DESIGN_MD_PATH;
      const jsonPath =
        resolveDesignSidecarPath(
          process.cwd(),
          PROJECT_CONTEXT.designContextDir || CONTEXT_DIR
        ) || getDesignSidecarPath(process.cwd());
      const mdStat = statOrNull(mdPath);
      const jsonStat = statOrNull(jsonPath);

      if (p === '/design-system/raw') {
        if (!mdStat) {
          res.writeHead(404);
          res.end('Not found');

          return;
        }
        res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8'});
        res.end(fs.readFileSync(mdPath, 'utf-8'));

        return;
      }

      if (!mdStat && !jsonStat) {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({present: false}));

        return;
      }

      const response = {
        hasMd: !!mdStat,
        hasSidecar: !!jsonStat,
        mdNewerThanJson: !!(
          mdStat &&
          jsonStat &&
          mdStat.mtimeMs > jsonStat.mtimeMs + 1000
        ),
        present: true,
      };

      if (mdStat) {
        try {
          response.parsed = parseDesignMd(fs.readFileSync(mdPath, 'utf-8'));
        } catch (error) {
          response.parseError = error.message;
        }
      }

      if (jsonStat) {
        try {
          response.sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch (error) {
          response.sidecarError = `Failed to parse .impeccable/design.json: ${error.message}`;
        }
      }

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(response));

      return;
    }

    // --- Source file (no-HMR fallback) ---
    if (p === '/source') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401);
        res.end('Unauthorized');

        return;
      }
      const filePath = url.searchParams.get('path');

      if (!filePath || filePath.includes('..')) {
        res.writeHead(400);
        res.end('Bad path');

        return;
      }
      const absPath = path.resolve(process.cwd(), filePath);

      if (!absPath.startsWith(process.cwd())) {
        res.writeHead(403);
        res.end('Forbidden');

        return;
      }
      let content;

      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        res.writeHead(404);
        res.end('File not found');

        return;
      }
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(content);

      return;
    }

    // --- SSE: server→browser push (replaces WebSocket) ---
    if (p === '/events' && req.method === 'GET') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401);
        res.end('Unauthorized');

        return;
      }
      clearTimeout(state.exitTimer);
      state.exitTimer = null;
      cancelQueuedAnonymousExitEvents();
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      });
      res.write(
        `data: ${JSON.stringify({
          activeSessions: activeSessionSummaries(),
          agentPolling: agentPollingConnected(),
          hasProjectContext: hasProjectContext(),
          type: 'connected',
        })}\n\n`
      );

      state.sseClients.add(res);

      // Keepalive: SSE comment every 30s prevents silent connection drops.
      const heartbeat = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, SSE_HEARTBEAT_INTERVAL);

      req.on('close', () => {
        clearInterval(heartbeat);
        state.sseClients.delete(res);

        if (state.sseClients.size === 0) {
          clearTimeout(state.exitTimer);
          state.exitTimer = setTimeout(() => {
            if (state.sseClients.size === 0) enqueueEvent({type: 'exit'});
          }, 8000);
        }
      });

      return;
    }

    if (manualEditRoutes(req, res, url)) return;

    // --- Browser→server events (replaces WebSocket messages) ---
    if (p === '/events' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        let message;

        try {
          message = JSON.parse(body);
        } catch {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Invalid JSON'}));

          return;
        }

        if (message.token !== state.token) {
          res.writeHead(401, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Unauthorized'}));

          return;
        }

        // Defense in depth: manual copy edits must use the staged stash/apply
        // endpoints. The direct Save event path is disabled in the browser.
        if (message.type === 'manual_edits') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              error:
                'manual_edits must POST to /manual-edit-stash, not /events',
            })
          );

          return;
        }

        if (message.type === 'manual_edit_apply') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              error:
                'manual_edit_apply is disabled; use /manual-edit-stash then /manual-edit-commit',
            })
          );

          return;
        }
        const error = validateEvent(message);

        if (error) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error}));

          return;
        }

        if (state.sessionStore && message.id) {
          try {
            state.sessionStore.appendEvent(message);
          } catch (error_) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(
              JSON.stringify({
                error: 'session_store_append_failed',
                message: error_.message,
              })
            );

            return;
          }
        }

        if (message.type === 'exit') {
          cleanupSvelteComponentSessionsBeforeExit();
        }

        if (message.type !== 'checkpoint') {
          enqueueEvent(message);
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      });

      return;
    }

    // --- Stop ---
    if (p === '/stop') {
      const token = url.searchParams.get('token');

      if (token !== state.token) {
        res.writeHead(401);
        res.end('Unauthorized');

        return;
      }
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('stopping');
      shutdown();

      return;
    }

    // --- Agent poll ---
    if (p === '/poll' && req.method === 'GET') {
      handlePollGet(req, res, url);

      return;
    }

    if (p === '/poll' && req.method === 'POST') {
      handlePollPost(req, res);

      return;
    }

    res.writeHead(404);
    res.end('Not found');
  };

// ---------------------------------------------------------------------------
// Agent poll endpoints (unchanged from WS version)
// ---------------------------------------------------------------------------

const handlePollGet = (req, res, url) => {
  const token = url.searchParams.get('token');

  if (token !== state.token) {
    res.writeHead(401, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Unauthorized'}));

    return;
  }
  state.lastPollAt = Date.now();
  const timeout = Number.parseInt(
    url.searchParams.get('timeout') || DEFAULT_POLL_TIMEOUT,
    10
  );
  const leaseMs = Number.parseInt(
    url.searchParams.get('leaseMs') || '30000',
    10
  );
  const available = findAvailablePendingEvent();

  if (available) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(leaseEvent(available, leaseMs)));

    return;
  }
  const poll = {leaseMs, resolve};
  const timer = setTimeout(() => {
    const index = state.pendingPolls.indexOf(poll);
    if (index !== -1) state.pendingPolls.splice(index, 1);
    broadcastAgentPollingIfChanged();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({type: 'timeout'}));
  }, timeout);

  const resolve = (event) => {
    clearTimeout(timer);
    state.lastPollAt = Date.now();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(event));
  };
  state.pendingPolls.push(poll);
  broadcastAgentPollingIfChanged();
  scheduleLeaseFlush();
  req.on('close', () => {
    clearTimeout(timer);
    const index = state.pendingPolls.indexOf(poll);
    if (index !== -1) state.pendingPolls.splice(index, 1);
    broadcastAgentPollingIfChanged();
  });
};

const sessionFileMetadataFromPollReply = (file) => {
  if (!file || typeof file !== 'string') return {file};
  const normalized = file.split(path.sep).join('/');
  const base = {file: normalized};
  if (!normalized.endsWith('/manifest.json') && normalized !== 'manifest.json')
    return base;
  if (
    !normalized.includes('node_modules/.impeccable-live/') &&
    !normalized.includes('src/lib/impeccable/')
  )
    return base;

  let full;

  try {
    full = path.resolve(process.cwd(), normalized);
    const rel = path.relative(process.cwd(), full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return base;
  } catch {
    return base;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(full, 'utf-8'));
    if (manifest?.previewMode !== 'svelte-component' || !manifest.sourceFile)
      return base;

    return {
      file: String(manifest.sourceFile).split(path.sep).join('/'),
      previewFile: normalized,
      previewMode: 'svelte-component',
      sourceFile: String(manifest.sourceFile).split(path.sep).join('/'),
    };
  } catch {
    return base;
  }
};

const handlePollPost = (req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    let message;

    try {
      message = JSON.parse(body);
    } catch {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Invalid JSON'}));

      return;
    }

    if (message.token !== state.token) {
      res.writeHead(401, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Unauthorized'}));

      return;
    }
    const pendingApplyDeferred = manualApply.getDeferred(message.id);

    if (pendingApplyDeferred) {
      const validation = manualApply.validateResultMessage(
        message,
        pendingApplyDeferred
      );

      if (!validation.ok) {
        recordManualEditActivity('manual_edit_apply_reply_invalid', {
          chunk: pendingApplyDeferred.event?.chunk || null,
          id: message.id,
          pageUrl: pendingApplyDeferred.pageUrl,
          reason:
            validation.body?.reason ||
            validation.body?.error ||
            'invalid_manual_apply_result',
          repair: pendingApplyDeferred.event?.repair || null,
          status: message.data?.status || null,
        });
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(validation.body));

        return;
      }
      recordManualEditActivity('manual_edit_apply_reply_received', {
        appliedCount: validation.result.appliedEntryIds.length,
        chunk: pendingApplyDeferred.event?.chunk || null,
        failed: summarizeManualApplyFailures(validation.result.failed),
        fileCount: validation.result.files.length,
        id: message.id,
        noteCount: validation.result.notes.length,
        pageUrl: pendingApplyDeferred.pageUrl,
        repair: pendingApplyDeferred.event?.repair || null,
        status: validation.result.status,
      });
      manualApply.resolveDeferred(message.id, validation.result);
      acknowledgePendingEvent(message.id);
      flushPendingPolls();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true}));

      return;
    }

    if (manualApply.hasTimedOutId(message.id)) {
      const rollback = manualApply.rollbackTimedOutReply(message);
      recordManualEditActivity('manual_edit_apply_stale_reply_rejected', {
        id: message.id,
        rollbackFailureCount: rollback.rollbackFailures?.length || 0,
        rolledBackFileCount: rollback.rolledBackFiles?.length || 0,
      });
      res.writeHead(409, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({error: 'stale_manual_edit_apply_reply', ...rollback})
      );

      return;
    }
    const pendingEventBeforeAck = findPendingEventById(message.id);

    if (
      pendingEventBeforeAck?.type === 'steer' &&
      message.type === 'steer_done' &&
      !message.file &&
      !(typeof message.message === 'string' && message.message.trim())
    ) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          error: 'steer_done_requires_file_or_message',
          hint: 'Reply with --file after writing source, or include a message explaining an intentional no-op.',
        })
      );

      return;
    }
    const acknowledgedEvent = acknowledgePendingEvent(message.id);
    let skipJournalReply = false;
    let existingSession = null;

    if (!acknowledgedEvent && state.sessionStore && message.id) {
      try {
        existingSession = state.sessionStore.getSnapshot(message.id, {
          includeCompleted: true,
        });
        if (!existingSession?.updatedAt) existingSession = null;
        skipJournalReply =
          existingSession?.phase === 'completed' ||
          existingSession?.phase === 'discarded';
      } catch {
        /* fall through and record the reply normally */
      }
    }

    if (!acknowledgedEvent && !existingSession) {
      recordManualEditActivity('manual_edit_poll_reply_unknown', {
        id: message.id || null,
        type: message.type || null,
      });
      res.writeHead(message.id ? 404 : 400, {
        'Content-Type': 'application/json',
      });
      res.end(
        JSON.stringify({
          error: message.id ? 'unknown_poll_reply_id' : 'missing_poll_reply_id',
          id: message.id,
        })
      );

      return;
    }
    const replyFileMeta = sessionFileMetadataFromPollReply(message.file);

    if (state.sessionStore && message.id && !skipJournalReply) {
      try {
        const eventType =
          message.type === 'steer_done' ? 'steer_done'
          : message.type === 'discard' || message.type === 'discarded' ?
            'discarded'
          : message.type === 'complete' ? 'complete'
          : message.type === 'error' ? 'agent_error'
          : 'agent_done';
        state.sessionStore.appendEvent({
          carbonize: message.data?.carbonize === true,
          file: replyFileMeta.file,
          id: message.id,
          message: message.message,
          previewFile: replyFileMeta.previewFile,
          previewMode: replyFileMeta.previewMode,
          sourceEventType: acknowledgedEvent?.type,
          sourceFile: replyFileMeta.sourceFile,
          type: eventType,
        });
      } catch {
        /* keep reply path best-effort; browser still needs SSE */
      }
    }
    flushPendingPolls();
    // Forward the reply to the browser via SSE
    broadcast({
      data: message.data,
      file: message.file,
      id: message.id,
      message: message.message,
      previewFile: replyFileMeta.previewFile,
      previewMode: replyFileMeta.previewMode,
      sourceFile: replyFileMeta.sourceFile,
      type: message.type || 'done',
    });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
  });
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let httpServer = null;

const shutdown = () => {
  cleanupSvelteComponentSessionsBeforeExit();
  removeLiveServerInfo(process.cwd());
  if (state.leaseTimer) clearTimeout(state.leaseTimer);
  state.leaseTimer = null;

  if (state.sessionDir) {
    try {
      fs.rmSync(state.sessionDir, {force: true, recursive: true});
    } catch {}
  }

  for (const res of state.sseClients) {
    try {
      res.end();
    } catch {}
  }
  state.sseClients.clear();
  for (const poll of state.pendingPolls) poll.resolve({type: 'exit'});
  state.pendingPolls.length = 0;
  if (httpServer) httpServer.close();
  process.exit(0);
};

const cleanupSvelteComponentSessionsBeforeExit = () => {
  try {
    removeAllSvelteComponentSessions(process.cwd());
  } catch (error) {
    console.warn(
      '[impeccable] Svelte component session cleanup failed:',
      error.message
    );
  }
};

const applyLegacyDeferredAcceptsOnStartup = () => {
  try {
    const result = applyDeferredSvelteComponentAccepts(process.cwd());

    if (result.applied > 0 || result.failed > 0) {
      console.log(
        '[impeccable] applied legacy deferred Svelte component accepts:',
        JSON.stringify(result)
      );
    }
  } catch (error) {
    console.warn(
      '[impeccable] legacy deferred Svelte component accept apply failed:',
      error.message
    );
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node live-server.mjs [options]

Start the live variant mode server (zero dependencies).

Commands:
  (default)     Start the server (foreground)
  stop          Stop the server and remove the injected live.js script tag
  stop --keep-inject   Stop the server only (leave the script tag in the HTML entry)

Options:
  --background  Start detached, print connection JSON to stdout, then exit
  --port=PORT   Use a specific port (default: auto-detect starting at 8400)
  --keep-inject Only with stop: skip live-inject.mjs --remove
  --help        Show this help

Endpoints:
  /live.js             Browser script (element picker + variant cycling)
  /detect.js           Detection overlay (backwards compatible)
  /modern-screenshot.js Vendored modern-screenshot UMD build (lazy-loaded by live.js)
  /annotation          POST raw image/png to stage a variant screenshot
  /events              SSE stream (server→browser) + POST (browser→server)
  /poll                Long-poll for agent CLI
  /manual-edit-stash   Stage browser copy edits
  /manual-edit-commit  Apply staged browser copy edits
  /manual-edit-discard Discard staged browser copy edits
  /source              Raw source file reader (no-HMR fallback)
  /status              Durable recovery status (token-protected)
  /health              Health check`);
  process.exit(0);
}

if (args.includes('stop')) {
  const keepInject = args.includes('--keep-inject');

  try {
    const {info} = readLiveServerInfo(process.cwd()) || {};
    const res = await fetch(
      `http://localhost:${info.port}/stop?token=${info.token}`
    );
    if (res.ok) console.log(`Stopped live server on port ${info.port}.`);
  } catch {
    console.log('No running live server found.');
  }

  if (!keepInject) {
    const injectPath = path.join(__dirname, 'live-inject.mjs');

    try {
      const out = execFileSync(process.execPath, [injectPath, '--remove'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      const line = out.trim().split('\n').findLast(Boolean);

      if (line) {
        try {
          const index = JSON.parse(line);

          if (index.removed === true) {
            console.log(`Removed live script tag from ${index.file}.`);
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    } catch (error) {
      const detail =
        error.stderr?.toString?.().trim?.() ||
        error.stdout?.toString?.().trim?.() ||
        error.message ||
        String(error);
      console.warn(
        `Note: could not remove live script tag (${detail.split('\n', 1)[0]})`
      );
    }
  }
  process.exit(0);
}

// --background: spawn a detached child server, wait for it to be ready,
// print the connection JSON, then exit.  This keeps the startup command
// simple (no shell backgrounding or chained commands).
if (args.includes('--background')) {
  const childArgs = args.filter((a) => a !== '--background');
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), ...childArgs],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
    }
  );
  child.unref();

  // Poll for the PID file (the child writes it once the HTTP server is listening).
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const {info} = readLiveServerInfo(process.cwd()) || {};

      if (info.pid !== process.pid) {
        // Output JSON so the agent can read port + token from stdout.
        console.log(JSON.stringify(info));
        process.exit(0);
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error('Timed out waiting for live server to start.');
  process.exit(1);
}

// Check for existing session
const existingRecord = readLiveServerInfo(process.cwd());

if (existingRecord?.info) {
  const existing = existingRecord.info;

  try {
    process.kill(existing.pid, 0);
    console.error(
      `Live server already running on port ${existing.port} (pid ${existing.pid}).`
    );
    console.error(
      `Stop it first with: node ${path.basename(
        fileURLToPath(import.meta.url)
      )} stop`
    );
    process.exit(1);
  } catch {
    try {
      fs.unlinkSync(existingRecord.path);
    } catch {}
  }
}

state.token = randomUUID();
state.sessionStore = createLiveSessionStore({cwd: process.cwd()});
manualApply.rollbackTransaction({
  reason: 'manual_edit_server_start_recovered_abandoned_transaction',
});
applyLegacyDeferredAcceptsOnStartup();
restorePendingEventsFromStore();
manualApply.pruneStaleEvidence();
const portArgument = args.find((a) => a.startsWith('--port='));
state.port =
  portArgument ?
    Number.parseInt(portArgument.split('=', 2)[1], 10)
  : await findOpenPort();
// Annotation screenshots live in the project root so the agent's Read tool
// doesn't trip a per-file permission prompt. Sessioned by token so concurrent
// projects (or quick restarts) don't collide.
const annotRoot = getLiveAnnotationsDir(process.cwd());
fs.mkdirSync(annotRoot, {recursive: true});
state.sessionDir = fs.mkdtempSync(path.join(annotRoot, 'session-'));

const {detectScript, liveScriptParts} = loadBrowserScripts();
httpServer = http.createServer(
  createRequestHandler({detectScript, liveScriptParts})
);

httpServer.listen(state.port, '127.0.0.1', () => {
  writeLiveServerInfo(process.cwd(), {
    pid: process.pid,
    port: state.port,
    token: state.token,
  });
  const url = `http://localhost:${state.port}`;
  console.log(`\nImpeccable live server running on ${url}`);
  console.log(`Token: ${state.token}\n`);
  console.log(`Script: ${url}/live.js`);
  console.log(
    'Inject: managed by live-inject.mjs; Astro source tags use is:inline automatically.'
  );
  console.log(
    `Stop:   node ${path.basename(fileURLToPath(import.meta.url))} stop`
  );
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
