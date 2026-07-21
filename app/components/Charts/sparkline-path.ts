/**
 * Sparkline path geometry (DESIGN-SPEC 6.3): a value list to a polyline path
 * inside a viewBox, reusing the shared linear scale rather than duplicating
 * scaling math. An all-equal series would divide by zero on a naive
 * min/max scale, so it is special-cased to a flat line at mid-height. A
 * single point draws as a zero-length line, which a round line cap (the
 * component's mark spec) renders as a clean dot rather than nothing.
 */

import {createLinearScale} from '~/components/Charts/scale-helpers';

const round = (value: number): number => Math.round(value * 100) / 100;

export const sparklinePath = (
  values: number[],
  box: {height: number; width: number}
): string => {
  const {height, width} = box;

  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    const x = round(width / 2);
    const y = round(height / 2);

    return `M${x} ${y}L${x} ${y}`;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const xScale = createLinearScale([0, values.length - 1], [0, width]);
  const yScale =
    minValue === maxValue ?
      (): number => height / 2
    : createLinearScale([minValue, maxValue], [height, 0]);

  const points = values.map(
    (value, index) => `${round(xScale(index))} ${round(yScale(value))}`
  );

  return `M${points.join('L')}`;
};
