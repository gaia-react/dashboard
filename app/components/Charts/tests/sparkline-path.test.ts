import {expect, test} from 'vitest';
import {sparklinePath} from '~/components/Charts/sparkline-path';

test('an empty series produces an empty path', () => {
  expect(sparklinePath([], {height: 32, width: 120})).toBe('');
});

test('a single point draws a dot (a zero-length line at the center)', () => {
  expect(sparklinePath([5], {height: 32, width: 120})).toBe('M60 16L60 16');
});

test('two points draw a line from the first to the last', () => {
  expect(sparklinePath([0, 10], {height: 32, width: 120})).toBe('M0 32L120 0');
});

test('a rising series draws increasing x, decreasing y (higher value, higher on screen)', () => {
  const path = sparklinePath([1, 2, 3], {height: 32, width: 120});

  expect(path).toBe('M0 32L60 16L120 0');
});

test('an all-equal series draws a flat line at mid-height, not a divide-by-zero', () => {
  expect(sparklinePath([7, 7, 7], {height: 32, width: 120})).toBe(
    'M0 16L60 16L120 16'
  );
});
