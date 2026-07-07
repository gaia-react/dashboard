import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ParseHealth, {
  ParseHealthSkeleton,
} from '~/components/Sections/ParseHealth';
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

const getFooter = (): HTMLElement => screen.getByTestId('parse-health-footer');
const getSummary = (): HTMLElement =>
  screen.getByTestId('parse-health-summary');
const getDetailBody = (): HTMLElement =>
  screen.getByTestId('parse-health-detail');

const expandFooter = (): void => {
  fireEvent.click(getSummary());
};

test('is collapsed by default with a quiet summary when both slices are clean', () => {
  render(
    <ParseHealth
      activityParseHealth={activityClean}
      costsParseHealth={costsClean}
    />
  );

  expect(getFooter()).not.toHaveAttribute('open');
  expect(
    within(getSummary()).getByText('Everything parsed cleanly')
  ).toBeInTheDocument();
});

test('expands on click to show its detail region', () => {
  render(
    <ParseHealth
      activityParseHealth={activityClean}
      costsParseHealth={costsClean}
    />
  );

  expandFooter();

  expect(getFooter()).toHaveAttribute('open');
  expect(
    within(getDetailBody()).getByText(/No skipped lines, unparseable files/)
  ).toBeInTheDocument();
});

test('the collapsed summary reads a quiet clean message, not an issue count, when clean', () => {
  render(
    <ParseHealth
      activityParseHealth={activityClean}
      costsParseHealth={costsClean}
    />
  );

  const summary = within(getSummary());

  expect(summary.getByText('Everything parsed cleanly')).toBeInTheDocument();
  expect(summary.queryByText(/lines skipped/)).not.toBeInTheDocument();
});

test('stays collapsed by default even when the merged data is dirty/informative', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  expect(getFooter()).not.toHaveAttribute('open');
});

test('the collapsed summary reads as an issue count, not a clean message, when dirty', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  const summary = within(getSummary());

  expect(
    summary.queryByText('Everything parsed cleanly')
  ).not.toBeInTheDocument();
  expect(summary.getByText(/lines skipped/)).toBeInTheDocument();
});

test('surfaces per-source skip/unparseable counts from both merged slices', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  expandFooter();

  const detail = within(getDetailBody());

  expect(detail.getByText('cost.jsonl')).toBeInTheDocument();
  expect(detail.getByText(/2 \/ 482 lines skipped/)).toBeInTheDocument();
  expect(detail.getByText('plans/ledger.json')).toBeInTheDocument();
  expect(detail.getByText(/1 \/ 1 files unparseable/)).toBeInTheDocument();
  expect(detail.getByText('session-logs')).toBeInTheDocument();
  expect(detail.getByText(/9 \/ 15230 lines skipped/)).toBeInTheDocument();
});

test('surfaces unknown kind/status values deduplicated across sources', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  expandFooter();

  const detail = within(getDetailBody());

  // "review" is an unknown kind on both sides; the union renders it once.
  expect(detail.getAllByText('review')).toHaveLength(1);
  expect(detail.getByText('superseded')).toBeInTheDocument();
  expect(detail.getByText('paused')).toBeInTheDocument();
});

test('surfaces notes verbatim, including a cost.md phase the backfill missed', () => {
  render(
    <ParseHealth
      activityParseHealth={activityDirty}
      costsParseHealth={costsDirty}
    />
  );

  expandFooter();

  const detail = within(getDetailBody());

  expect(
    detail.getByText(/SPEC-014 has an archived cost\.md phase section/)
  ).toBeInTheDocument();
  expect(detail.getByText(/unsupported schema_version 2/)).toBeInTheDocument();
});

test('the summary trigger carries a visible focus ring for keyboard users', () => {
  render(
    <ParseHealth
      activityParseHealth={activityClean}
      costsParseHealth={costsClean}
    />
  );

  expect(getSummary()).toHaveClass('focus-visible:outline-2');
});

test('ParseHealthSkeleton renders a collapsed-footer placeholder hidden from assistive tech', () => {
  render(<ParseHealthSkeleton />);

  const skeleton = screen.getByTestId('parse-health-skeleton');
  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  expect(within(skeleton).getByText('Parse health')).toBeInTheDocument();
});
