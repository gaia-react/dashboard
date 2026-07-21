#!/usr/bin/env node
/**
 * Impeccable design hook — PostToolUse entry point.
 *
 * Reads the Claude Code / Codex / Cursor hook event from stdin, runs the design
 * detector against the touched file, and emits a system reminder via
 * `hookSpecificOutput.additionalContext` when findings exist.
 *
 * Contract: never break a turn. Always exit 0. Clean files emit a small ack
 * unless quiet mode is enabled.
 *
 * Most logic lives in `hook-lib.mjs` so it is unit-testable without a
 * subprocess. This file is the thin stdin/stdout adapter.
 */

import {runHook, writeAuditLog} from './hook-lib.mjs';

const readStdin = async () => {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf-8');
};

const main = async () => {
  // Snapshot the inherited env FIRST so the re-entrancy guard checks the
  // parent's value, not the value we are about to export for any child
  // processes the hook might ever spawn.
  const inheritedEnvironment = {...process.env};
  process.env.IMPECCABLE_HOOK_DEPTH = process.env.IMPECCABLE_HOOK_DEPTH || '1';

  let stdinJson = '';

  try {
    stdinJson = await readStdin();
  } catch {
    /* fall through */
  }

  const result = await runHook({
    cwd: process.cwd(),
    env: inheritedEnvironment,
    stdinJson,
  });

  writeAuditLog(process.env, result.audit, process.cwd());

  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode || 0);
};

main().catch((error) => {
  // Last-ditch: never break the agent's turn even if something we did not
  // anticipate goes wrong. Audit-log the failure if logging is enabled.
  try {
    writeAuditLog(process.env, {
      error: String(error && error.message ? error.message : error),
      event: 'PostToolUse',
      ts: new Date().toISOString(),
    });
  } catch {
    /* swallow */
  }

  if (process.env.IMPECCABLE_HOOK_DEBUG) {
    process.stderr.write(`[impeccable-hook] ${error}\n`);
  }
  process.exit(0);
});
