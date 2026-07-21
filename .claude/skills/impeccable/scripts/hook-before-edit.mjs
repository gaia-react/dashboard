#!/usr/bin/env node
/**
 * Impeccable design hook — Cursor preToolUse write gate.
 *
 * Cursor's stop hook is not consistently dispatched by the headless agent, so
 * this hook checks proposed Write/Edit content before it lands. It only denies
 * writes when the real detector finds an issue in the proposed UI content.
 *
 * Contract: never break a turn accidentally. On malformed input or internal
 * errors, allow the tool and exit 0.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALLOWED_EXTS,
  appendDesignSystemNote,
  designSystemOptions,
  EDIT_COUNT_THRESHOLD,
  filterFindings,
  GENERATED_PATH,
  loadDetector,
  matchConfiguredExtension,
  matchesAnyGlob,
  persistCache,
  readCache,
  readConfig,
  renderTemplate,
  resolveCacheCwd,
  resolveProjectCwd,
  SENSITIVE_PATH,
  truthy,
  writeAuditLog,
} from './hook-lib.mjs';

const readStdin = async () => {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf-8');
};

const done = (payload = null) => {
  if (payload) process.stdout.write(JSON.stringify(payload));
  process.exit(0);
};

const allow = (extra = {}, payload = {}) => {
  writeAuditLog(process.env, {
    event: 'preToolUse',
    ts: new Date().toISOString(),
    ...extra,
  });

  return done({permission: 'allow', ...payload});
};

const deny = (message, audit) => {
  writeAuditLog(process.env, {
    blocked: true,
    event: 'preToolUse',
    ts: new Date().toISOString(),
    ...audit,
  });

  return done({
    agent_message: message,
    permission: 'deny',
    user_message: message,
  });
};

const toolInput = (event) =>
  event?.tool_input && typeof event.tool_input === 'object' ?
    event.tool_input
  : {};

const proposedFilePath = (event, cwd) => {
  const input = toolInput(event);
  const raw =
    input.file_path || input.path || input.target_file || event?.file_path;
  const candidate =
    typeof raw === 'string' && raw.trim() ?
      raw
    : shellWriteDestination(shellCommand(input));
  if (typeof candidate !== 'string' || !candidate.trim()) return '';

  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
};

const proposedContent = (event, cwd, filePath) => {
  const input = toolInput(event);

  for (const key of ['content', 'streamContent', 'text']) {
    if (typeof input[key] === 'string') return input[key];
  }

  const editProjection = projectedEditContent(input, filePath, cwd);
  if (editProjection !== undefined) return editProjection;

  if (hasFragmentEditContent(input)) {
    return {skipped: 'fragment-only-edit'};
  }

  const command = shellCommand(input);
  const pythonContent = shellPythonWriteContent(command);
  if (pythonContent) return pythonContent;
  const shellContent = shellHereDocumentContent(command);
  if (shellContent) return shellContent;
  const copiedContent = shellCopiedFileContent(command, cwd);
  if (copiedContent) return copiedContent;

  return '';
};

const hasFragmentEditContent = (input) => {
  if (!input || typeof input !== 'object') return false;

  if (
    typeof input.new_string === 'string' ||
    typeof input.newString === 'string' ||
    typeof input.new_str === 'string' ||
    typeof input.replacement === 'string'
  ) {
    return true;
  }

  return (
    Array.isArray(input.edits) &&
    input.edits.some((edit) => edit && typeof edit === 'object')
  );
};

const projectedEditContent = (input, filePath, cwd) => {
  if (!filePath) return undefined;
  const singleOld = firstString(input, [
    'old_string',
    'oldString',
    'old_str',
    'target',
  ]);
  const singleNew = firstString(input, [
    'new_string',
    'newString',
    'new_str',
    'replacement',
  ]);

  if (singleOld !== undefined || singleNew !== undefined) {
    if (singleOld === undefined || singleNew === undefined)
      return {skipped: 'fragment-only-edit'};
    const original = readExistingProjectFile(filePath, cwd);
    if (original === null) return {skipped: 'edit-original-unreadable'};
    const projected = replaceOnce(original, singleOld, singleNew);

    return projected === null ?
        {skipped: 'edit-old-string-missing'}
      : projected;
  }

  if (!Array.isArray(input.edits)) return undefined;
  const original = readExistingProjectFile(filePath, cwd);
  if (original === null) return {skipped: 'edit-original-unreadable'};

  let projected = original;

  for (const edit of input.edits) {
    if (!edit || typeof edit !== 'object')
      return {skipped: 'fragment-only-edit'};
    const oldString = firstString(edit, [
      'old_string',
      'oldString',
      'old_str',
      'target',
    ]);
    const newString = firstString(edit, [
      'new_string',
      'newString',
      'new_str',
      'replacement',
    ]);
    if (oldString === undefined || newString === undefined)
      return {skipped: 'fragment-only-edit'};
    const next = replaceOnce(projected, oldString, newString);
    if (next === null) return {skipped: 'edit-old-string-missing'};
    projected = next;
  }

  return projected;
};

const firstString = (obj, keys) => {
  for (const key of keys) {
    if (typeof obj?.[key] === 'string') return obj[key];
  }

  return undefined;
};

const replaceOnce = (original, oldString, newString) => {
  if (oldString === '') return null;
  const index = original.indexOf(oldString);
  if (index === -1) return null;

  return `${original.slice(0, index)}${newString}${original.slice(index + oldString.length)}`;
};

const readExistingProjectFile = (filePath, cwd) => {
  if (!isInsideProject(filePath, cwd)) return null;
  if (SENSITIVE_PATH.test(filePath) || GENERATED_PATH.test(filePath))
    return null;

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;

    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
};

const shellCommand = (input) => {
  if (typeof input.command === 'string') return input.command;
  if (input.args && typeof input.args.command === 'string')
    return input.args.command;

  return '';
};

const shellRedirectPath = (command) => {
  if (!command || typeof command !== 'string') return '';
  const match = command.match(
    /(?:^|[\s;&|])(?:>>?|1>>?)\s*(?:"([^"]+)"|'([^']+)'|([^<>\s]+))/
  );

  return (match?.[1] || match?.[2] || match?.[3] || '').trim();
};

const shellWriteDestination = (command) =>
  shellRedirectPath(command) ||
  shellTeeDestination(command) ||
  shellCopyPaths(command)?.dest ||
  shellPythonWriteDestination(command) ||
  '';

const shellPythonWriteDestination = (command) => {
  if (!/\bpython(?:3)?\b/.test(command || '')) return '';
  const directPath = firstMatch(
    command,
    /(?:^|[^\w.])(?:pathlib\.)?Path\(\s*(["'])(.*?)\1\s*\)\s*\.write_text\s*\(/
  );
  if (directPath) return directPath;

  const pathsByVariable = new Map();
  const assignmentRe =
    /\b([A-Za-z_]\w*)\s*=\s*(?:pathlib\.)?Path\(\s*(["'])(.*?)\2\s*\)/g;
  let assignment;

  while ((assignment = assignmentRe.exec(command))) {
    pathsByVariable.set(assignment[1], assignment[3]);
  }

  const writeVariableRe = /\b([A-Za-z_]\w*)\.write_text\s*\(/g;
  let writeVariable;

  while ((writeVariable = writeVariableRe.exec(command))) {
    const candidate = pathsByVariable.get(writeVariable[1]);
    if (candidate) return candidate;
  }

  return firstMatch(
    command,
    /\bopen\(\s*(["'])(.*?)\1\s*,\s*(["'])[wax](?:\+)?b?\3/
  );
};

const firstMatch = (value, re) => {
  const match = String(value || '').match(re);

  return (match?.[2] || '').trim();
};

const shellTeeDestination = (command) => {
  const words = shellWords(command);
  const teeIndex = words.findIndex((word) => path.basename(word) === 'tee');
  if (teeIndex === -1) return '';

  for (const word of words.slice(teeIndex + 1)) {
    if (['&&', ';', '|', '||'].includes(word)) break;
    if (word === '--') continue;
    if (word.startsWith('-')) continue;

    return word;
  }

  return '';
};

const shellCopiedFileContent = (command, cwd) => {
  const source = shellCopyPaths(command)?.source;
  if (!source) return '';
  const sourcePath =
    path.isAbsolute(source) ? source : path.resolve(cwd, source);
  if (!isInsideProject(sourcePath, cwd)) return '';
  if (SENSITIVE_PATH.test(sourcePath) || GENERATED_PATH.test(sourcePath))
    return '';

  try {
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return '';

    return fs.readFileSync(sourcePath, 'utf-8');
  } catch {
    return '';
  }
};

const shellCopyPaths = (command) => {
  const words = shellWords(command);
  if (words.length < 3 || path.basename(words[0]) !== 'cp') return null;
  const args = [];

  for (const word of words.slice(1)) {
    if (['&&', ';', '|', '||'].includes(word)) break;
    if (word === '--') continue;
    if (word.startsWith('-')) continue;
    args.push(word);
  }
  if (args.length < 2) return null;

  return {dest: args.at(-1), source: args.at(-2)};
};

const shellWords = (command) => {
  if (!command || typeof command !== 'string') return [];
  const words = [];
  const re = /"((?:\\"|[^"])*)"|'((?:\\'|[^'])*)'|([^\s]+)/g;
  let match;

  while ((match = re.exec(command))) {
    words.push(
      (match[1] ?? match[2] ?? match[3] ?? '').replaceAll(/\\(["'])/g, '$1')
    );
  }

  return words;
};

const shellHereDocumentContent = (command) => {
  if (!command || typeof command !== 'string') return '';
  const markerMatch = command.match(
    /<<-?\s*['"]?([A-Za-z0-9_.-]+)['"]?[^\r\n]*\r?\n/
  );
  if (!markerMatch) return '';
  const marker = markerMatch[1];
  const start = (markerMatch.index || 0) + markerMatch[0].length;
  const rest = command.slice(start);
  const endRe = new RegExp(String.raw`\r?\n${escapeRegExp(marker)}(?:\r?\n|$)`);
  const end = rest.search(endRe);

  return end >= 0 ? rest.slice(0, end) : '';
};

const shellPythonWriteContent = (command) => {
  if (!/\bpython(?:3)?\b/.test(command || '')) return '';
  const script = shellHereDocumentContent(command) || command;

  return (
    pythonStringArgument(script, /\.write_text\s*\(\s*/g) ||
    pythonStringArgument(script, /\.write\s*\(\s*/g)
  );
};

const pythonStringArgument = (script, prefixRe) => {
  let prefix;

  while ((prefix = prefixRe.exec(script))) {
    const start = prefixRe.lastIndex;
    const triple = script.slice(start, start + 3);

    if (triple === "'''" || triple === '"""') {
      const end = script.indexOf(triple, start + 3);
      if (end !== -1) return script.slice(start + 3, end);
      continue;
    }
    const quote = script[start];
    if (quote !== '"' && quote !== "'") continue;
    let out = '';

    for (let index = start + 1; index < script.length; index++) {
      const ch = script[index];

      if (ch === '\\') {
        out += script[index + 1] || '';
        index += 1;
      } else if (ch === quote) {
        return out;
      } else {
        out += ch;
      }
    }
  }

  return '';
};

const escapeRegExp = (value) =>
  String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const relativePath = (filePath, cwd) => {
  try {
    const rel = path.relative(cwd, filePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return filePath;

    return rel.split(path.sep).join('/');
  } catch {
    return filePath;
  }
};

const isInsideProject = (filePath, cwd) => {
  try {
    const rel = path.relative(cwd, filePath);

    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
};

// The static HTML engine reads its input from disk, but preToolUse only has
// the proposed content. Stage it in a temp file so html-engine targets get the
// same DOM-structural rules pre-write that runHook applies post-edit.
const detectProposedHtml = async (detector, content, filePath, scanOptions) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-pre-'));
  const temporaryFile = path.join(dir, path.basename(filePath));

  try {
    fs.writeFileSync(temporaryFile, content);
    const findings = await detector.detectHtml(temporaryFile, scanOptions);

    // Findings carry the temp path; remap so file-scoped ignores still match.
    return (findings || []).map((f) =>
      f && typeof f === 'object' ? {...f, file: filePath} : f
    );
  } finally {
    fs.rmSync(dir, {force: true, recursive: true});
  }
};

const cursorBlockMessage = (findings, filePath, config, cwd) => {
  const rendered = renderTemplate(findings, filePath, config, {cwd});
  const blocked = rendered.replace(
    '[impeccable@1] Design hook findings requiring review',
    '[impeccable@1] Impeccable design hook blocked this write before it landed. Design hook findings requiring review'
  );

  return blocked.length > 4000 ?
      `${blocked.slice(0, 3984)}\n...(truncated)`
    : blocked;
};

const findingSignature = (findings) =>
  findings
    .map(
      (finding) => `${finding.antipattern || 'unknown'}:${finding.line || 0}`
    )
    .sort()
    .join('|');

const bumpCursorDenial = (cache, sessionId, filePath, findings) => {
  const session = cache.sessions[sessionId] || {
    files: {},
    updatedAt: Date.now(),
  };
  cache.sessions[sessionId] = session;
  session.updatedAt = Date.now();
  const fileEntry = session.files[filePath] || {editCount: 0, findings: []};
  session.files[filePath] = fileEntry;
  const key = findingSignature(findings);
  fileEntry.cursorDenials =
    fileEntry.cursorDenials && typeof fileEntry.cursorDenials === 'object' ?
      fileEntry.cursorDenials
    : {};
  fileEntry.cursorDenials[key] = (fileEntry.cursorDenials[key] || 0) + 1;

  return {count: fileEntry.cursorDenials[key], key};
};

const main = async () => {
  if (truthy(process.env.IMPECCABLE_HOOK_DISABLED)) {
    return allow({skipped: 'env-disabled'});
  }

  let event = null;

  try {
    const raw = await readStdin();
    if (raw) event = JSON.parse(raw);
  } catch {
    return allow({skipped: 'stdin-malformed'});
  }

  if (!event || typeof event !== 'object') {
    return allow({skipped: 'stdin-empty'});
  }

  const sessionCwd = resolveProjectCwd(event);
  const started = Date.now();
  const filePath = proposedFilePath(event, sessionCwd);
  // Re-key config/cache to the edited file's project root when the session
  // was launched from a non-project umbrella directory (issue #305).
  const cwd = resolveCacheCwd(filePath, sessionCwd);
  const audit = {
    cwd,
    file: filePath || null,
    harness: 'cursor',
    tool: event.tool_name || null,
  };

  if (!filePath)
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'no-file-path',
    });
  if (!isInsideProject(filePath, cwd))
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'outside-project',
    });
  if (SENSITIVE_PATH.test(filePath))
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'sensitive',
    });
  if (GENERATED_PATH.test(filePath))
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'generated',
    });

  // Config is read before the extension gate so `detector.extensions` entries
  // (e.g. `.blade.php` template files, issue #316) can widen it.
  const config = readConfig(cwd);
  const extension = path.extname(filePath).toLowerCase();
  const configuredExtension = matchConfiguredExtension(
    filePath,
    config.extensions
  );
  audit.ext = configuredExtension ? configuredExtension.ext : extension;
  if (!ALLOWED_EXTS.has(extension) && !configuredExtension)
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'extension',
    });

  const contentResult = proposedContent(event, cwd, filePath);

  if (
    contentResult &&
    typeof contentResult === 'object' &&
    contentResult.skipped
  ) {
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: contentResult.skipped,
    });
  }
  const content = typeof contentResult === 'string' ? contentResult : '';
  if (!content)
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'no-proposed-content',
    });

  if (config.enabled === false)
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'config-disabled',
    });

  const rel = relativePath(filePath, cwd);

  if (
    matchesAnyGlob(rel, config.ignoreFiles) ||
    matchesAnyGlob(filePath, config.ignoreFiles)
  ) {
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'config-ignore-file',
    });
  }

  const detector = await loadDetector();

  if (!detector || typeof detector.detectText !== 'function') {
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      skipped: 'detector-missing',
    });
  }
  const scanOptions = designSystemOptions(config, detector, cwd);

  // Mirror runHook's engine routing so template issues the HTML engine catches
  // post-edit cannot slip past the pre-write gate.
  const useHtmlEngine =
    configuredExtension ?
      configuredExtension.engine === 'html'
    : extension === '.html' || extension === '.htm';
  let findings = [];

  try {
    findings =
      useHtmlEngine && typeof detector.detectHtml === 'function' ?
        await detectProposedHtml(detector, content, filePath, scanOptions)
      : await detector.detectText(content, filePath, scanOptions);
  } catch {
    return allow({
      ...audit,
      durationMs: Date.now() - started,
      error: 'detector-threw',
    });
  }

  const filtered = filterFindings(findings || [], content, extension, config);

  if (filtered.length === 0) {
    return allow({
      ...audit,
      blockedFindings: 0,
      durationMs: Date.now() - started,
      findings: (findings || []).length,
    });
  }

  const message = appendDesignSystemNote(
    cursorBlockMessage(filtered, filePath, config, cwd),
    scanOptions
  );
  const sessionId = event.session_id || event.conversation_id || 'unknown';
  const cache = readCache(cwd);
  const denial = bumpCursorDenial(cache, sessionId, filePath, filtered);
  persistCache(cwd, cache);

  if (denial.count > EDIT_COUNT_THRESHOLD) {
    const warning = `${message}\n\nThis is the ${denial.count}th repeated denial for the same file and finding signature, so Impeccable is allowing this write to avoid a loop. Reconsider the issue immediately after the tool runs.`;

    return allow(
      {
        ...audit,
        blockedFindings: filtered.length,
        chars: warning.length,
        cursorDenialCount: denial.count,
        cursorDenialKey: denial.key,
        downgraded: true,
        durationMs: Date.now() - started,
        findings: (findings || []).length,
      },
      {
        agent_message: warning,
        user_message: warning,
      }
    );
  }

  return deny(message, {
    ...audit,
    blockedFindings: filtered.length,
    chars: message.length,
    cursorDenialCount: denial.count,
    cursorDenialKey: denial.key,
    durationMs: Date.now() - started,
    findings: (findings || []).length,
  });
};

main().catch((error) => {
  if (process.env.IMPECCABLE_HOOK_DEBUG) {
    process.stderr.write(`[impeccable-hook-before-edit] ${error}\n`);
  }
  done({permission: 'allow'});
});
