/**
 * CLI client for the live variant mode poll/reply protocol.
 *
 * Usage:
 *   node <scripts_path>/live-poll.mjs                         # Block until browser event, print JSON
 *   node <scripts_path>/live-poll.mjs --stream                # Experimental: keep polling; one JSON line per event
 *   node <scripts_path>/live-poll.mjs --timeout=600000        # Custom timeout (ms); default is long-poll friendly
 *   node <scripts_path>/live-poll.mjs --reply <id> done       # Reply "done" to event <id>
 *   node <scripts_path>/live-poll.mjs --reply <id> error "msg" # Reply with error
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLiveServerInfo} from './lib/impeccable-paths.mjs';
import {
  completionAckForAcceptResult,
  completionTypeForAcceptResult,
} from './live/completion.mjs';

// Absolute path to a sibling script in this skill's scripts dir, so runtime
// error hints print a directly-runnable command instead of a placeholder.
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const scriptCmd = (name) => `node "${path.join(SELF_DIR, name)}"`;

// Node's built-in fetch (undici under the hood) enforces a 300s headers
// timeout that can't be lowered per-request. We cap each request below
// that ceiling and loop in `pollOnce` to synthesize a long poll without
// depending on the standalone undici package.
export const PER_REQUEST_TIMEOUT_MS = 270_000;

export const DEFAULT_EVENT_LEASE_MS = 600_000;

const EVENT_TYPES_NEEDING_AGENT_REPLY = new Set([
  'generate',
  'manual_edit_apply',
  'steer',
]);

const readServerInfo = () => {
  const record = readLiveServerInfo(process.cwd());

  if (!record) {
    console.error(
      `No running live server found. Start one with: ${scriptCmd('live.mjs')}`
    );
    process.exit(1);
  }

  return record.info;
};

export const buildPollReplyPayload = (
  token,
  {id, type, message, file, data}
) => ({token, id, type, message, file, data});

export const manualApplyPollBanner = (event = {}) => {
  const id = event.id || 'EVENT_ID';

  return (
    [
      `Manual Apply action required: edit source, then reply with \`live-poll.mjs --reply ${id} done --data '<json>'\`.`,
      'The JSON data must include status, appliedEntryIds, failed, files, and notes; summary counters are only a recovery fallback.',
      'Do not run live-commit-manual-edits.mjs for this leased event.',
      'Do not poll again before replying.',
    ].join('\n') + '\n'
  );
};

/**
 * Parse `--reply <id> <status> [--file path] [--data '<json>'] [message]` argv
 * into a reply object. Returns null when `--reply` is absent. Throws (code
 * INVALID_REPLY_ARGS) when the reply shape is missing its event id/status and
 * INVALID_DATA_JSON when `--data` is present but not valid JSON.
 */
export const parseReplyArgs = (args) => {
  const replyIndex = args.indexOf('--reply');
  if (replyIndex === -1) return null;
  const id = args[replyIndex + 1];
  const status = args[replyIndex + 2];
  validateReplyArgs({ id, status });
  const fileIdx = args.indexOf('--file');
  const file = fileIdx !== -1 && fileIdx + 1 < args.length ? args[fileIdx + 1] : undefined;
  const dataIdx = args.indexOf('--data');
  let data;
  if (dataIdx !== -1 && dataIdx + 1 < args.length) {
    try {
      data = JSON.parse(args[dataIdx + 1]);
    } catch (err) {
      const wrapped = new Error('--data must be valid JSON: ' + err.message);
      wrapped.code = 'INVALID_DATA_JSON';
      throw wrapped;
    }
  }
  const message = args.find((a, i) =>
    i > replyIndex + 2
        !a.startsWith('--') &&
        i !== fileIdx + 1 &&
        i !== dataIdx + 1
    ) || undefined;

  return {id, type: status, message, file, data};
};

const validateReplyArgs = ({id, status}) => {
  const usage = `Usage: ${scriptCmd('live-poll.mjs')} --reply <id> <status> [--file path] [--data '<json>'] [message]`;

  if (!id || id.startsWith('--')) {
    const error = new Error(`${usage}\nMissing event id after --reply.`);
    error.code = 'INVALID_REPLY_ARGS';
    throw error;
  }

  if (['complete', 'discard', 'discarded', 'done', 'error'].includes(id)) {
    const error = new Error(`${usage}\nThe value after --reply must be the event id, not the status ${JSON.stringify(id)}. Use --reply EVENT_ID ${id}.`);
    error.code = 'INVALID_REPLY_ARGS';
    throw error;
  }

  if (!status || status.startsWith('--')) {
    const error = new Error(`${usage}\nMissing reply status after event id ${JSON.stringify(id)}.`);
    error.code = 'INVALID_REPLY_ARGS';
    throw error;
  }
};

export const requiresAgentReply = (event) =>
  EVENT_TYPES_NEEDING_AGENT_REPLY.has(event?.type);

export const postReply = async (base, token, reply) => {
  const res = await fetch(`${base}/poll`, {
    body: JSON.stringify(buildPollReplyPayload(token, reply)),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const parts = [body.error || res.statusText, body.reason, body.hint].filter(
      Boolean
    );

    throw new Error(parts.join(': '));
  }
};

export const fetchServerStatus = async (base, token) => {
  const res = await fetch(`${base}/status?token=${token}`);

  if (res.status === 401) {
    const error = new Error('Authentication failed. The server token may have changed.');
    error.code = 'AUTH_FAILED';
    throw error;
  }

  if (!res.ok) {
    throw new Error(`Status failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

export const isEventPending = (status, eventId) =>
  (status.pendingEvents || []).some((entry) => entry.id === eventId);

export const waitForEventAck = async (
  base,
  token,
  eventId,
  maxWaitMs = 600_000,
  pollIntervalMs = 400,
} = {}) => {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const status = await fetchServerStatus(base, token);
    if (!isEventPending(status, eventId)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
};

export const fetchNextEvent = async (base, token, {totalDeadline} = {}) => {
  while (true) {
    if (totalDeadline && Date.now() >= totalDeadline) {
      return {type: 'timeout'};
    }

    const remaining =
      totalDeadline ? totalDeadline - Date.now() : PER_REQUEST_TIMEOUT_MS;
    const slice = Math.min(Math.max(remaining, 1000), PER_REQUEST_TIMEOUT_MS);
    const res = await fetch(
      `${base}/poll?token=${token}&timeout=${slice}&leaseMs=${DEFAULT_EVENT_LEASE_MS}`
    );

    if (res.status === 401) {
      const error = new Error('Authentication failed. The server token may have changed.');
      error.code = 'AUTH_FAILED';
      throw error;
    }

    if (!res.ok) {
      throw new Error(`Poll failed: ${res.status} ${res.statusText}`);
    }

    const next = await res.json();

    if (next?.type === 'timeout') {
      if (totalDeadline && Date.now() < totalDeadline) continue;
      if (!totalDeadline) continue;

      return next;
    }

    return next;
  }
};

export const augmentEventWithAcceptHandling = async (event, base, token) => {
  if (event.type !== 'accept' && event.type !== 'discard') return event;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const acceptScript = path.join(__dirname, 'live-accept.mjs');
  const scriptArgs = buildAcceptScriptArgs(event);

  try {
    const out = execFileSync('node', [acceptScript, ...scriptArgs], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 30_000,
    });
    event._acceptResult = JSON.parse(out.trim());
  } catch (error) {
    event._acceptResult = { handled: false, mode: 'error', error: error.message };
  }

  const completionType = completionTypeForAcceptResult(
    event.type,
    event._acceptResult
  );

  try {
    await postReply(base, token, {
      data: event._acceptResult?.carbonize === true ? { carbonize: true } : undefined,
      file: event._acceptResult?.file,
      id: event.id,
      message: event._acceptResult?.error,
      type: completionType,
    });
  } catch (error) {
    event._completionAck = { ok: false, error: error.message };
  }

  if (!event._completionAck) {
    event._completionAck = completionAckForAcceptResult(
      event.id,
      completionType,
      event._acceptResult
    );
  }

  return event;
};

export const buildAcceptScriptArgs = (event) => {
  const scriptArgs =
    event.type === 'discard' ?
      ['--id', String(event.id), '--discard']
    : ['--id', String(event.id), '--variant', String(event.variantId)];
  if (event.pageUrl) scriptArgs.push('--page-url', String(event.pageUrl));

  if (
    event.type === 'accept' &&
    event.paramValues &&
    Object.keys(event.paramValues).length > 0
  ) {
    scriptArgs.push('--param-values', JSON.stringify(event.paramValues));
  }

  return scriptArgs;
};

export const writeCarbonizeBanner = (event) => {
  if (event.type === 'manual_edit_apply') {
    process.stderr.write(`\n${  manualApplyPollBanner(event)  }\n`);
  }

  if (event._acceptResult?.carbonize === true) {
    process.stderr.write(
      '\n⚠ Carbonize cleanup REQUIRED before next poll. After cleanup, run live-complete.mjs --id ' +
        event.id +
        '. See reference/live.md "Required after accept".\n\n'
    );
  }
};

export const printPollEvent = (event) => {
  console.log(JSON.stringify(event));
};

export const runPollOnce = async (
  base,
  token,
  {totalTimeout = 600_000} = {}
) => {
  const deadline = Date.now() + totalTimeout;
  const event = await fetchNextEvent(base, token, {totalDeadline: deadline});
  await augmentEventWithAcceptHandling(event, base, token);
  writeCarbonizeBanner(event);
  printPollEvent(event);

  return event;
};

export const runPollStream = async (
  base,
  token,
  {
    ackTimeoutMs = 600_000,
    ackPollIntervalMs = 400,
    shouldContinue = () => true,
  } = {}
) => {
  process.stderr.write(
    '[impeccable-poll] stream mode: one JSON object per line on stdout; use --reply while this process stays running\n'
  );

  while (shouldContinue()) {
    const event = await fetchNextEvent(base, token);
    await augmentEventWithAcceptHandling(event, base, token);
    writeCarbonizeBanner(event);
    printPollEvent(event);

    if (event.type === 'exit') return event;

    if (requiresAgentReply(event)) {
      const acked = await waitForEventAck(base, token, event.id, {
        maxWaitMs: ackTimeoutMs,
        pollIntervalMs: ackPollIntervalMs,
      });

      if (!acked) {
        const error = new Error(`Timed out waiting for --reply on event ${event.id}`);
        error.code = 'ACK_TIMEOUT';
        throw error;
      }
    }
  }

  return null;
};

const handlePollError = (error) => {
  if (error.code === 'AUTH_FAILED') {
    console.error(error.message);
    console.error(`Try restarting: ${scriptCmd('live-server.mjs')} stop && ${scriptCmd('live.mjs')}`);
    process.exit(1);
  }
  if (error.cause?.code === 'ECONNREFUSED') {
    console.error(`Live server not running. Start one with: ${scriptCmd('live.mjs')}`);
    process.exit(1);
  }
  if (error.code === 'ACK_TIMEOUT') {
    console.error(error.message);
    process.exit(1);
  }
  console.error('Poll failed:', error.message);
  process.exit(1);
};

export const pollCli = async () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: impeccable poll [options]

Wait for a browser event from the live variant server, or reply to one.

Modes:
  poll                             Block until a browser event arrives, print JSON, exit
  poll --stream                    Keep polling; print one JSON line per event (see live.md)
  poll --reply <id> done           Reply "done" to event <id> (replace or insert generate)
  poll --reply <id> steer_done     Reply after handling a steer event (unlocks Steer bar)
  poll --reply <id> error "msg"    Reply with an error message
  poll --reply <id> done --data '<json>'
                                   Reply with a structured JSON result (manual_edit_apply)

Options:
  --timeout=MS        One-shot poll timeout in ms (default: 600000). Ignored in --stream mode
  --ack-timeout=MS    Stream mode: max wait for --reply after generate/steer (default: 600000)
  --file PATH         Attach a source file path to the reply (generate/steer flow)
  --data JSON         Attach a JSON result object to the reply (manual_edit_apply flow). Must be valid JSON
  --help              Show this help message

Harness note:
  Default one-shot mode is the portable contract for Claude Code, Codex, and Cursor.
  --stream is experimental for harnesses with fast incremental stdout; do not use on Cursor.`);
    process.exit(0);
  }

  const info = readServerInfo();
  const base = `http://localhost:${info.port}`;

  // Reply mode: node <scripts_path>/live-poll.mjs --reply <id> <status> [--file path] [--data '<json>'] [message]
  if (args.includes('--reply')) {
    let reply;

    try {
      reply = parseReplyArgs(args);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }

    try {
      await postReply(base, info.token, reply);
    } catch (error) {
      if (error.cause?.code === 'ECONNREFUSED') {
        console.error(`Live server not running. Start one with: ${scriptCmd('live.mjs')}`);
      } else {
        console.error('Reply failed:', error.message);
      }
      process.exit(1);
    }

    return;
  }

  const streamMode = args.includes('--stream');
  const ackTimeoutArgument = args.find((a) => a.startsWith('--ack-timeout='));
  const ackTimeoutMs = ackTimeoutArgument ? parseInt(ackTimeoutArgument.split('=', 2)[1], 10) : 600_000;

  try {
    if (streamMode) {
      await runPollStream(base, info.token, {ackTimeoutMs});

      return;
    }

    const timeoutArgument = args.find((a) => a.startsWith('--timeout='));
    const totalTimeout = timeoutArgument ? parseInt(timeoutArgument.split('=', 2)[1], 10) : 600_000;
    await runPollOnce(base, info.token, {totalTimeout});
  } catch (error) {
    handlePollError(error);
  }
};

// Auto-execute when run directly
const _running = process.argv[1];

if (
  _running?.endsWith('live-poll.mjs') ||
  _running?.endsWith('live-poll.mjs/')
) {
  pollCli();
}
