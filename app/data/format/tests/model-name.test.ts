import {describe, expect, test} from 'vitest';
import {formatModelName} from '~/data/format/model-name';

describe('formatModelName', () => {
  test.each([
    ['claude-opus-4-8', 'Claude Opus 4.8'],
    ['claude-sonnet-5', 'Claude Sonnet 5'],
    ['claude-fable-5', 'Claude Fable 5'],
    ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5'],
    ['claude-opus-4-1-20250805', 'Claude Opus 4.1'],
  ])('formats %s as %s', (raw, expected) => {
    expect(formatModelName(raw)).toBe(expected);
  });

  test('passes non-Claude ids through untouched', () => {
    expect(formatModelName('gpt-4o')).toBe('gpt-4o');
    expect(formatModelName('<synthetic>')).toBe('<synthetic>');
  });

  test('leaves the legacy numeric-first order untouched', () => {
    expect(formatModelName('claude-3-5-sonnet-20241022')).toBe(
      'claude-3-5-sonnet-20241022'
    );
  });

  test('handles a family with no version and the empty string', () => {
    expect(formatModelName('claude-opus')).toBe('Claude Opus');
    expect(formatModelName('')).toBe('');
  });
});
