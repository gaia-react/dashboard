import {expect, test} from 'vitest';
import {horizontalBarPath, verticalBarPath} from '~/components/Charts/bar-path';

test('horizontal bar path rounds only the data end, square at the baseline', () => {
  expect(horizontalBarPath({height: 16, width: 100, x: 0, y: 0})).toBe(
    'M0 0H96A4 4 0 0 1 100 4V12A4 4 0 0 1 96 16H0Z'
  );
});

test('horizontal bar path clamps the radius on slivers', () => {
  expect(horizontalBarPath({height: 16, width: 2, x: 0, y: 0})).toBe(
    'M0 0H0A2 2 0 0 1 2 2V14A2 2 0 0 1 0 16H0Z'
  );
});

test('vertical bar path rounds only the top cap', () => {
  expect(verticalBarPath({height: 50, width: 20, x: 10, y: 30})).toBe(
    'M10 80V34A4 4 0 0 1 14 30H26A4 4 0 0 1 30 34V80Z'
  );
});

test('zero-size bars produce an empty path', () => {
  expect(horizontalBarPath({height: 16, width: 0, x: 0, y: 0})).toBe('');
  expect(verticalBarPath({height: 0, width: 20, x: 0, y: 0})).toBe('');
});
