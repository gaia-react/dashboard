/**
 * CLI entry point: prepare everything needed to enter the live variant poll loop.
 *
 * Does (all in one command):
 *   1. Check .impeccable/live/config.json (returns config_missing if first-ever run)
 *   2. Start the live server in the background (or reuse a running one)
 *   3. Inject the browser script tag into the project's entry file
 *   4. Read PRODUCT.md / DESIGN.md for project context
 *   5. Print a single JSON blob with everything the agent needs
 *
 * After this, the agent's only remaining steps are:
 *   - Open the project's live dev/preview URL in the browser (optional, if browser automation exists)—not `serverPort`; that port is the Impeccable helper for /live.js and /poll
 *   - Enter the poll loop: `node live-poll.mjs`
 *
 * Usage:
 *   node live.mjs                   # Prepare everything, print JSON, exit
 *   node live.mjs --help
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadContext, resolveTargetSelection} from './context.mjs';
import {readLiveServerInfo} from './lib/impeccable-paths.mjs';
import {resolveFiles} from './live-inject.mjs';
import {resolveLiveTarget} from './live-target.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const liveCli = async () => {
  const args = process.argv.slice(2);
  const liveTarget = resolveLiveTarget(process.cwd(), args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node live.mjs

Prepare everything for live variant mode in a single command:
  - Checks .impeccable/live/config.json (required, created once per project)
  - Starts (or reuses) the live server in the background
  - Injects the browser script tag
  - Reads PRODUCT.md / DESIGN.md for project context
  - In monorepos, choose a child app first; --target <path> is the fallback/manual path

On success, prints a JSON blob with:
  { ok, serverPort, serverToken, pageFiles, projectRoot, repoRoot, targetPath, productPath, designPath }

On target_selection_required, prints:
  { ok: false, error: "target_selection_required", targetCandidates }

On config_missing, prints:
  { ok: false, error: "config_missing", configPath, hint }

The agent should then:
  1. If target_selection_required, ask which app to use and rerun from that child cwd
  2. If config_missing, create the config and re-run this script
  3. Optionally open the project's dev/preview URL in the browser (see reference/live.md—not serverPort)
  4. Enter the poll loop: node live-poll.mjs`);
    process.exit(0);
  }

  const targetSelection = resolveTargetSelection(
    liveTarget.originalCwd,
    liveTarget.targetOptions
  );

  if (targetSelection) {
    console.log(
      JSON.stringify(
        {
          error: 'target_selection_required',
          ok: false,
          ...targetSelection,
          hint: 'Ask the user which app Impeccable should use, then rerun live from that child app cwd. Use --target <path> only as a fallback or explicit path diagnostic.',
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const ctx = loadContext(liveTarget.originalCwd, liveTarget.targetOptions);
  const activeCwd = ctx.projectRoot;
  const outputTargetPath = liveTarget.targetPath || null;

  const missingContext = missingLiveContext(ctx);

  if (missingContext.length > 0) {
    console.log(
      JSON.stringify(
        {
          designPath: ctx.designPath,
          error: 'context_missing',
          missing: missingContext,
          nextCommand:
            missingContext.includes('PRODUCT.md') ? 'init' : 'document',
          ok: false,
          productPath: ctx.productPath,
          projectRoot: ctx.projectRoot,
          repoRoot: ctx.repoRoot,
          targetPath: outputTargetPath,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  // 1. Check config (fail fast if missing — no point starting anything else)
  const checkOut = runScript('live-inject.mjs', ['--check'], {cwd: activeCwd});
  const checkResult = safeParse(checkOut);

  if (!checkResult || !checkResult.ok) {
    console.log(
      JSON.stringify({
        ...(checkResult || {error: 'check_failed', ok: false, raw: checkOut}),
        projectRoot: ctx.projectRoot,
        repoRoot: ctx.repoRoot,
        targetPath: outputTargetPath,
      })
    );
    process.exit(0);
  }

  // 2. Start server (or reuse existing)
  const serverInfo = ensureServerRunning(activeCwd);

  if (!serverInfo) {
    console.log(JSON.stringify({error: 'server_start_failed', ok: false}));
    process.exit(1);
  }

  // 3. Inject the script tag at the current port
  const injectOut = runScript(
    'live-inject.mjs',
    ['--port', String(serverInfo.port)],
    {cwd: activeCwd}
  );
  const injectResult = safeParse(injectOut);

  if (!injectResult || !injectResult.ok) {
    console.log(
      JSON.stringify({
        detail: injectResult || injectOut,
        error: 'inject_failed',
        ok: false,
        serverPort: serverInfo.port,
      })
    );
    process.exit(1);
  }

  // 4. Compute drift-heal: compare resolved inject targets against the
  //    project's HTML files. Orphans are HTML files not covered by config.
  //    Warning only — the agent decides whether to act.
  const resolvedFiles = resolveFiles(activeCwd, checkResult.config);
  const drift = scanForDrift(activeCwd, resolvedFiles, checkResult.config);

  // 5. Emit everything the agent needs
  console.log(
    JSON.stringify(
      {
        configDrift: drift,
        design: ctx.design,
        designPath: ctx.designPath,
        hasDesign: ctx.hasDesign,
        hasProduct: ctx.hasProduct,
        liveConfigPath: checkResult.path,
        ok: true,
        pageFiles: resolvedFiles,
        product: ctx.product,
        productPath: ctx.productPath,
        projectRoot: ctx.projectRoot,
        repoRoot: ctx.repoRoot,
        serverPort: serverInfo.port,
        serverToken: serverInfo.token,
        targetPath: outputTargetPath,
      },
      null,
      2
    )
  );
};

const missingLiveContext = (ctx) => {
  const missing = [];
  if (!ctx.hasProduct) missing.push('PRODUCT.md');
  if (!ctx.hasDesign) missing.push('DESIGN.md');

  return missing;
};

/**
 * Drift-heal scan. Walks the project for HTML files under common
 * page-source directories (public/, src/, app/, pages/) and reports any
 * that aren't covered by the resolved inject targets. This is purely
 * advisory — the agent can ignore it, or suggest the user add the
 * orphans to config.files.
 *
 * Skipped if config.files already contains at least one glob pattern
 * covering everything in practice (signaled by the orphan count being 0).
 */
const scanForDrift = (rootDir, resolvedFiles, config) => {
  const SCAN_ROOTS = ['public', 'src', 'app', 'pages'];
  const IGNORE_DIRS = new Set([
    '.astro',
    '.cache',
    '.git',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.turbo',
    '.vercel',
    'build',
    'coverage',
    'dist',
    'node_modules',
  ]);

  const resolvedSet = new Set(
    resolvedFiles.map((f) => f.split(path.sep).join('/'))
  );

  // Files matching the user's `exclude` globs are intentional omissions,
  // not drift. Compile them to regexes so the orphan list stays signal.
  const userExcludeRegexes = (
    Array.isArray(config.exclude) ?
      config.exclude
    : []).map((p) => globToRegex(p));
  const isUserExcluded = (rel) => userExcludeRegexes.some((re) => re.test(rel));

  const orphans = [];

  const walk = (dir, relBase) => {
    let entries;

    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }

    for (const e of entries) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name;

      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(path.join(dir, e.name), rel);
      } else if (e.isFile() && e.name.endsWith('.html')) {
        if (resolvedSet.has(rel)) continue;
        if (isUserExcluded(rel)) continue;
        orphans.push(rel);
      }
    }
  };

  for (const root of SCAN_ROOTS) {
    const abs = path.join(rootDir, root);

    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      walk(abs, root);
    }
  }

  if (orphans.length === 0) return null;
  const capped = orphans.slice(0, 20);

  return {
    hint: `${orphans.length} HTML file(s) exist but aren't in config.files. Consider adding them, or use a glob pattern like "public/**/*.html".`,
    orphanCount: orphans.length,
    orphans: capped,
  };
};

/**
 * Same glob-to-regex mapping used by live-inject.mjs. Kept inline here
 * to avoid a circular import (live-inject.mjs already imports nothing
 * from live.mjs). The two must stay in sync.
 */
const globToRegex = (pattern) => {
  let re = '';
  let index = 0;

  while (index < pattern.length) {
    const c = pattern[index];

    if (c === '*') {
      if (pattern[index + 1] === '*') {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const runScript = (name, args, options = {}) => {
  const scriptPath = path.join(__dirname, name);
  const cmd = `node "${scriptPath}" ${args.map((a) => `"${a}"`).join(' ')}`;

  try {
    return execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 15_000,
    });
  } catch (error) {
    // execSync throws on non-zero exit; return stdout if any
    return error.stdout || error.message || '';
  }
};

const safeParse = (out) => {
  try {
    return JSON.parse(String(out).trim());
  } catch {
    return null;
  }
};

/**
 * Return { pid, port, token } for the running live server, starting one if needed.
 */
const ensureServerRunning = (cwd = process.cwd()) => {
  // Try to reuse an existing server
  try {
    const existing = readLiveServerInfo(cwd)?.info;

    if (existing && existing.pid) {
      try {
        process.kill(existing.pid, 0); // throws if dead

        return existing;
      } catch {
        /* stale PID file — the server script will clean it up */
      }
    }
  } catch {
    /* no PID file */
  }

  // Start a new server
  const out = runScript('live-server.mjs', ['--background'], {cwd});

  return safeParse(out);
};

// ---------------------------------------------------------------------------
// Auto-execute
// ---------------------------------------------------------------------------

const _running = process.argv[1];

if (_running?.endsWith('live.mjs') || _running?.endsWith('live.mjs/')) {
  liveCli();
}
