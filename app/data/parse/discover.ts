import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import type {FileCache} from '../cache';
import {sortAlphabetically} from '../sort';
import {scanSessionFile} from './session-scan';

/**
 * Claude Code's project-directory transform: every `/` and `.` in the session
 * cwd becomes `-` (SPEC section 4.4). The transform is lossy, so the result
 * can only be compared forward (encode then match), never decoded back.
 */
export const encode = (targetPath: string): string =>
  targetPath.replaceAll('/', '-').replaceAll('.', '-');

/**
 * SPEC-024 forward-encode: applied to a cost.jsonl row's `session_cwd`, the
 * result names the exact `$CLAUDE_CONFIG_DIR/projects/<name>` transcript
 * directory deterministically, no reverse-decode heuristic needed.
 */
export const encodeSessionCwd = (sessionCwd: string): string =>
  encode(sessionCwd);

/**
 * Step 1 of the discovery heuristic: a directory name is a candidate when it
 * equals `encode(projectRoot)` or starts with `encode(projectRoot) + "-"`.
 * The trailing dash keeps lookalike roots out (`-Users-x-gaiarette`), but a
 * sibling project like `-Users-x-gaia-other` still prefix-matches, which is
 * why every candidate must also pass confirmation (step 2).
 */
export const selectCandidateDirectoryNames = (
  directoryNames: string[],
  projectRoot: string
): string[] => {
  const encoded = encode(projectRoot);

  return directoryNames.filter(
    (name) => name === encoded || name.startsWith(`${encoded}-`)
  );
};

const isInsideProject = (cwd: string, projectRoot: string): boolean =>
  cwd === projectRoot || cwd.startsWith(`${projectRoot}/`);

const listTranscriptFiles = (candidateDirectory: string): string[] =>
  sortAlphabetically(
    readdirSync(candidateDirectory, {withFileTypes: true})
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => path.join(candidateDirectory, entry.name))
  );

/**
 * Step 2 of the discovery heuristic: confirm a candidate by reading the first
 * `cwd` field in its jsonl lines and checking that path is the project root
 * or inside it (worktrees under `<root>/.claude/worktrees/...` confirm this
 * way). A candidate with no `cwd` anywhere cannot be confirmed and is
 * rejected. Confirmation reads the same cached `scanSessionFile` entry the
 * session scan uses (its `firstCwd` field), so one shared per-path cache
 * never holds two value types for a transcript file.
 */
export const confirmCandidateDirectory = async (
  candidateDirectory: string,
  projectRoot: string,
  cache: FileCache
): Promise<boolean> => {
  for (const filePath of listTranscriptFiles(candidateDirectory)) {
    // eslint-disable-next-line no-await-in-loop -- stop at the first cwd; scanning every file up front would defeat the early exit
    const {firstCwd} = await cache.get(filePath, scanSessionFile);

    if (firstCwd !== undefined) {
      return isInsideProject(firstCwd, projectRoot);
    }
  }

  return false;
};

/**
 * Full discovery: list `projectsDirectory`, select candidates by encoded
 * name, then confirm each. Returns absolute paths of confirmed directories,
 * sorted by name. A missing projects directory yields an empty list (a
 * project with no session history is a legal state, not an error).
 */
export const discoverProjectDirectories = async (
  projectsDirectory: string,
  projectRoot: string,
  cache: FileCache
): Promise<string[]> => {
  if (!existsSync(projectsDirectory)) {
    return [];
  }

  const directoryNames = sortAlphabetically(
    readdirSync(projectsDirectory, {withFileTypes: true})
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );

  const confirmed: string[] = [];

  for (const name of selectCandidateDirectoryNames(
    directoryNames,
    projectRoot
  )) {
    const candidateDirectory = path.join(projectsDirectory, name);

    // eslint-disable-next-line no-await-in-loop -- candidates are few; sequential keeps confirmation reads deterministic
    const isConfirmed = await confirmCandidateDirectory(
      candidateDirectory,
      projectRoot,
      cache
    );

    if (isConfirmed) {
      confirmed.push(candidateDirectory);
    }
  }

  return confirmed;
};
