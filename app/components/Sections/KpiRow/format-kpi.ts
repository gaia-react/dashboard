import type {Buckets} from '~/data/schemas/api';

const DOLLARS_OPTIONS: Intl.NumberFormatOptions = {
  currency: 'USD',
  style: 'currency',
};
const defaultDollarsFormat = new Intl.NumberFormat(undefined, DOLLARS_OPTIONS);

/** USD, always two decimals; `locale` is exposed only for test determinism,
 * so the hoisted formatter above covers every real call. */
export const formatDollars = (value: number, locale?: string): string =>
  (locale === undefined ? defaultDollarsFormat : (
    new Intl.NumberFormat(locale, DOLLARS_OPTIONS)
  )
  ).format(value);

/** Total tokens across all four buckets, for the KPI row's headline number. */
export const sumBuckets = (buckets: Buckets): number =>
  buckets.cacheRead + buckets.cacheWrite + buckets.freshInput + buckets.output;
