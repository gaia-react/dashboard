import {expect, test} from 'vitest';
import {donutArcPath, donutSegments} from '~/components/Charts/donut-arc';

test('a single 100% segment sweeps the entire circle', () => {
  const [segment] = donutSegments([{key: 'solo', value: 10}]);

  expect(segment.key).toBe('solo');
  expect(segment.share).toBe(1);
  expect(segment.startAngle).toBeCloseTo(0);
  expect(segment.endAngle).toBeCloseTo(Math.PI * 2);
});

test('two equal values split the circle in half with a padAngle gap between them', () => {
  const segments = donutSegments(
    [
      {key: 'a', value: 1},
      {key: 'b', value: 1},
    ],
    0.02
  );

  expect(segments).toHaveLength(2);
  expect(segments[0].share).toBeCloseTo(0.5);
  expect(segments[1].share).toBeCloseTo(0.5);
  // Gap between segment a's end and segment b's start is the pad angle.
  expect(segments[1].startAngle - segments[0].endAngle).toBeCloseTo(0.02);
  // Wrap-around gap between segment b's end and the circle close (segment
  // a's start plus a full turn) is also the pad angle.
  expect(
    segments[0].startAngle + Math.PI * 2 - segments[1].endAngle
  ).toBeCloseTo(0.02);
});

test('a segment small enough to round to a sliver still gets a non-zero sweep', () => {
  const segments = donutSegments([
    {key: 'big', value: 999},
    {key: 'sliver', value: 1},
  ]);
  const sliver = segments[1];

  expect(sliver.share).toBeCloseTo(0.001);
  expect(sliver.endAngle - sliver.startAngle).toBeGreaterThan(0);
});

test('every value at zero produces no segments', () => {
  expect(
    donutSegments([
      {key: 'a', value: 0},
      {key: 'b', value: 0},
    ])
  ).toEqual([]);
});

test('an empty value list produces no segments', () => {
  expect(donutSegments([])).toEqual([]);
});

test('donutArcPath draws a single annular sector for a partial sweep', () => {
  expect(
    donutArcPath({
      endAngle: Math.PI / 2,
      innerRadius: 46,
      outerRadius: 70,
      startAngle: 0,
    })
  ).toBe('M0 -70A70 70 0 0 1 70 0L46 0A46 46 0 0 0 0 -46Z');
});

test('donutArcPath renders a full 2pi sweep as two half-circle arcs, not a zero-length arc', () => {
  const path = donutArcPath({
    endAngle: Math.PI * 2,
    innerRadius: 46,
    outerRadius: 70,
    startAngle: 0,
  });

  expect(path).toBe(
    'M0 -70A70 70 0 0 1 0 70L0 46A46 46 0 0 0 0 -46Z' +
      'M0 70A70 70 0 0 1 0 -70L0 -46A46 46 0 0 0 0 46Z'
  );
  // Two sectors, two arcs each: four arc commands total, never one zero-sweep arc.
  expect(path.match(/A/g)).toHaveLength(4);
});

test('a zero-sweep arc (endAngle === startAngle) produces an empty path', () => {
  expect(
    donutArcPath({endAngle: 1, innerRadius: 46, outerRadius: 70, startAngle: 1})
  ).toBe('');
});
