/**
 * Deterministic alphabetical copy-sort for string lists (directory names,
 * file paths, model ids), so scan output is stable across filesystems.
 */
export const sortAlphabetically = (values: string[]): string[] =>
  values.toSorted((a, b) => a.localeCompare(b));
