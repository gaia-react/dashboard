import {expect, test} from 'vitest';
import {
  buildSeriesColorMap,
  groupTailSeries,
  MAX_CONCURRENT_SERIES,
  OTHER_SERIES_KEY,
  SERIES_FILL_CLASSES,
  SERIES_SWATCH_CLASSES,
} from '~/components/Charts/chart-palette';

test('series colors follow the DESIGN-SPEC section 2.6 token order: existing six slots, then info, moss appended', () => {
  expect(SERIES_FILL_CLASSES).toEqual([
    'fill-accent',
    'fill-secondary',
    'fill-warn',
    'fill-accent-soft',
    'fill-secondary-soft',
    'fill-warn-soft',
    'fill-info',
    'fill-moss',
  ]);
  expect(SERIES_SWATCH_CLASSES).toEqual([
    'bg-accent',
    'bg-secondary',
    'bg-warn',
    'bg-accent-soft',
    'bg-secondary-soft',
    'bg-warn-soft',
    'bg-info',
    'bg-moss',
  ]);
  expect(SERIES_FILL_CLASSES).toHaveLength(SERIES_SWATCH_CLASSES.length);
});

test('MAX_CONCURRENT_SERIES is 8', () => {
  expect(MAX_CONCURRENT_SERIES).toBe(8);
});

test('eight or fewer series pass through ungrouped, ordered by total', () => {
  const rows = [
    {alpha: 1, beta: 5},
    {alpha: 2, beta: 5},
  ];
  const grouped = groupTailSeries(rows);

  expect(grouped.seriesKeys).toEqual(['beta', 'alpha']);
  expect(grouped.rows).toEqual(rows);
});

test('eight named series get eight distinct colors', () => {
  const rows = [
    {
      alpha: 80,
      beta: 70,
      charlie: 60,
      delta: 50,
      echo: 40,
      foxtrot: 30,
      golf: 20,
      hotel: 10,
    },
  ];
  const grouped = groupTailSeries(rows);
  const colorMap = buildSeriesColorMap(grouped.seriesKeys);

  expect(grouped.seriesKeys).toHaveLength(MAX_CONCURRENT_SERIES);

  const fillClasses = grouped.seriesKeys.map(
    (key) => colorMap[key].fillClassName
  );

  expect(new Set(fillClasses).size).toBe(8);
  expect(fillClasses).toEqual(SERIES_FILL_CLASSES);
});

test('nine series fold the ninth into "other"', () => {
  const rows = [
    {
      alpha: 100,
      beta: 90,
      charlie: 80,
      delta: 70,
      echo: 60,
      foxtrot: 50,
      golf: 40,
      hotel: 30,
      india: 20,
    },
  ];
  const grouped = groupTailSeries(rows);

  expect(grouped.seriesKeys).toEqual([
    'alpha',
    'beta',
    'charlie',
    'delta',
    'echo',
    'foxtrot',
    'golf',
    OTHER_SERIES_KEY,
  ]);
  expect(grouped.seriesKeys).toHaveLength(MAX_CONCURRENT_SERIES);
  expect(grouped.rows[0]?.[OTHER_SERIES_KEY]).toBe(50);
  expect(grouped.rows[0]?.hotel).toBeUndefined();
  expect(grouped.rows[0]?.india).toBeUndefined();
});

test('color map assigns palette slots by series order and neutral to "other"', () => {
  const colorMap = buildSeriesColorMap(['alpha', 'beta', OTHER_SERIES_KEY]);

  expect(colorMap.alpha).toEqual({
    fillClassName: 'fill-accent',
    swatchClassName: 'bg-accent',
  });
  expect(colorMap.beta).toEqual({
    fillClassName: 'fill-secondary',
    swatchClassName: 'bg-secondary',
  });
  expect(colorMap[OTHER_SERIES_KEY]).toEqual({
    fillClassName: 'fill-fg-mute',
    swatchClassName: 'bg-fg-mute',
  });
});
