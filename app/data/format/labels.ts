/**
 * Display formatters for the short lowercase-kebab tokens GAIA stores for
 * statuses, phase kinds, and agent types. The dashboard renders these
 * verbatim from loose ledger/telemetry data, so formatting is presentation
 * only and never changes the underlying value.
 *
 * Rule: sentence-case the token (`merged` -> "Merged", `general-purpose` ->
 * "General purpose"). Agent-type tasks are the one exception: a `task-`
 * prefix reads as its own word, `task-docs-wiki` -> "Task - Docs wiki".
 */

const TASK_PREFIX = 'task-';

/** Hyphens to spaces, first letter up, the rest down: `code-review` -> "Code review". */
const sentenceCase = (raw: string): string => {
  const spaced = raw.replaceAll('-', ' ').trim().toLowerCase();

  return spaced === '' ? raw : `${spaced[0].toUpperCase()}${spaced.slice(1)}`;
};

export const formatLabel = (raw: string): string => {
  if (raw.startsWith(TASK_PREFIX)) {
    const suffix = raw.slice(TASK_PREFIX.length);

    return suffix === '' ? 'Task' : `Task - ${sentenceCase(suffix)}`;
  }

  return sentenceCase(raw);
};
