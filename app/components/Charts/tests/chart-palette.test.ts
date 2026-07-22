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

test('a series named "__proto__" that survives the fold keeps its own total rather than silently vanishing', () => {
  // Built with JSON.parse, not an object literal: `{__proto__: 1}` sets the
  // prototype and creates no own property, which would make this fixture
  // vacuous. JSON.parse's reviver creates a real own property named
  // "__proto__" via CreateDataProperty, matching what an untrusted model or
  // agent-type name parsed from ../gaia JSONL would actually produce.
  //
  // "__proto__" is given the largest total so it ranks first and lands in
  // the NAMED branch (kept as its own series), not the folded-into-"other"
  // branch: that is the branch the bug lives in. Under the old
  // `folded[key] = value` bracket assignment, writing to key '__proto__'
  // with a numeric value goes through Object.prototype's inherited
  // `__proto__` accessor setter, which silently no-ops for a non-object
  // value: no own property is created, the 500 vanishes entirely, and a
  // downstream `row['__proto__']` read returns the actual Object.prototype
  // object instead of a number.
  const hostileRow = JSON.parse(
    '{"__proto__":500,"alpha":100,"beta":90,"charlie":80,"delta":70,"echo":60,"foxtrot":50,"golf":40,"hotel":30}'
  ) as Record<string, number>;

  const grouped = groupTailSeries([hostileRow]);
  const row = grouped.rows[0] ?? {};
  // Read through a variable key, not a literal `.__proto__` /
  // `['__proto__']` member expression: the deprecated accessor property is
  // not what this assertion is about, and `no-proto` correctly flags direct
  // access to it.
  const hostileKey = '__proto__';

  expect(grouped.seriesKeys[0]).toBe(hostileKey);
  expect(Object.hasOwn(row, hostileKey)).toBe(true);
  expect(row[hostileKey]).toBe(500);
  expect(typeof row[hostileKey]).toBe('number');
  // golf (40) and hotel (30) rank 8th and 9th and fold into "other".
  expect(row[OTHER_SERIES_KEY]).toBe(70);
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
