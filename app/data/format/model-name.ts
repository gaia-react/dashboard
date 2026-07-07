/**
 * Display formatter for Claude model ids (SPEC display normalization).
 * Turns the on-the-wire id into the human name GAIA uses in copy:
 * `claude-opus-4-8` -> "Claude Opus 4.8", `claude-haiku-4-5-20251001` ->
 * "Claude Haiku 4.5" (the trailing snapshot date is dropped).
 *
 * Only the current `claude-<family>-<version...>[-<yyyymmdd>]` convention is
 * rewritten. Anything else (a non-Claude id, the `<synthetic>` sentinel, or
 * the older `claude-3-5-sonnet-*` order whose first token is numeric) passes
 * through verbatim rather than being mangled.
 */

const CLAUDE_PREFIX = 'claude-';

/** An eight-digit `yyyymmdd` snapshot suffix, dropped from the display name. */
const isDateToken = (token: string): boolean => /^\d{8}$/u.test(token);

const capitalize = (word: string): string =>
  word.length === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`;

export const formatModelName = (model: string): string => {
  if (!model.startsWith(CLAUDE_PREFIX)) {
    return model;
  }

  const [family, ...rest] = model.slice(CLAUDE_PREFIX.length).split('-');

  // Guard the legacy `claude-3-5-sonnet-*` order (leading numeric token) and
  // the prefix-only `claude-` case: the family/version split below assumes a
  // non-numeric family-first token, so leave anything else untouched.
  if (family === '' || /^\d/u.test(family)) {
    return model;
  }

  const version = rest.filter((token) => !isDateToken(token)).join('.');

  return version === '' ?
      `Claude ${capitalize(family)}`
    : `Claude ${capitalize(family)} ${version}`;
};
