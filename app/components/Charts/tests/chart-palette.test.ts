import {expect, test} from 'vitest';
import {
  buildSeriesColorMap,
  groupTailSeries,
  MAX_CONCURRENT_SERIES,
  OTHER_SERIES_KEY,
  SERIES_FILL_CLASSES,
} from '~/components/Charts/chart-palette';

test('series colors follow the SPEC section 7 token order', () => {
  expect(SERIES_FILL_CLASSES).toEqual([
    'fill-accent',
    'fill-secondary',
    'fill-warn',
    'fill-accent-soft',
    'fill-secondary-soft',
    'fill-warn-soft',
  ]);
});

test('six or fewer series pass through ungrouped, ordered by total', () => {
  const rows = [
    {alpha: 1, beta: 5},
    {alpha: 2, beta: 5},
  ];
  const grouped = groupTailSeries(rows);

  expect(grouped.seriesKeys).toEqual(['beta', 'alpha']);
  expect(grouped.rows).toEqual(rows);
});

test('past six series the tail folds into "other"', () => {
  const rows = [
    {
      alpha: 100,
      beta: 75,
      delta: 25,
      echo: 20,
      foxtrot: 15,
      gamma: 50,
      golf: 10,
      hotel: 5,
    },
  ];
  const grouped = groupTailSeries(rows);

  expect(grouped.seriesKeys).toEqual([
    'alpha',
    'beta',
    'gamma',
    'delta',
    'echo',
    OTHER_SERIES_KEY,
  ]);
  expect(grouped.seriesKeys).toHaveLength(MAX_CONCURRENT_SERIES);
  expect(grouped.rows[0]?.[OTHER_SERIES_KEY]).toBe(30);
  expect(grouped.rows[0]?.foxtrot).toBeUndefined();
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
