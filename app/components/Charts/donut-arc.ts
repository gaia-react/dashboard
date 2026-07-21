/**
 * Donut ring geometry (DESIGN-SPEC 6.1): a value list to annular-sector arc
 * paths, centered on the origin (the component translates into its
 * viewBox). A full 2*pi sweep cannot be expressed as a single SVG arc
 * command: when the arc's start and end points coincide, the SVG spec has
 * the renderer omit the segment entirely, so a naive single-segment donut
 * would draw nothing. donutArcPath splits a full sweep into two half-circle
 * arcs instead, so a single 100% segment still renders a full ring.
 */

export type DonutArc = {
  /** Radians, clockwise from 12 o'clock. */
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
};

export type DonutSegment = {
  endAngle: number;
  key: string;
  share: number;
  startAngle: number;
};

const TAU = Math.PI * 2;
const FULL_CIRCLE_EPSILON = 1e-6;

const round = (value: number): number => Math.round(value * 100) / 100;

const pointOnCircle = (
  radius: number,
  angle: number
): {x: number; y: number} => ({
  x: round(radius * Math.sin(angle)),
  y: round(-radius * Math.cos(angle)),
});

/** One annular sector, for a sweep strictly less than a full circle. */
const sectorPath = (arc: DonutArc): string => {
  const {endAngle, innerRadius, outerRadius, startAngle} = arc;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = pointOnCircle(outerRadius, startAngle);
  const outerEnd = pointOnCircle(outerRadius, endAngle);
  const innerEnd = pointOnCircle(innerRadius, endAngle);
  const innerStart = pointOnCircle(innerRadius, startAngle);

  return (
    `M${outerStart.x} ${outerStart.y}` +
    `A${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}` +
    `L${innerEnd.x} ${innerEnd.y}` +
    `A${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}Z`
  );
};

export const donutArcPath = (arc: DonutArc): string => {
  const {endAngle, innerRadius, outerRadius, startAngle} = arc;
  const sweep = endAngle - startAngle;

  if (sweep <= 0) {
    return '';
  }

  if (sweep >= TAU - FULL_CIRCLE_EPSILON) {
    const midAngle = startAngle + Math.PI;

    return (
      sectorPath({endAngle: midAngle, innerRadius, outerRadius, startAngle}) +
      sectorPath({
        endAngle: startAngle + TAU,
        innerRadius,
        outerRadius,
        startAngle: midAngle,
      })
    );
  }

  return sectorPath(arc);
};

/**
 * Proportional shares of one full turn, in series order, with a geometric
 * gap (padAngle) between every adjacent pair, including the wrap from the
 * last segment back to the first. A single segment gets no gap and sweeps
 * the entire circle. Non-positive values are excluded from the total but
 * still zero-sweep in position; a value list that sums to zero (or is
 * empty) produces no segments.
 */
export const donutSegments = (
  values: {key: string; value: number}[],
  padAngle = 0.02
): DonutSegment[] => {
  const total = values.reduce((sum, {value}) => sum + Math.max(0, value), 0);

  if (total <= 0) {
    return [];
  }

  const gap = values.length > 1 ? padAngle : 0;
  const available = TAU - gap * values.length;
  let cursor = 0;

  return values.map(({key, value}) => {
    const share = Math.max(0, value) / total;
    const sweep = share * available;
    const startAngle = cursor + gap / 2;
    const endAngle = startAngle + sweep;

    cursor += sweep + gap;

    return {endAngle, key, share, startAngle};
  });
};
