import {render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ParseHealth from '~/components/Sections/ParseHealth';
import type {ParseHealthSlice} from '~/data/schemas/api';
import {parseHealthSliceSchema} from '~/data/schemas/api';

// This suite runs under happy-dom (app/components/**), which rewrites
// import.meta.url to an http URL, so fixtures resolve from cwd instead.
const loadFixture = (fileName: string): ParseHealthSlice => {
  const fixturePath = path.join(
    process.cwd(),
    'test/fixtures/parse-health',
    fileName
  );

  return parseHealthSliceSchema.parse(
    JSON.parse(readFileSync(fixturePath, 'utf8'))
  );
};

const costsDirty = loadFixture('costs-dirty.json');
const activityDirty = loadFixture('activity-dirty.json');
const costsClean = loadFixture('costs-clean.json');
const activityClean = loadFixture('activity-clean.json');

test('renders nothing at all when both slices are clean', () => {
  const {container} = render(
    <ParseHealth
      activityParseHealth={activityClean}
      costsParseHealth={costsClean}
    />
  );

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText(/parse health/i)).not.toBeInTheDocument();
});

test('renders a problems card, always expanded, when something did not parse', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  const card = screen.getByTestId('parse-health');

  expect(within(card).getByText('Parse health')).toBeInTheDocument();
  expect(within(card).getByText(/didn't parse cleanly/i)).toBeInTheDocument();
});

test('surfaces per-source skip/unparseable counts from both merged slices', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  const card = within(screen.getByTestId('parse-health'));

  expect(card.getByText('cost.jsonl')).toBeInTheDocument();
  expect(card.getByText(/2 \/ 482 lines skipped/)).toBeInTheDocument();
  expect(card.getByText('plans/ledger.json')).toBeInTheDocument();
  expect(card.getByText(/1 \/ 1 files unparseable/)).toBeInTheDocument();
  expect(card.getByText('session-logs')).toBeInTheDocument();
  expect(card.getByText(/9 \/ 15230 lines skipped/)).toBeInTheDocument();
});

test('surfaces unknown kind/status values deduplicated across sources', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  const card = within(screen.getByTestId('parse-health'));

  // "review" is an unknown kind on both sides; the union renders it once.
  expect(card.getAllByText('review')).toHaveLength(1);
  expect(card.getByText('superseded')).toBeInTheDocument();
  expect(card.getByText('paused')).toBeInTheDocument();
});

test('surfaces notes verbatim, including a cost.md phase the backfill missed', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  const card = within(screen.getByTestId('parse-health'));

  expect(
    card.getByText(/SPEC-014 has an archived cost\.md phase section/)
  ).toBeInTheDocument();
  expect(card.getByText(/unsupported schema_version 2/)).toBeInTheDocument();
});
