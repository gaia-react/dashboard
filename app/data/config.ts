import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** The subset of process.env this module reads. All optional. */
export type ConfigEnvironment = {
  CLAUDE_CONFIG_DIR?: string;
  GAIA_DASHBOARD_PROJECT?: string;
};

/**
 * Resolved, absolute locations the data layer reads from. Both roots are
 * opened read-only; nothing under either is ever created, renamed, or deleted
 * (SPEC section 3, read-only guarantee).
 */
export type DashboardConfig = {
  /** Absolute path to Claude Code's home (session logs live under projects/). */
  claudeConfigDir: string;
  /** Display name for the project (basename of the root). */
  projectName: string;
  /** Absolute path to the target GAIA project root. */
  projectRoot: string;
};

export type ResolveOptions = {
  /** Base directory relative paths resolve against. Defaults to the repo root. */
  baseDirectory?: string;
  /** Home directory used for the ~/.claude default. Defaults to os.homedir(). */
  home?: string;
};

/**
 * Repo root (the dashboard package root), derived from this module's location:
 * app/data/config.ts -> app/data -> app -> <repo root>. Keeping the default
 * relative to this anchor rather than an absolute literal satisfies the
 * repo-relative-paths rule.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Dev default target project, expressed repo-relative (SPEC section 3). */
const DEFAULT_PROJECT = '../gaia';

const toAbsolute = (value: string, baseDirectory: string): string =>
  path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);

/**
 * Pure env resolution: given an env bag (and optional base/home overrides for
 * tests), produce the absolute roots. No filesystem access, no reads of the
 * ambient process.env, so it is fully unit-testable.
 */
export const resolveConfig = (
  environment: ConfigEnvironment,
  {baseDirectory = repoRoot, home = homedir()}: ResolveOptions = {}
): DashboardConfig => {
  const projectRoot = toAbsolute(
    environment.GAIA_DASHBOARD_PROJECT ?? DEFAULT_PROJECT,
    baseDirectory
  );
  const claudeConfigDirectory = toAbsolute(
    environment.CLAUDE_CONFIG_DIR ?? path.resolve(home, '.claude'),
    baseDirectory
  );

  return {
    claudeConfigDir: claudeConfigDirectory,
    projectName: path.basename(projectRoot),
    projectRoot,
  };
};

/** Resolve config from the live process environment. */
export const loadConfig = (): DashboardConfig => resolveConfig(process.env);
