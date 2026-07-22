import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
  buildModelTotalsData,
  buildModelWeeklyData,
  escapeSeriesKey,
} from '~/components/Sections/ModelMix/model-mix-data';
import type {ActivityResponse} from '~/data/schemas/api';
import {activityResponseSchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (mirrors app/components/Sections/ActivityHeatmap/tests/index.test.tsx).
const readFixture = (name: string): ActivityResponse =>
  activityResponseSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/model-mix', name),
        'utf8'
      )
    )
  );

const populated = readFixture('populated.json');
const otherCollision = readFixture('other-collision.json');

test('escapeSeriesKey only rewrites the literal kit-reserved "other" key', () => {
  expect(escapeSeriesKey('other')).toBe('other.model');
  expect(escapeSeriesKey('claude-opus-4-8')).toBe('claude-opus-4-8');
});

test('buildModelTotalsData excludes <synthetic>, carries humanized labels, and reports total tokens', () => {
  const data = buildModelTotalsData(populated.modelTotals);

  expect(data).toHaveLength(3);
  expect(data.some((datum) => datum.label === '<synthetic>')).toBe(false);

  const opus = data.find((datum) => datum.label === 'Claude Opus 4.8');

  // Phase 8 v2: the bar value is the model's TOTAL tokens (1,002,000 in the
  // fixture), not its output tokens alone (50,000). Asserting the full total
  // proves the metric actually moved, not just the field name.
  expect(opus?.value).toBe(1_002_000);
  // No hover detail: the bucket split it used to carry is gone from the
  // client contract.
  expect(opus?.tooltip).toBeUndefined();
});

test('buildModelWeeklyData excludes <synthetic> from every week and reads total tokens', () => {
  const {weeklyData} = buildModelWeeklyData(populated.modelWeekly);

  for (const week of weeklyData) {
    expect(Object.keys(week.values)).not.toContain('<synthetic>');
  }

  expect(weeklyData).toHaveLength(2);
  // Phase 8 v2: these are total-token values (45,000 / 24,000 / 5,500), not
  // the old output-only values (20,000 / 11,000 / 2,500) the same week used
  // to carry, proving the basis moved from output to total.
  expect(weeklyData[0]).toEqual({
    values: {
      'claude-haiku-4-5': 5500,
      'claude-opus-4-8': 45_000,
      'claude-sonnet-4-5': 24_000,
    },
    week: '2026-06-22',
  });
});

// Regression (the Icon/icon-map.ts, format/lenses.ts, chart-palette.ts
// groupTailSeries bug class): the previous implementation built `values` and
// `seriesLabels` via bare bracket assignment on an object literal
// (`values[seriesKey] = totalTokens`). A model id that collides with
// `Object.prototype.__proto__` silently no-ops that assignment instead of
// creating an own property (the setter ignores non-object values), losing
// the model's data. Built via JSON.parse so "__proto__" is a genuine own
// property on the source data (CreateDataProperty); an object literal with
// `__proto__:` in the source sets the prototype instead and proves nothing.
test('a model id shaped like a prototype property survives into the built series, not silently dropped', () => {
  const tokensByModel = JSON.parse(
    '{"__proto__": 12, "claude-opus-4-8": 4}'
  ) as Record<string, number>;

  const {seriesLabels, weeklyData} = buildModelWeeklyData([
    {tokensByModel, weekStart: '2026-06-01'},
  ]);

  const values = weeklyData[0]?.values ?? {};

  // Reflect.get, not `values.__proto__` / `values['__proto__']`: both member
  // forms trip no-proto (and its autofixer flips bracket back to dot,
  // re-triggering the same error), even though this reads the own property
  // built above, not the deprecated accessor.
  expect(Object.hasOwn(values, '__proto__')).toBe(true);
  expect(Reflect.get(values, '__proto__')).toBe(12);
  expect(values['claude-opus-4-8']).toBe(4);
  expect(Reflect.get(seriesLabels, '__proto__')).toBe('__proto__');
});

test('a real model literally named "other" is escaped to a non-colliding key with its true label preserved', () => {
  const {seriesLabels, weeklyData} = buildModelWeeklyData(
    otherCollision.modelWeekly
  );

  // The real "other" model must not share a key with the kit's synthetic
  // tail bucket (chart-palette.ts groupTailSeries), or its value would be
  // clobbered by the tail aggregate.
  expect(weeklyData[0]?.values.other).toBeUndefined();
  expect(weeklyData[0]?.values['other.model']).toBe(500);
  expect(seriesLabels['other.model']).toBe('other');
});
