import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';

export type LegendItem = {
  label: string;
  /** bg-* token class for the swatch. */
  swatchClassName: string;
  /** Opacity step for single-hue ramps (heatmap buckets). */
  swatchOpacity?: number;
};

/**
 * Shared legend for the chart kit: always rendered for two or more series
 * (identity is never color-alone), token-styled, swatches mirror the marks.
 */
const ChartLegend: FC<{items: LegendItem[]}> = ({items}) => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
    {items.map((item) => (
      <li
        key={item.label}
        className="text-fg-dim flex items-center gap-1.5 text-xs"
      >
        <span
          aria-hidden={true}
          className={twJoin('size-2.5 rounded-xs', item.swatchClassName)}
          style={
            item.swatchOpacity === undefined ?
              undefined
            : {opacity: item.swatchOpacity}
          }
        />
        {item.label}
      </li>
    ))}
  </ul>
);

export default ChartLegend;
