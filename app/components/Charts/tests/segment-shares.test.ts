import {expect, test} from 'vitest';
import {segmentShares} from '~/components/Charts/segment-shares';

test('computes each amount as a share of the total, as a display percent', () => {
  const {segments} = segmentShares([
    {key: 'spec', value: 25},
    {key: 'plan', value: 25},
    {key: 'execute', value: 50},
  ]);

  expect(segments).toEqual([
    {key: 'spec', percent: 25, value: 25},
    {key: 'plan', percent: 25, value: 25},
    {key: 'execute', percent: 50, value: 50},
  ]);
});

test('a real recorded zero is omitted entirely, not rendered at 0 width', () => {
  const {segments} = segmentShares([
    {key: 'spec', value: 100},
    {key: 'plan', value: 0},
  ]);

  expect(segments).toEqual([{key: 'spec', percent: 100, value: 100}]);
});

test('a null value is skipped from segments and reported separately, never treated as zero', () => {
  const {nullKeys, segments} = segmentShares([
    {key: 'spec', value: 40},
    {key: 'plan', value: null},
    {key: 'execute', value: 60},
  ]);

  expect(segments).toEqual([
    {key: 'spec', percent: 40, value: 40},
    {key: 'execute', percent: 60, value: 60},
  ]);
  expect(nullKeys).toEqual(['plan']);
});

test('a real non-zero share below 1% still displays a non-zero percent (minimum-visible clamp)', () => {
  const {segments} = segmentShares([
    {key: 'spec', value: 1},
    {key: 'execute', value: 9999},
  ]);
  const spec = segments.find((segment) => segment.key === 'spec');

  expect(spec?.percent).toBe(1);
});

test('every value null or zero produces no segments', () => {
  const {segments} = segmentShares([
    {key: 'spec', value: null},
    {key: 'plan', value: 0},
  ]);

  expect(segments).toEqual([]);
});

test('an empty amount list produces no segments and no null keys', () => {
  expect(segmentShares([])).toEqual({nullKeys: [], segments: []});
});
