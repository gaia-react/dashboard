import {expect, test} from 'vitest';
import {
  clampShare,
  meterWidthPercent,
} from '~/components/Charts/gauge-geometry';

test('clampShare returns the plain ratio inside range', () => {
  expect(clampShare(3, 12)).toBeCloseTo(0.25);
});

test('clampShare clamps an over-max value to 1, never drawing past the track', () => {
  expect(clampShare(15, 12)).toBe(1);
});

test('clampShare never goes negative', () => {
  expect(clampShare(-5, 12)).toBe(0);
});

test('clampShare returns 0 when max is zero or negative, rather than dividing by it', () => {
  expect(clampShare(4, 0)).toBe(0);
  expect(clampShare(4, -1)).toBe(0);
});

test('meterWidthPercent scales a mid-range share to a percent width', () => {
  expect(meterWidthPercent(0.5)).toBe(50);
});

test('meterWidthPercent is 0 for a zero share', () => {
  expect(meterWidthPercent(0)).toBe(0);
});

test('meterWidthPercent floors a non-zero share at 2%, so a 0.3% share stays visible', () => {
  expect(meterWidthPercent(0.003)).toBe(2);
});

test('meterWidthPercent never exceeds 100', () => {
  expect(meterWidthPercent(1)).toBe(100);
});
