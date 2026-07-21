#!/usr/bin/env node
/**
 * Canonical durable completion acknowledgement for Impeccable live sessions.
 */

import {readLiveServerInfo} from './lib/impeccable-paths.mjs';
import {createLiveSessionStore} from './live/session-store.mjs';

const parseArgs = (argv) => {
  const out = {status: 'complete'};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--id') out.id = argv[++index];
    else if (arg.startsWith('--id=')) out.id = arg.slice('--id='.length);
    else if (arg === '--discarded' || arg === '--discard') out.status = 'discarded';
    else if (arg === '--error') { out.status = 'agent_error'; out.message = argv[++index] || 'unknown error'; }
    } else if (arg.startsWith('--error=')) {
      out.status = 'agent_error';
      out.message = arg.slice('--error='.length);
    } else if (arg === '--help' || arg === '-h') out.help = true;
  }

  return out;
};

export const completeCli = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    console.log(
      `Usage: node live-complete.mjs --id SESSION_ID [--discarded|--error MESSAGE]\n\nAppend the final durable session acknowledgement. Use after accept/discard cleanup is verified.`
    );
    process.exit(args.help ? 0 : 1);
  }

  const serverInfo = readServerInfo();
  const serverResult =
    serverInfo ? await completeThroughServer(serverInfo, args) : null;

  if (serverResult?.ok) {
    const store = createLiveSessionStore({
      cwd: process.cwd(),
      sessionId: args.id,
    });
    const snapshot = store.getSnapshot(args.id, {includeCompleted: true});
    console.log(
      JSON.stringify(
        {
          ok: true,
          id: args.id,
          phase: snapshot?.phase || args.status,
          snapshot,
        },
        null,
        2
      )
    );

    return;
  }

  const store = createLiveSessionStore({
    cwd: process.cwd(),
    sessionId: args.id,
  });
  const event =
    args.status === 'discarded' ? {type: 'discarded', id: args.id}
    : args.status === 'agent_error' ?
      {
        type: 'agent_error',
        id: args.id,
        message: args.message || 'unknown error',
      }
    : {type: 'complete', id: args.id};
  const snapshot = store.appendEvent(event);
  console.log(
    JSON.stringify(
      {ok: true, id: args.id, phase: snapshot.phase, snapshot},
      null,
      2
    )
  );
};

const readServerInfo = () => readLiveServerInfo(process.cwd())?.info || null;

const completeThroughServer = async (info, args) => {
  const type =
    args.status === 'discarded' ? 'discarded'
    : args.status === 'agent_error' ? 'error'
    : 'complete';

  try {
    const res = await fetch(`http://localhost:${info.port}/poll`, {
      body: JSON.stringify({ token: info.token, id: args.id, type, message: args.message }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
};

const _running = process.argv[1];

if (
  _running?.endsWith('live-complete.mjs') ||
  _running?.endsWith('live-complete.mjs/')
) {
  completeCli();
}
