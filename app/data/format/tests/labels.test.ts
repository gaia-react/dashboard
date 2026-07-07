import {describe, expect, test} from 'vitest';
import {formatLabel} from '~/data/format/labels';

describe('formatLabel', () => {
  test.each([
    ['merged', 'Merged'],
    ['specified', 'Specified'],
    ['spec', 'Spec'],
    ['execute', 'Execute'],
    ['general-purpose', 'General purpose'],
    ['code-review-audit', 'Code review audit'],
  ])('sentence-cases %s as %s', (raw, expected) => {
    expect(formatLabel(raw)).toBe(expected);
  });

  test.each([
    ['task-docs-wiki', 'Task - Docs wiki'],
    ['task-integration', 'Task - Integration'],
  ])('formats the task prefix as its own word: %s', (raw, expected) => {
    expect(formatLabel(raw)).toBe(expected);
  });

  test('does not lowercase inside a bare "task" token', () => {
    expect(formatLabel('task')).toBe('Task');
  });

  test('passes the empty string through', () => {
    expect(formatLabel('')).toBe('');
  });
});
