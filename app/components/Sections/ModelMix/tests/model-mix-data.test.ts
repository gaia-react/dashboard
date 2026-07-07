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

test('buildModelTotalsData excludes <synthetic> and carries humanized labels + bucket detail', () => {
  const data = buildModelTotalsData(populated.modelTotals, 'en-US');

  expect(data).toHaveLength(3);
  expect(data.some((datum) => datum.label === '<synthetic>')).toBe(false);

  const opus = data.find((datum) => datum.label === 'Claude Opus 4.8');

  expect(opus?.value).toBe(50_000);
  expect(opus?.tooltip?.title).toBe('Claude Opus 4.8');
  expect(opus?.tooltip?.rows).toEqual([
    {label: 'output', value: '50K'},
    {label: 'cache read', value: '900K'},
    {label: 'cache write', value: '40K'},
    {label: 'fresh input', value: '12K'},
  ]);
});

test('buildModelWeeklyData excludes <synthetic> from every week', () => {
  const {weeklyData} = buildModelWeeklyData(populated.modelWeekly);

  for (const week of weeklyData) {
    expect(Object.keys(week.values)).not.toContain('<synthetic>');
  }

  expect(weeklyData).toHaveLength(2);
  expect(weeklyData[0]).toEqual({
    values: {
      'claude-haiku-4-5': 2500,
      'claude-opus-4-8': 20_000,
      'claude-sonnet-4-5': 11_000,
    },
    week: '2026-06-22',
  });
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
