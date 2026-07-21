/**
 * CLI helper: insert/remove the live variant mode script tag in the project's
 * main HTML entry point.
 *
 * On first live run, the agent generates `.impeccable/live/config.json`
 * with the project's insertion target (framework-specific). On
 * every subsequent run, this script handles insert/remove deterministically
 * with zero LLM involvement.
 *
 * Usage:
 *   node live-inject.mjs --port PORT   # Insert the live script tag
 *   node live-inject.mjs --remove      # Remove the live script tag
 *   node live-inject.mjs --check       # Check whether live config exists
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveLiveConfigPath} from './lib/impeccable-paths.mjs';
import {
  applySvelteKitLiveAdapter,
  detectSvelteKitProject,
  removeSvelteKitLiveAdapter,
} from './live/sveltekit-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolveLiveConfigPath({
  cwd: process.cwd(),
  scriptsDir: __dirname,
});
const MARKER_OPEN_TEXT = 'impeccable-live-start';
const MARKER_CLOSE_TEXT = 'impeccable-live-end';
const IGNORE_MARKER_OPEN = '# impeccable-live-ignore-start';
const IGNORE_MARKER_CLOSE = '# impeccable-live-ignore-end';

export const LIVE_IGNORE_PATTERNS = Object.freeze([
  '.impeccable/hook.cache.json',
  '.impeccable/hook.pending.json',
  '.impeccable/config.local.json',
  '.impeccable/live/server.json',
  '.impeccable/live/sessions/',
  '.impeccable/live/previews/',
  '.impeccable/live/annotations/',
  '.impeccable/live/cache/',
  '.impeccable/live/manual-edit-apply-transaction.json',
  '.impeccable/live/manual-edit-events.jsonl',
  '.impeccable/live/manual-edit-evidence/',
  '.impeccable/live/pending-manual-edits.json',
  '.impeccable/live/deferred-svelte-component-accepts.json',
  '.impeccable-live.json',
  '.impeccable-live/',
  'node_modules/.impeccable-live/',
  'src/lib/impeccable/ImpeccableLiveRoot.svelte',
  'src/lib/impeccable/__runtime.js',
  'src/lib/impeccable/[0-9a-f]*/',
]);

/**
 * Hard-excluded directory patterns. These are NEVER user-facing pages and
 * matching them would silently inject tracking scripts into third-party
 * code. The user cannot turn these off via config — they are the floor.
 */
const HARD_EXCLUDES = ['**/node_modules/**', '**/.git/**'];

export const ensureLiveGitIgnores = (cwd = process.cwd()) => {
  const target = resolveIgnoreTarget(cwd);
  const existing =
    fs.existsSync(target.path) ? fs.readFileSync(target.path, 'utf-8') : '';
  const block = [
    IGNORE_MARKER_OPEN,
    ...LIVE_IGNORE_PATTERNS,
    IGNORE_MARKER_CLOSE,
  ].join('\n');
  const markerRe = new RegExp(
    String.raw`${escapeRegExp(IGNORE_MARKER_OPEN)}[\s\S]*?${escapeRegExp(IGNORE_MARKER_CLOSE)}`
  );

  let updated;

  if (markerRe.test(existing)) {
    updated = existing.replace(markerRe, block);
  } else {
    const prefix =
      existing.length === 0 ? ''
      : existing.endsWith('\n') ? existing
      : `${existing}\n`;
    updated = `${prefix}${prefix.endsWith('\n\n') || prefix === '' ? '' : '\n'}${block}\n`;
  }

  if (updated !== existing) {
    fs.mkdirSync(path.dirname(target.path), {recursive: true});
    fs.writeFileSync(target.path, updated, 'utf-8');
  }

  return {
    changed: updated !== existing,
    file: path.relative(cwd, target.path).split(path.sep).join('/'),
    mode: target.mode,
    patterns: [...LIVE_IGNORE_PATTERNS],
  };
};

export const injectCli = async () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node live-inject.mjs [options]

Insert or remove the live mode script tag in the project's HTML entry point.
Reads configuration from .impeccable/live/config.json.

Modes:
  --port PORT   Insert script tag pointing at http://localhost:PORT/live.js
  --remove      Remove the script tag (if present)
  --check       Print whether .impeccable/live/config.json exists and its content

Output (JSON):
  { ok, file, inserted|removed, config? }`);
    process.exit(0);
  }

  if (args.includes('--check')) {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.log(
        JSON.stringify({error: 'config_missing', ok: false, path: CONFIG_PATH})
      );
      process.exit(0);
    }
    let cfg;

    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: 'config_invalid',
          message: error.message,
          ok: false,
          path: CONFIG_PATH,
        })
      );

      return;
    }

    try {
      validateConfig(cfg);
    } catch (error) {
      console.log(
        JSON.stringify({
          error: 'config_invalid',
          message: error.message,
          ok: false,
          path: CONFIG_PATH,
        })
      );

      return;
    }
    console.log(JSON.stringify({config: cfg, ok: true, path: CONFIG_PATH}));

    return;
  }

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      JSON.stringify({error: 'config_missing', ok: false, path: CONFIG_PATH})
    );
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  validateConfig(config);

  const resolvedFiles = resolveFiles(process.cwd(), config);
  const svelteKit = detectSvelteKitProject(process.cwd(), config);

  if (args.includes('--remove')) {
    if (svelteKit) {
      const adapterResult = removeSvelteKitLiveAdapter({
        config,
        cwd: process.cwd(),
      });
      console.log(
        JSON.stringify({
          adapter: 'sveltekit',
          ok: true,
          results: [adapterResult],
        })
      );

      return;
    }
    const results = resolvedFiles.map((relFile) => {
      const absFile = path.resolve(process.cwd(), relFile);
      if (!fs.existsSync(absFile))
        return {error: 'file_not_found', file: relFile};
      const content = fs.readFileSync(absFile, 'utf-8');
      const detagged = removeTag(content, config.commentSyntax);
      const updated = revertCspMeta(detagged);
      if (updated === content)
        return {file: relFile, note: 'no tag present', removed: false};
      fs.writeFileSync(absFile, updated, 'utf-8');

      return {
        cspReverted: updated !== detagged,
        file: relFile,
        removed: detagged !== content,
      };
    });
    console.log(JSON.stringify({ok: true, results}));

    return;
  }

  // Insert mode — need --port
  const portIndex = args.indexOf('--port');
  const port =
    portIndex === -1 ? Number.NaN : Number.parseInt(args[portIndex + 1], 10);

  if (!Number.isFinite(port)) {
    console.error(JSON.stringify({error: 'missing_port', ok: false}));
    process.exit(1);
  }
  const gitIgnore = ensureLiveGitIgnores(process.cwd());

  if (svelteKit) {
    const adapterResult = applySvelteKitLiveAdapter({
      config,
      cwd: process.cwd(),
      port,
    });
    console.log(
      JSON.stringify({
        adapter: 'sveltekit',
        gitIgnore,
        ok: true,
        port,
        results: [adapterResult],
      })
    );

    return;
  }

  const results = resolvedFiles.map((relFile) => {
    const absFile = path.resolve(process.cwd(), relFile);
    if (!fs.existsSync(absFile))
      return {error: 'file_not_found', file: relFile};
    const content = fs.readFileSync(absFile, 'utf-8');
    const withoutOld = revertCspMeta(removeTag(content, config.commentSyntax));
    const withTag = insertTag(withoutOld, config, port, relFile);

    if (withTag === withoutOld) {
      return {
        anchor: config.insertBefore || config.insertAfter,
        error: 'insertion_point_not_found',
        file: relFile,
      };
    }
    const updated = patchCspMeta(withTag, port);
    fs.writeFileSync(absFile, updated, 'utf-8');

    return {
      cspPatched: updated !== withTag,
      file: relFile,
      inserted: true,
    };
  });
  const anyInserted = results.some((r) => r.inserted);
  console.log(JSON.stringify({gitIgnore, ok: anyInserted, port, results}));
  if (!anyInserted) process.exit(1);
};

/**
 * Expand config.files (which may contain glob patterns) into a literal list
 * of existing file paths relative to rootDir. Literal entries pass through;
 * glob patterns are expanded via fs.globSync. HARD_EXCLUDES and config.exclude
 * are applied as filters. Duplicates are removed. Order is preserved by
 * first appearance.
 */
export const resolveFiles = (rootDir, config) => {
  const patterns = config.files;
  const userExcludes = Array.isArray(config.exclude) ? config.exclude : [];
  const allExcludes = [...HARD_EXCLUDES, ...userExcludes];
  const excludeRegexes = allExcludes.map(globToRegex);

  const isExcluded = (relPath) => excludeRegexes.some((re) => re.test(relPath));
  const isGlob = (s) => /[*?[]/.test(s);

  const seen = new Set();
  const out = [];

  for (const pat of patterns) {
    if (!isGlob(pat)) {
      // Literal path — include even if it doesn't exist yet; the caller
      // reports file_not_found per-entry. Exclude list doesn't apply to
      // explicit literal entries (user named it on purpose).
      if (!seen.has(pat)) {
        seen.add(pat);
        out.push(pat);
      }
      continue;
    }
    let matches;

    try {
      matches = fs.globSync(pat, {cwd: rootDir, withFileTypes: true});
    } catch {
      continue;
    }

    for (const ent of matches) {
      if (!ent.isFile || !ent.isFile()) continue;
      const abs = path.join(ent.parentPath || ent.path || rootDir, ent.name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      if (isExcluded(rel)) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      out.push(rel);
    }
  }

  return out;
};

const buildTagBlock = (syntax, port, filePath) => {
  const open = commentOpen(syntax);
  const close = commentClose(syntax);
  // Astro processes <script> tags by default and rewrites src to its own
  // bundled URL. is:inline opts out so the literal external src survives.
  const isAstro = typeof filePath === 'string' && filePath.endsWith('.astro');
  const scriptAttributes = isAstro ? 'is:inline ' : '';

  return (
    `${open} ${MARKER_OPEN_TEXT} ${close}\n` +
    `<script ${scriptAttributes}src="http://localhost:${port}/live.js"></script>\n${
      open
    } ${MARKER_CLOSE_TEXT} ${close}\n`
  );
};

const commentClose = (syntax) => (syntax === 'jsx' ? '*/}' : '-->');

const commentOpen = (syntax) => (syntax === 'jsx' ? '{/*' : '<!--');

const detectLineEnding = (content) => {
  if (content.includes('\r\n')) return '\r\n';
  if (content.includes('\r')) return '\r';

  return '\n';
};

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

const escapeRegExp = (value) =>
  String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Convert a glob pattern to a RegExp. Supports:
 *   **  → any number of path segments (including zero)
 *   *   → any chars except `/`
 *   ?   → any single char except `/`
 * Paths are normalized to forward slashes before matching.
 */
const globToRegex = (pattern) => {
  let re = '';
  let index = 0;

  while (index < pattern.length) {
    const c = pattern[index];

    if (c === '*') {
      if (pattern[index + 1] === '*') {
        // ** — any number of segments, including zero. Handle the common
        // **/ and /** forms so `a/**/b` matches `a/b` as well as `a/x/y/b`.
        if (pattern[index + 2] === '/') {
          re += '(?:.*/)?';
          index += 3;
        } else {
          re += '.*';
          index += 2;
        }
      } else {
        re += '[^/]*';
        index += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      index += 1;
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`;
      index += 1;
    } else {
      re += c;
      index += 1;
    }
  }

  return new RegExp(`^${re}$`);
};

const insertTag = (content, config, port, filePath) => {
  const lineEnding = detectLineEnding(content);
  const block = normalizeLineEndings(
    buildTagBlock(config.commentSyntax, port, filePath),
    lineEnding
  );

  // insertBefore: match the LAST occurrence. Anchors like `</body>` naturally
  // belong at the end, and the same literal can appear earlier in code blocks
  // within rendered documentation pages.
  if (config.insertBefore) {
    const index = content.lastIndexOf(config.insertBefore);
    if (index === -1) return content;

    return content.slice(0, index) + block + content.slice(index);
  }
  // insertAfter: match the FIRST occurrence — typical anchors like `<head>` or
  // `<body>` open near the top of the document.
  const index = content.indexOf(config.insertAfter);
  if (index === -1) return content;
  const after = index + config.insertAfter.length;
  // Preserve an existing trailing newline if the anchor already has one.
  // Slice the remainder from the original anchor offset, not prefix.length:
  // in the no-newline case prefix is one char longer than the anchor (the
  // appended '\n'), so slicing by prefix.length would drop the first real
  // character after the anchor (#227).
  const existingNewline = readLineEndingAt(content, after);
  const prefix = content.slice(0, after) + (existingNewline || lineEnding);
  const rest = content.slice(after + existingNewline.length);

  return prefix + block + rest;
};

const normalizeLineEndings = (content, lineEnding) =>
  lineEnding === '\n' ? content : content.replaceAll('\n', lineEnding);

const readLineEndingAt = (content, index) => {
  if (content[index] === '\r' && content[index + 1] === '\n') return '\r\n';
  if (content[index] === '\n') return '\n';
  if (content[index] === '\r') return '\r';

  return '';
};

/**
 * Remove the live script block. Matches either HTML or JSX comment markers
 * regardless of config (so stale tags from a wrong config can still be cleaned).
 *
 * Indent-preserving: captures any whitespace immediately preceding the opener
 * marker and re-emits it in place of the removed block. `insertTag` inserted
 * the block *after* the original line's indent and *before* the anchor (e.g.
 * `</body>`), which moved the indent onto the opener line and left the anchor
 * unindented. Replacing the whole block (plus its trailing newline) with just
 * the captured indent hands the indent back to the anchor that follows.
 */
const removeTag = (content, _syntax) => {
  const patterns = [
    /([ \t]*)<!--\s*impeccable-live-start\s*-->[\s\S]*?<!--\s*impeccable-live-end\s*-->([ \t]*(?:\r\n|\n|\r|$)?)/,
    /([ \t]*)\{\/\*\s*impeccable-live-start\s*\*\/\}[\s\S]*?\{\/\*\s*impeccable-live-end\s*\*\/\}([ \t]*(?:\r\n|\n|\r|$)?)/,
  ];

  for (const pat of patterns) {
    let changed = false;
    let next = content;

    do {
      content = next;
      next = content.replace(pat, (_match, leadingIndent, trailing = '') => {
        if (/[\r\n]/.test(trailing)) return leadingIndent;

        return leadingIndent || trailing || '';
      });
      if (next !== content) changed = true;
    } while (next !== content);
    if (changed) return next;
  }

  return content;
};

const resolveGitInfoExcludePath = (cwd) => {
  const dotGit = path.join(cwd, '.git');
  if (!fs.existsSync(dotGit)) return null;

  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return path.join(dotGit, 'info', 'exclude');
  if (!stat.isFile()) return null;

  const body = fs.readFileSync(dotGit, 'utf-8').trim();
  const match = body.match(/^gitdir:\s*(.+)$/i);
  if (!match) return null;
  const gitDir =
    path.isAbsolute(match[1]) ? match[1] : path.resolve(cwd, match[1]);

  return path.join(gitDir, 'info', 'exclude');
};

const resolveIgnoreTarget = (cwd) => {
  const gitExcludePath = resolveGitInfoExcludePath(cwd);

  if (gitExcludePath) {
    return {mode: 'git-info-exclude', path: gitExcludePath};
  }

  return {mode: 'gitignore', path: path.join(cwd, '.gitignore')};
};

const validateConfig = (cfg) => {
  if (!cfg || typeof cfg !== 'object')
    throw new Error('config.json must be an object');

  if (!Array.isArray(cfg.files) || cfg.files.length === 0) {
    throw new Error('config.files (non-empty string array) required');
  }

  if (!cfg.files.every((f) => typeof f === 'string' && f.length > 0)) {
    throw new Error('config.files must contain only non-empty strings');
  }

  if (cfg.exclude !== undefined) {
    if (!Array.isArray(cfg.exclude)) {
      throw new TypeError('config.exclude, if present, must be a string array');
    }

    if (!cfg.exclude.every((f) => typeof f === 'string' && f.length > 0)) {
      throw new Error('config.exclude must contain only non-empty strings');
    }
  }

  if (
    typeof cfg.insertBefore !== 'string' &&
    typeof cfg.insertAfter !== 'string'
  ) {
    throw new TypeError(
      'config.insertBefore or config.insertAfter (string) required'
    );
  }

  if (cfg.commentSyntax !== 'html' && cfg.commentSyntax !== 'jsx') {
    throw new Error("config.commentSyntax must be 'html' or 'jsx'");
  }

  if (cfg.cspChecked !== undefined && typeof cfg.cspChecked !== 'boolean') {
    throw new Error('config.cspChecked, if present, must be a boolean');
  }
};

// ---------------------------------------------------------------------------
// Content-Security-Policy meta-tag patcher
//
// When the user's HTML carries `<meta http-equiv="Content-Security-Policy">`,
// the cross-origin load of /live.js (and the SSE/POST connection back to
// localhost:PORT) is blocked unless the CSP explicitly allows that origin.
//
// On insert: append `http://localhost:PORT` to `script-src` and `connect-src`,
// and stash the original `content` value in a `data-impeccable-csp-original`
// attribute (base64) so revert is exact.
//
// On remove: detect the marker attribute, decode it, restore the original
// content value verbatim, drop the marker.
//
// Header-based CSP (Next.js headers, Nuxt routeRules, SvelteKit kit.csp,
// shared helpers) is NOT patched here — those need framework-specific config
// edits and are handled via the existing detect-csp.mjs reference output.
// Only the in-source meta-tag form gets the auto-patch.
// ---------------------------------------------------------------------------

const CSP_MARKER_ATTR = 'data-impeccable-csp-original';

export const patchCspMeta = (content, port) => {
  const tags = findCspMetaTags(content);
  if (tags.length === 0) return content;
  const origin = `http://localhost:${port}`;

  // Walk last-to-first so prior splices don't invalidate later indices.
  let result = content;

  for (let index = tags.length - 1; index >= 0; index--) {
    const tag = tags[index];
    const {attrs} = tag;
    if (getAttribute(attrs, CSP_MARKER_ATTR)) continue; // already patched
    const contentAttribute = getAttribute(attrs, 'content');
    if (!contentAttribute) continue;

    const original = contentAttribute.value;
    let patched = original;
    patched = appendOriginToDirective(patched, 'script-src', origin);
    patched = appendOriginToDirective(patched, 'connect-src', origin);
    // The shader overlay during 'generating' creates a screenshot via
    // URL.createObjectURL, producing a `blob:` URL — img-src 'self' rejects
    // those. Add `blob:` so the overlay doesn't throw a CSP violation.
    patched = appendOriginToDirective(patched, 'img-src', 'blob:');
    if (patched === original) continue;

    const newContentAttribute = `content=${contentAttribute.quote}${patched}${contentAttribute.quote}`;
    const marker = `${CSP_MARKER_ATTR}="${Buffer.from(original, 'utf-8').toString('base64')}"`;
    // The tagRe captures any whitespace between the last attribute and the
    // closing `/>` as part of `attrs`. Naively appending ` ${marker}` after
    // a replace would land it BEFORE that trailing space, leaving a double
    // space inside attrs and clobbering the space before `/>`. Split off
    // the trailing whitespace, splice the marker into the attribute body,
    // and re-append the original trailing whitespace so a self-closing
    // `<meta … />` round-trips byte-for-byte.
    const trailingWs = (attrs.match(/[ \t]*$/) || [''])[0];
    const attributesBody = attrs.slice(0, attrs.length - trailingWs.length);
    const newAttributes = `${attributesBody.replace(
      contentAttribute.full,
      newContentAttribute
    )} ${marker}${trailingWs}`;
    const newTag = tag.full.replace(attrs, newAttributes);

    result = result.slice(0, tag.start) + newTag + result.slice(tag.end);
  }

  return result;
};

export const revertCspMeta = (content) => {
  const tags = findCspMetaTags(content);
  if (tags.length === 0) return content;

  let result = content;

  for (let index = tags.length - 1; index >= 0; index--) {
    const tag = tags[index];
    const origAttribute = getAttribute(tag.attrs, CSP_MARKER_ATTR);
    if (!origAttribute) continue;
    const contentAttribute = getAttribute(tag.attrs, 'content');
    if (!contentAttribute) continue;

    let originalValue;

    try {
      originalValue = Buffer.from(origAttribute.value, 'base64').toString(
        'utf-8'
      );
    } catch {
      continue;
    }

    const newContentAttribute = `content=${contentAttribute.quote}${originalValue}${contentAttribute.quote}`;
    let newAttributes = tag.attrs.replace(
      contentAttribute.full,
      newContentAttribute
    );
    // Drop the marker attribute and any single space immediately preceding it.
    newAttributes = newAttributes.replace(
      new RegExp(String.raw`\s*${origAttribute.full}`),
      ''
    );
    const newTag = tag.full.replace(tag.attrs, newAttributes);

    result = result.slice(0, tag.start) + newTag + result.slice(tag.end);
  }

  return result;
};

const appendOriginToDirective = (csp, directive, origin) => {
  const re = new RegExp(String.raw`(^|;)(\s*)(${directive})\s+([^;]*)`, 'i');
  const m = csp.match(re);

  if (m) {
    const tokens = m[4].trim().split(/\s+/);
    if (tokens.includes(origin)) return csp;

    return csp.replace(
      re,
      `${m[1]}${m[2]}${m[3]} ${[...tokens, origin].join(' ')}`
    );
  }

  // Directive missing — add it. Use 'self' + origin so we don't inadvertently
  // narrow the policy compared to the default-src fallback (most users with
  // an explicit CSP have 'self' there).
  return `${csp.trim().replace(/;?\s*$/, '')}; ${directive} 'self' ${origin}`;
};

const findCspMetaTags = (content) => {
  const out = [];
  const tagRe = /<meta\s+([^>]*?)\/?>/gis;
  let m;

  while ((m = tagRe.exec(content)) !== null) {
    const attributes = m[1];
    if (
      !/(http-equiv|httpEquiv)\s*=\s*(['"])Content-Security-Policy\2/i.test(
        attributes
      )
    )
      continue;
    out.push({
      attrs: attributes,
      end: m.index + m[0].length,
      full: m[0],
      start: m.index,
    });
  }

  return out;
};

const getAttribute = (attributes, name) => {
  const re = new RegExp(String.raw`\b${name}\s*=\s*(['"])([\s\S]*?)\1`, 'i');
  const m = attributes.match(re);

  return m ? {full: m[0], quote: m[1], value: m[2]} : null;
};

// ---------------------------------------------------------------------------
// Auto-execute
// ---------------------------------------------------------------------------

const _running = process.argv[1];

if (
  _running?.endsWith('live-inject.mjs') ||
  _running?.endsWith('live-inject.mjs/')
) {
  injectCli();
}

export {buildTagBlock, insertTag, removeTag, validateConfig};
// patchCspMeta + revertCspMeta are exported above where they're defined.
