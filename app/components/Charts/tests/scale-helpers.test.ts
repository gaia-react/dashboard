import {expect, test} from 'vitest';
import {
  createBandScale,
  createLinearScale,
  formatCompactNumber,
  niceTicks,
} from '~/components/Charts/scale-helpers';

test('linear scale maps a domain value into the range', () => {
  const scale = createLinearScale([0, 100], [0, 200]);
  expect(scale(0)).toBe(0);
  expect(scale(50)).toBe(100);
  expect(scale(100)).toBe(200);
});

test('linear scale supports inverted ranges for y axes', () => {
  const scale = createLinearScale([0, 100], [300, 0]);
  expect(scale(0)).toBe(300);
  expect(scale(100)).toBe(0);
});

test('linear scale with a zero-span domain collapses to the range start', () => {
  const scale = createLinearScale([0, 0], [0, 200]);
  expect(scale(0)).toBe(0);
  expect(scale(5)).toBe(0);
});

test('band scale positions keys with inner padding', () => {
  const scale = createBandScale(['a', 'b', 'c', 'd'], [0, 100], 0.2);
  expect(scale.step).toBe(25);
  expect(scale.bandwidth).toBe(20);
  expect(scale.position('a')).toBe(2.5);
  expect(scale.position('c')).toBe(52.5);
});

test('nice ticks land on round numbers and cover the max', () => {
  expect(niceTicks(500_000)).toEqual([0, 200_000, 400_000, 600_000]);
  expect(niceTicks(97)).toEqual([0, 25, 50, 75, 100]);
  expect(niceTicks(0)).toEqual([0]);
});

test('compact number formatting abbreviates large values', () => {
  expect(formatCompactNumber(1_234_567, 'en-US')).toBe('1.2M');
  expect(formatCompactNumber(125_000, 'en-US')).toBe('125K');
  expect(formatCompactNumber(300, 'en-US')).toBe('300');
});
