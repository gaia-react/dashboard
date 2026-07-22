import {OTHER_SERIES_KEY} from '~/components/Charts/chart-palette';
import type {HorizontalBarDatum} from '~/components/Charts/HorizontalBars';
import type {WeeklyStackDatum} from '~/components/Charts/StackedWeeklyBars';
import {formatModelName} from '~/data/format/model-name';
import type {ActivityResponse} from '~/data/schemas/api';

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

/** Totals per model (total tokens). Model ids are humanized for display
 * (feedback); the underlying data is untouched. No hover detail: the bucket
 * split that used to back it is gone from the client contract (Phase 8 v2),
 * and the bar value is already direct-labeled. */
export const buildModelTotalsData = (
  modelTotals: ActivityResponse['modelTotals']
): HorizontalBarDatum[] =>
  modelTotals
    .filter((entry) => isRealModel(entry.model))
    .map(({model, totalTokens}) => ({
      label: formatModelName(model),
      value: totalTokens,
    }));

export type WeeklySeriesData = {
  /** Display name per (possibly escaped) series key, for StackedWeeklyBars. */
  seriesLabels: Record<string, string>;
  weeklyData: WeeklyStackDatum[];
};

/**
 * Stacked by-week total-tokens series per model.
 *
 * Builds `values` and `seriesLabels` via `Object.fromEntries` rather than
 * bracket assignment on an object literal (`values[seriesKey] = totalTokens`):
 * a model id that collides with an `Object.prototype` member (`__proto__`,
 * `constructor`, ...) would otherwise silently no-op the assignment (the
 * `__proto__` setter ignores non-object values) and lose that model's data.
 * `Object.fromEntries` defines each entry as an own property directly
 * (`CreateDataProperty`), sidestepping the setter entirely. Same class of bug
 * already fixed in Icon/icon-map.ts, format/lenses.ts, and chart-palette.ts's
 * groupTailSeries; model ids here are untrusted strings straight from
 * `../gaia` data.
 */
export const buildModelWeeklyData = (
  modelWeekly: ActivityResponse['modelWeekly']
): WeeklySeriesData => {
  const labelEntries = new Map<string, string>();
  const weeklyData = modelWeekly.map((week) => {
    const realEntries = Object.entries(week.tokensByModel).filter(([model]) =>
      isRealModel(model)
    );

    for (const [model] of realEntries) {
      const seriesKey = escapeSeriesKey(model);

      // The series key stays raw (chart identity); only the label is humanized.
      labelEntries.set(seriesKey, formatModelName(model));
    }

    return {
      values: Object.fromEntries(
        realEntries.map(([model, totalTokens]) => [
          escapeSeriesKey(model),
          totalTokens,
        ])
      ),
      week: week.weekStart,
    };
  });

  return {
    seriesLabels: Object.fromEntries(labelEntries),
    weeklyData,
  };
};
