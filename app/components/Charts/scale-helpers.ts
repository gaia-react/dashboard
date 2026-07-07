/**
 * Scale math for the hand-rolled SVG chart kit (PLAN D1). Linear and band
 * scales are the only scales the four v1 charts need.
 */

export type LinearScale = (value: number) => number;

export const createLinearScale = (
  domain: [number, number],
  range: [number, number]
): LinearScale => {
  const [domainStart, domainEnd] = domain;
  const [rangeStart, rangeEnd] = range;
  const domainSpan = domainEnd - domainStart;

  return (value) =>
    domainSpan === 0 ? rangeStart : (
      rangeStart +
      ((value - domainStart) / domainSpan) * (rangeEnd - rangeStart)
    );
};

export type BandScale = {
  bandwidth: number;
  position: (key: string) => number;
  step: number;
};

export const createBandScale = (
  keys: string[],
  range: [number, number],
  paddingRatio = 0.2
): BandScale => {
  const [rangeStart, rangeEnd] = range;
  const step = keys.length === 0 ? 0 : (rangeEnd - rangeStart) / keys.length;
  const bandwidth = step * (1 - paddingRatio);
  const offset = (step * paddingRatio) / 2;
  const positions = new Map(
    keys.map((key, index) => [key, rangeStart + index * step + offset])
  );

  return {
    bandwidth,
    position: (key) => positions.get(key) ?? rangeStart,
    step,
  };
};

const TICK_STEP_CANDIDATES = [1, 2, 2.5, 5, 10];

/**
 * Round tick values from 0 up to the first clean multiple covering maxValue,
 * so the top tick can double as the axis max.
 */
export const niceTicks = (maxValue: number, tickCount = 4): number[] => {
  if (maxValue <= 0) {
    return [0];
  }

  const rawStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const candidate =
    TICK_STEP_CANDIDATES.find((option) => option >= normalized) ?? 10;
  const step = candidate * magnitude;
  const topTick = step * Math.ceil(maxValue / step);
  const ticks: number[] = [];

  for (let tick = 0; tick <= topTick; tick += step) {
    ticks.push(tick);
  }

  return ticks;
};

export const formatCompactNumber = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale, {notation: 'compact'}).format(value);
