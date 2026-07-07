import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {streamJsonl} from '~/data/parse/jsonl-stream';
import {costRecordSchema} from '~/data/schemas/cost-record';
import type {
  CostBucketTotals,
  CostRecord,
  CostSplitBuckets,
} from '~/data/schemas/cost-record';

const fixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/cost-jsonl/cost.jsonl', import.meta.url)
);

/**
 * SPEC section 4.1 invariant: collapsing each by_agent_type entry's
 * cache_write_5m + cache_write_1h into cache_write and summing across entries
 * reproduces the row's top-level buckets and total exactly.
 */
const collapseAcrossAgentTypes = (
  entries: Record<string, CostSplitBuckets>
): CostBucketTotals => {
  const collapsed = {cache_read: 0, cache_write: 0, fresh_input: 0, output: 0};

  for (const entry of Object.values(entries)) {
    collapsed.cache_read += entry.cache_read;
    collapsed.cache_write += entry.cache_write_5m + entry.cache_write_1h;
    collapsed.fresh_input += entry.fresh_input;
    collapsed.output += entry.output;
  }

  return collapsed;
};

const sumBuckets = (buckets: CostBucketTotals): number =>
  buckets.cache_read +
  buckets.cache_write +
  buckets.fresh_input +
  buckets.output;

describe('cost.jsonl by_agent_type equality invariant', () => {
  test('every fixture row with by_agent_type collapses back to buckets/total', async () => {
    const rowsWithAgentTypes: CostRecord[] = [];

    await streamJsonl(fixturePath, (record) => {
      const parsed = costRecordSchema.safeParse(record);

      if (parsed.success && parsed.data.by_agent_type) {
        rowsWithAgentTypes.push(parsed.data);
      }
    });

    // The fixture must actually exercise the invariant.
    expect(rowsWithAgentTypes.length).toBeGreaterThanOrEqual(4);

    for (const row of rowsWithAgentTypes) {
      const collapsed = collapseAcrossAgentTypes(
        row.by_agent_type as Record<string, CostSplitBuckets>
      );

      expect(collapsed).toEqual({
        cache_read: row.buckets.cache_read,
        cache_write: row.buckets.cache_write,
        fresh_input: row.buckets.fresh_input,
        output: row.buckets.output,
      });
      expect(sumBuckets(collapsed)).toBe(row.total);
    }
  });
});
