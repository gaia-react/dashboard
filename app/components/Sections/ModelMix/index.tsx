import type {FC} from 'react';
import {twMerge} from 'tailwind-merge';
import HorizontalBars from '~/components/Charts/HorizontalBars';
import {formatCompactNumber} from '~/components/Charts/scale-helpers';
import StackedWeeklyBars from '~/components/Charts/StackedWeeklyBars';
import EmptyState from '~/components/EmptyState';
import {
  buildModelTotalsData,
  buildModelWeeklyData,
} from '~/components/Sections/ModelMix/model-mix-data';
import Skeleton, {shimmer} from '~/components/Skeleton';
import type {ActivityResponse} from '~/data/schemas/api';

export type ModelMixProps = {
  /** Overrides the viewer's browser locale; mainly for deterministic tests. */
  locale?: string;
  modelTotals: ActivityResponse['modelTotals'];
  modelWeekly: ActivityResponse['modelWeekly'];
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-6 rounded-md border p-6';

export const eyebrowClassName =
  'text-secondary-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'font-display text-fg text-2xl font-light';

export const captionClassName = 'text-fg-mute text-sm';
const chartHeadingClassName = 'text-fg-dim text-sm font-medium';

/**
 * SPEC 6.5: total output tokens per model (horizontal bars, bucket detail on
 * hover) and a stacked by-week output-tokens series per model. Wraps the W8
 * HorizontalBars + StackedWeeklyBars kits; owns the section chrome and maps
 * ActivityResponse.modelTotals / modelWeekly into their props. Presentational:
 * the integrator hands this already-fetched ActivityResponse slice through
 * AsyncSection's render prop.
 */
const ModelMix: FC<ModelMixProps> = ({locale, modelTotals, modelWeekly}) => {
  const totalsData = buildModelTotalsData(modelTotals, locale);
  const {seriesLabels, weeklyData} = buildModelWeeklyData(modelWeekly);
  // weeklyData always carries one entry per input week, even when every
  // model that week was `<synthetic>` and filtered out to an empty `values`
  // record: gate on real per-week content, not on array length, or an
  // all-synthetic dataset would misread as populated (a hollow chart).
  const hasActivity =
    totalsData.length > 0 ||
    weeklyData.some((week) => Object.keys(week.values).length > 0);

  return (
    <div className={sectionChromeClassName}>
      <header>
        <p className={eyebrowClassName}>Model Usage</p>
        <h2 className={headingClassName}>Which models do the work</h2>
        <p className={captionClassName}>
          Output tokens per model, in total and week by week.
        </p>
      </header>
      {hasActivity ?
        <div className="grid gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className={chartHeadingClassName}>Output tokens by model</h3>
            <HorizontalBars
              data={totalsData}
              formatValue={(value) => formatCompactNumber(value, locale)}
              label="Output tokens by model"
            />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className={chartHeadingClassName}>
              Output tokens by model, weekly
            </h3>
            <StackedWeeklyBars
              data={weeklyData}
              label="Output tokens by model, weekly"
              locale={locale}
              seriesLabels={seriesLabels}
            />
          </div>
        </div>
      : <EmptyState
          description="No model activity recorded yet. Once GAIA sees model work, totals and weekly trends fill in here."
          title="No model activity yet"
        />
      }
    </div>
  );
};

export default ModelMix;

/** Pixel-matching loading placeholder for AsyncSection's `skeleton` prop. */
export const ModelMixSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={sectionChromeClassName}
    data-testid="model-mix-skeleton"
  >
    <header>
      <p className={twMerge(eyebrowClassName, shimmer)}>Model Usage</p>
      <h2 className={twMerge(headingClassName, shimmer)}>
        Which models do the work
      </h2>
      <p className={twMerge(captionClassName, shimmer)}>
        Output tokens per model, in total and week by week.
      </p>
    </header>
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className={twMerge(chartHeadingClassName, shimmer)}>
          Output tokens by model
        </h3>
        <Skeleton className="h-40 w-full max-w-120" />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className={twMerge(chartHeadingClassName, shimmer)}>
          Output tokens by model, weekly
        </h3>
        <Skeleton className="h-52 w-full max-w-140" />
      </div>
    </div>
  </div>
);
