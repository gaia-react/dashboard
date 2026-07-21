import {expect, test} from 'vitest';
import {formatDollars} from '~/components/Sections/KpiRow/format-kpi';

test('formatDollars renders a two-decimal USD amount', () => {
  expect(formatDollars(14.35, 'en-US')).toBe('$14.35');
  expect(formatDollars(0, 'en-US')).toBe('$0.00');
});
