/**
 * SVG path builders for bar marks: 4px rounded data-end, square at the
 * baseline (dataviz mark spec). The radius clamps on slivers so tiny bars
 * never invert their arcs.
 */

export type BarRectangle = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const DEFAULT_CORNER_RADIUS = 4;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Grows left to right; the right (data) end is rounded. */
export const horizontalBarPath = (
  rectangle: BarRectangle,
  cornerRadius: number = DEFAULT_CORNER_RADIUS
): string => {
  const {height, width, x, y} = rectangle;

  if (width <= 0 || height <= 0) {
    return '';
  }

  const radius = round2(Math.max(0, Math.min(cornerRadius, width, height / 2)));
  const left = round2(x);
  const top = round2(y);
  const right = round2(x + width);
  const bottom = round2(y + height);
  const beforeArc = round2(right - radius);

  return (
    `M${left} ${top}H${beforeArc}A${radius} ${radius} 0 0 1 ${right} ${round2(top + radius)}` +
    `V${round2(bottom - radius)}A${radius} ${radius} 0 0 1 ${beforeArc} ${bottom}H${left}Z`
  );
};

/** Grows bottom to top; the top (data) end is rounded. */
export const verticalBarPath = (
  rectangle: BarRectangle,
  cornerRadius: number = DEFAULT_CORNER_RADIUS
): string => {
  const {height, width, x, y} = rectangle;

  if (width <= 0 || height <= 0) {
    return '';
  }

  const radius = round2(Math.max(0, Math.min(cornerRadius, height, width / 2)));
  const left = round2(x);
  const top = round2(y);
  const right = round2(x + width);
  const bottom = round2(y + height);
  const belowArc = round2(top + radius);

  return (
    `M${left} ${bottom}V${belowArc}A${radius} ${radius} 0 0 1 ${round2(left + radius)} ${top}` +
    `H${round2(right - radius)}A${radius} ${radius} 0 0 1 ${right} ${belowArc}V${bottom}Z`
  );
};
