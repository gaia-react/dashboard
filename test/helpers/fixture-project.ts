import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encode} from '~/data/parse/discover';

/**
 * Neutral project root baked into every committed composite fixture: the
 * `claude/projects/*` directory names encode it, and `cwd` / `session_cwd`
 * values inside the fixture files point at it (or under it).
 */
export const FIXTURE_PROJECT_ROOT = '/Users/you/projects/my-app';

export type FixtureProjectName = 'empty-project' | 'mini-project';

export type MaterializedFixtureProject = {
  /** Fake `$CLAUDE_CONFIG_DIR` (contains `projects/`). */
  claudeConfigDir: string;
  /** Removes the temporary copy. Call in the test's finally/afterAll. */
  cleanup: () => void;
  /** Basename of `projectRoot`. */
  projectName: string;
  /** Absolute root of the materialized GAIA project (contains `.gaia/`). */
  projectRoot: string;
};

const renameEncodedProjectDirectories = (
  projectsDirectory: string,
  projectRoot: string
): void => {
  const encodedPlaceholder = encode(FIXTURE_PROJECT_ROOT);
  const encodedRoot = encode(projectRoot);

  for (const name of readdirSync(projectsDirectory)) {
    if (name.startsWith(encodedPlaceholder)) {
      renameSync(
        path.join(projectsDirectory, name),
        path.join(
          projectsDirectory,
          name.replace(encodedPlaceholder, encodedRoot)
        )
      );
    }
  }
};

const rewritePlaceholderPaths = (
  rootDirectory: string,
  projectRoot: string
): void => {
  const files = readdirSync(rootDirectory, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile());

  for (const entry of files) {
    const filePath = path.join(entry.parentPath, entry.name);
    const contents = readFileSync(filePath, 'utf8');

    if (contents.includes(FIXTURE_PROJECT_ROOT)) {
      writeFileSync(
        filePath,
        contents.replaceAll(FIXTURE_PROJECT_ROOT, projectRoot)
      );
    }
  }
};

/**
 * Copy a committed composite fixture (`test/fixtures/<name>/`) into a
 * temporary directory and rebase it onto that directory's real absolute path:
 * the `claude/projects/*` directory names are re-encoded for the temporary
 * project root, and every occurrence of the neutral placeholder root inside
 * the copied files (`cwd`, `session_cwd`) is rewritten to it.
 *
 * This is required because the SPEC section 4.4 directory encoding covers the
 * ABSOLUTE session cwd, so a committed fixture cannot carry directory names
 * that match a machine-specific checkout path. Handler tests point their
 * config at the returned `projectRoot` / `claudeConfigDir` and get a fully
 * consistent project: discovery, `session_cwd` forward-encoding, and
 * `.gaia/**` reads all line up.
 */
export const materializeFixtureProject = (
  name: FixtureProjectName
): MaterializedFixtureProject => {
  const fixtureDirectory = fileURLToPath(
    new URL(`../fixtures/${name}/`, import.meta.url)
  );
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), `gaia-dashboard-${name}-`)
  );

  cpSync(fixtureDirectory, temporaryRoot, {recursive: true});

  const projectRoot = path.join(temporaryRoot, 'project');

  renameEncodedProjectDirectories(
    path.join(temporaryRoot, 'claude', 'projects'),
    projectRoot
  );
  rewritePlaceholderPaths(temporaryRoot, projectRoot);

  return {
    claudeConfigDir: path.join(temporaryRoot, 'claude'),
    cleanup: () => {
      rmSync(temporaryRoot, {force: true, recursive: true});
    },
    projectName: path.basename(projectRoot),
    projectRoot,
  };
};
