import {describe, expect, test} from 'vitest';
import {fileURLToPath} from 'node:url';
import {streamJsonl} from '~/data/parse/jsonl-stream';

const malformedFixture = fileURLToPath(
  new URL(
    '../../../../test/fixtures/jsonl/malformed-lines.jsonl',
    import.meta.url
  )
);

describe('streamJsonl', () => {
  test('delivers valid records and captures malformed lines without throwing', async () => {
    const records: unknown[] = [];

    const result = await streamJsonl(malformedFixture, (record) => {
      records.push(record);
    });

    // 6 non-blank lines, 4 valid, 2 malformed; the blank line is skipped.
    expect(result.linesRead).toBe(6);
    expect(result.parsed).toBe(4);
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({spec_id: 'SPEC-001'});

    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((error) => error.lineNumber)).toEqual([3, 6]);
    expect(result.errors[0]).toMatchObject({raw: 'this is not json'});
  });

  test('reports zero lines for an all-blank stream and never invokes the callback', async () => {
    let called = false;
    const emptyFixture = fileURLToPath(
      new URL('../../../../test/fixtures/jsonl/blank.jsonl', import.meta.url)
    );

    const result = await streamJsonl(emptyFixture, () => {
      called = true;
    });

    expect(called).toBe(false);
    expect(result).toEqual({errors: [], linesRead: 0, parsed: 0});
  });
});
