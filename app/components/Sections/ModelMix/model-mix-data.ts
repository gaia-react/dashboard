import {OTHER_SERIES_KEY} from '~/components/Charts/chart-palette';
import type {TooltipRow} from '~/components/Charts/ChartTooltip';
import type {HorizontalBarDatum} from '~/components/Charts/HorizontalBars';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import type {WeeklyStackDatum} from '~/components/Charts/StackedWeeklyBars';
import {formatModelName} from '~/data/format/model-name';
import type {ActivityResponse, Buckets} from '~/data/schemas/api';

/**
 * Data mapping for ModelMix (SPEC section 6.5): ActivityResponse.modelTotals
 * / modelWeekly into the W8 HorizontalBars / StackedWeeklyBars kit props.
 *
 * Session-log scans fold main plus subagent transcript token usage into the
 * same per-model totals upstream (P1/P3), so subagent traffic is already
 * included in every model entry here; nothing extra to merge in.
 *
 * The data layer already excludes `<synthetic>` model rows (aggregate/
 * activity.ts); this filters again at the section boundary so the contract
 * (an array of arbitrary model strings, per schemas/api.ts) never lets one
 * back in even if that upstream behavior regresses.
 */
const SYNTHETIC_MODEL = '<synthetic>';

const isRealModel = (model: string): boolean => model !== SYNTHETIC_MODEL;

/**
 * The W8 chart kit's `groupTailSeries` (chart-palette.ts) folds any tail past
 * six concurrent series into the literal key `OTHER_SERIES_KEY` ("other"),
 * overwriting whatever value already sits there (and, if that model also
 * stayed in the kept set, duplicating the series key). A real model
 * literally named "other" would collide: escape it to a key the kit will
 * never assign; `buildModelWeeklyData` carries the true name back through
 * `seriesLabels` so the displayed text is unaffected either way.
 */
export const escapeSeriesKey = (model: string): string =>
  model === OTHER_SERIES_KEY ? `${model}.model` : model;

const BUCKET_ROWS: {bucketKey: keyof Buckets; label: string}[] = [
  {bucketKey: 'output', label: 'output'},
  {bucketKey: 'cacheRead', label: 'cache read'},
  {bucketKey: 'cacheWrite', label: 'cache write'},
  {bucketKey: 'freshInput', label: 'fresh input'},
];

const buildBucketTooltipRows = (
  buckets: Buckets,
  locale: string | undefined
): TooltipRow[] =>
  BUCKET_ROWS.map(({bucketKey, label}) => ({
    label,
    value: formatCompactNumber(buckets[bucketKey], locale),
  }));

/** Totals per model (output tokens, full bucket split on hover). Model ids are
 * humanized for display (feedback); the underlying data is untouched. */
export const buildModelTotalsData = (
  modelTotals: ActivityResponse['modelTotals'],
  locale?: string
): HorizontalBarDatum[] =>
  modelTotals
    .filter((entry) => isRealModel(entry.model))
    .map(({buckets, model}) => {
      const label = formatModelName(model);

      return {
        label,
        tooltip: {rows: buildBucketTooltipRows(buckets, locale), title: label},
        value: buckets.output,
      };
    });

export type WeeklySeriesData = {
  /** Display name per (possibly escaped) series key, for StackedWeeklyBars. */
  seriesLabels: Record<string, string>;
  weeklyData: WeeklyStackDatum[];
};

/** Stacked by-week output-tokens series per model. */
export const buildModelWeeklyData = (
  modelWeekly: ActivityResponse['modelWeekly']
): WeeklySeriesData => {
  const seriesLabels: Record<string, string> = {};
  const weeklyData = modelWeekly.map((week) => {
    const values: Record<string, number> = {};
    const realEntries = Object.entries(week.outputByModel).filter(([model]) =>
      isRealModel(model)
    );

    for (const [model, output] of realEntries) {
      const seriesKey = escapeSeriesKey(model);

      values[seriesKey] = output;
      // The series key stays raw (chart identity); only the label is humanized.
      seriesLabels[seriesKey] = formatModelName(model);
    }

    return {values, week: week.weekStart};
  });

  return {seriesLabels, weeklyData};
};
