import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {z} from 'zod';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import CostTable, {CostTableSkeleton} from '~/components/Sections/CostTable';
import {NO_DATA_LABEL} from '~/components/Sections/CostTable/format';
import type {CostEntry, SessionSummary} from '~/data/schemas/api';
import {costEntrySchema, sessionSummarySchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (matches app/components/Charts/CalendarHeatmap/tests and the Sections
// siblings already in tree).
const readFixture = <TData,>(schema: z.ZodType<TData>, name: string): TData =>
  schema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/cost-table', name),
        'utf8'
      )
    )
  );

const entriesArraySchema = z.array(costEntrySchema);
const sessionsArraySchema = z.array(sessionSummarySchema);

const emptyEntries = readFixture<CostEntry[]>(
  entriesArraySchema,
  'entries-empty.json'
);
const populatedEntries = readFixture<CostEntry[]>(
  entriesArraySchema,
  'entries-populated.json'
);
const sessions = readFixture<SessionSummary[]>(
  sessionsArraySchema,
  'sessions.json'
);

test('renders an intentional empty state when there are no entries', () => {
  render(<CostTable entries={emptyEntries} />);

  expect(screen.getByText('No spec or plan cost yet')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('renders one row per entry in the given chronological order', () => {
  render(<CostTable entries={populatedEntries} />);

  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row').slice(1); // drop the header row

  expect(rows).toHaveLength(populatedEntries.length);

  for (const [index, entry] of populatedEntries.entries()) {
    expect(rows[index]).toHaveTextContent(entry.title);
  }
});

test('slug rows are titled by slug with no status column value', () => {
  render(<CostTable entries={populatedEntries} />);

  const slugRow = screen.getByRole('row', {
    name: /legacy-onboarding/,
  });

  expect(within(slugRow).getByText('legacy-onboarding')).toBeInTheDocument();
  // No id and no status for a slug row: both render the same neutral dash.
  expect(within(slugRow).getAllByText('-')).toHaveLength(2);
});

test('missing recorded cost renders an em-free "no data" cell, explained once above the table', () => {
  render(<CostTable entries={populatedEntries} />);

  // SPEC-150 (backfill, no recorded dollars) and SPEC-777 (source: none)
  // both lack a recorded-cost figure.
  expect(screen.getByTestId('recorded-dollars-SPEC-150')).toHaveTextContent(
    NO_DATA_LABEL
  );
  expect(screen.getByTestId('recorded-dollars-SPEC-777')).toHaveTextContent(
    NO_DATA_LABEL
  );
  expect(
    screen.getAllByText(/no ledger dollar figure|no recorded cost/i)
  ).toHaveLength(1);
});

test('renders a source badge per entry and a partial badge only where applicable', () => {
  render(<CostTable entries={populatedEntries} />);

  const nativeRow = screen.getByRole('row', {name: /SPEC-201/});
  const backfillRow = screen.getByRole('row', {name: /SPEC-150/});
  const mixedRow = screen.getByRole('row', {name: /PLAN-090/});
  const noneRow = screen.getByRole('row', {name: /SPEC-777/});

  expect(within(nativeRow).getByText('Native')).toBeInTheDocument();
  expect(within(backfillRow).getByText('Backfill')).toBeInTheDocument();
  expect(within(backfillRow).getByText('Partial')).toBeInTheDocument();
  expect(within(mixedRow).getByText('Mixed')).toBeInTheDocument();
  expect(within(noneRow).getByText('None')).toBeInTheDocument();
  expect(within(nativeRow).queryByText('Partial')).not.toBeInTheDocument();
});

test("each row carries the cost-entry anchor id SessionsList's attribution badge jump-links to", () => {
  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('row', {name: /SPEC-201/})).toHaveAttribute(
    'id',
    'cost-entry-SPEC-201'
  );
  expect(screen.getByRole('row', {name: /legacy-onboarding/})).toHaveAttribute(
    'id',
    'cost-entry-slug-legacy-onboarding'
  );
});

test('expanding a native row reveals per-phase detail with model and agent-type breakdowns', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-201/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-201');

  expect(within(detail).getByText('spec')).toBeInTheDocument();
  expect(within(detail).getByText('execute')).toBeInTheDocument();
  // claude-opus-4-8 breaks down in both phases; at least one is enough to
  // prove the per-model section rendered.
  expect(within(detail).getAllByText('claude-opus-4-8').length).toBeGreaterThan(
    0
  );
  expect(within(detail).getByText('claude-sonnet-4-6')).toBeInTheDocument();
  expect(within(detail).getAllByText('main').length).toBeGreaterThan(0);
  expect(within(detail).getByText('general-purpose')).toBeInTheDocument();
});

test('expanding a backfill-only row shows phase detail with no model or agent-type breakdown', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-150/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-150');

  expect(within(detail).getByText('spec')).toBeInTheDocument();
  expect(
    within(detail).queryByText(/claude-opus-4-8|by model|by agent/i)
  ).not.toBeInTheDocument();
});

test('collapses an expanded row back on a second click', () => {
  render(<CostTable entries={populatedEntries} />);

  const toggle = screen.getByRole('button', {name: /expand spec-201/i});

  fireEvent.click(toggle);
  expect(screen.getByTestId('cost-row-detail-SPEC-201')).toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  fireEvent.click(screen.getByRole('button', {name: /collapse spec-201/i}));
  expect(
    screen.queryByTestId('cost-row-detail-SPEC-201')
  ).not.toBeInTheDocument();
});

test('log-missing sessions are badged and never blocked on activity data', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-201/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-201');

  expect(within(detail).getByText('Log missing')).toBeInTheDocument();
  // Its sibling session (logFound: true) has no activity data yet, so it
  // shows a skeleton rather than blocking the row expand on the join.
  expect(
    within(detail).getByTestId('session-detail-skeleton')
  ).toBeInTheDocument();
});

test('once activity data arrives, a found session enriches with title, date, duration, and a jump-link', () => {
  render(<CostTable entries={populatedEntries} sessions={sessions} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-201/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-201');

  expect(
    within(detail).queryByTestId('session-detail-skeleton')
  ).not.toBeInTheDocument();
  expect(
    within(detail).getByText('Refactor telemetry ingestion pipeline')
  ).toBeInTheDocument();
  expect(within(detail).getByText('Log missing')).toBeInTheDocument();

  const jumpLink = within(detail).getByRole('link', {
    name: /view in sessions/i,
  });

  expect(jumpLink).toHaveAttribute('href', '#session-session-201-a');
  expect(jumpLink).toHaveClass('focus-visible:outline-2');
});

test('a logged session absent from the resolved activity data falls back gracefully, without a skeleton', () => {
  render(<CostTable entries={populatedEntries} sessions={sessions} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-150/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-150');

  expect(within(detail).getByText('session-150-a')).toBeInTheDocument();
  expect(
    within(detail).queryByTestId('session-detail-skeleton')
  ).not.toBeInTheDocument();
});

test('expanding a row with no phase or session data shows no empty section headings', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-777/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-777');

  expect(within(detail).queryByText('Phases')).not.toBeInTheDocument();
  expect(within(detail).queryByText('Sessions')).not.toBeInTheDocument();
});

test('CostTableSkeleton renders a pixel-matching placeholder hidden from assistive tech', () => {
  render(<CostTableSkeleton />);

  const skeleton = screen.getByTestId('cost-table-skeleton');

  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  expect(within(skeleton).getAllByTestId('skeleton').length).toBeGreaterThan(0);
});
