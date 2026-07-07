import type {Buckets} from '~/data/schemas/api';

/** USD, always two decimals; `locale` is exposed only for test determinism. */
export const formatDollars = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale, {
    currency: 'USD',
    style: 'currency',
  }).format(value);

/** Total tokens across all four buckets, for the KPI row's headline number. */
export const sumBuckets = (buckets: Buckets): number =>
  buckets.cacheRead + buckets.cacheWrite + buckets.freshInput + buckets.output;
