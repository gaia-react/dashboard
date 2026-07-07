import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import {z} from 'zod';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import CostTable, {CostTableSkeleton} from '~/components/Sections/CostTable';
import type {CostEntry, SessionSummary} from '~/data/schemas/api';
import {costEntrySchema, sessionSummarySchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
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

const showPlans = (): void => {
  fireEvent.click(screen.getByRole('button', {name: /plans \(/i}));
};

const dataRowKeys = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1) // drop the header row
    .map((row) => row.getAttribute('id'))
    .filter((id): id is string => id?.startsWith('cost-entry-') ?? false);

test('renders an intentional empty state when there are no entries', () => {
  render(<CostTable entries={emptyEntries} />);

  expect(screen.getByText('No spec or plan cost yet')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('defaults to the specs table and toggles to plans in place', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('button', {name: 'Specs (3)'})).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  // Spec rows only; plan/slug rows are hidden until the toggle flips.
  expect(screen.getByRole('row', {name: /SPEC-201/})).toBeInTheDocument();
  expect(screen.queryByRole('row', {name: /PLAN-090/})).not.toBeInTheDocument();

  showPlans();

  expect(screen.getByRole('button', {name: 'Plans (3)'})).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByRole('row', {name: /PLAN-090/})).toBeInTheDocument();
  expect(screen.queryByRole('row', {name: /SPEC-201/})).not.toBeInTheDocument();
});

test('sorts each table newest-first', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(dataRowKeys()).toEqual([
    'cost-entry-SPEC-777',
    'cost-entry-SPEC-201',
    'cost-entry-SPEC-150',
  ]);

  showPlans();

  expect(dataRowKeys()).toEqual([
    'cost-entry-PLAN-090',
    'cost-entry-slug-archive-notes',
    'cost-entry-slug-legacy-onboarding',
  ]);
});

test('drops the source column but keeps the partial marker on the status cell', () => {
  render(<CostTable entries={populatedEntries} />);

  // No source badges anywhere now that the column is gone.
  expect(screen.queryByText('Native')).not.toBeInTheDocument();
  expect(screen.queryByText('Backfill')).not.toBeInTheDocument();
  expect(screen.queryByText('None')).not.toBeInTheDocument();

  const partialRow = screen.getByRole('row', {name: /SPEC-150/});

  expect(within(partialRow).getByText('Partial')).toBeInTheDocument();
});

test('renames the money and duration headers to Cost $ and Time', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(
    screen.getByRole('columnheader', {name: 'Cost $'})
  ).toBeInTheDocument();
  expect(screen.getByRole('columnheader', {name: 'Time'})).toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', {name: 'Recorded $'})
  ).not.toBeInTheDocument();
});

test('renders status initial-capped and missing figures as a dash', () => {
  render(<CostTable entries={populatedEntries} />);

  const draftRow = screen.getByRole('row', {name: /SPEC-777/});

  // "draft" -> "Draft", and its null cost/time cells read "-".
  expect(within(draftRow).getByText('Draft')).toBeInTheDocument();
  expect(screen.getByTestId('recorded-dollars-SPEC-777')).toHaveTextContent(
    '-'
  );
});

test('a slug row shows a dash for its absent id and status', () => {
  render(<CostTable entries={populatedEntries} />);

  showPlans();

  const slugRow = screen.getByRole('row', {name: /legacy-onboarding/});

  expect(within(slugRow).getByText('legacy-onboarding')).toBeInTheDocument();
  // No id and no status: both render the same neutral dash (cost/time exist).
  expect(within(slugRow).getAllByText('-')).toHaveLength(2);
});

test('explains the dash convention once above the table when a figure is missing', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(screen.getAllByText(/ledger recorded no figure/i)).toHaveLength(1);
});

test('each row carries the cost-entry anchor id SessionsList jump-links to', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('row', {name: /SPEC-201/})).toHaveAttribute(
    'id',
    'cost-entry-SPEC-201'
  );

  showPlans();

  expect(screen.getByRole('row', {name: /legacy-onboarding/})).toHaveAttribute(
    'id',
    'cost-entry-slug-legacy-onboarding'
  );
});

test('clicking anywhere on a row expands it; the chevron collapses it back', async () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('row', {name: /SPEC-201/}));

  expect(screen.getByTestId('cost-row-detail-SPEC-201')).toBeInTheDocument();
  expect(
    screen.getByRole('button', {name: /collapse spec-201/i})
  ).toHaveAttribute('aria-expanded', 'true');

  fireEvent.click(screen.getByRole('button', {name: /collapse spec-201/i}));

  // The collapse animates, then the row unmounts.
  await waitFor(() => {
    expect(
      screen.queryByTestId('cost-row-detail-SPEC-201')
    ).not.toBeInTheDocument();
  });
});

test('expanding a native row reveals per-phase detail with humanized labels', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-201/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-201');

  // Phase kinds and agent types are sentence-cased; model ids humanized; the
  // raw "native" source label no longer appears.
  expect(within(detail).getByText('Spec')).toBeInTheDocument();
  expect(within(detail).getByText('Execute')).toBeInTheDocument();
  expect(within(detail).queryByText('native')).not.toBeInTheDocument();
  expect(within(detail).getAllByText('Claude Opus 4.8').length).toBeGreaterThan(
    0
  );
  expect(within(detail).getByText('Claude Sonnet 4.6')).toBeInTheDocument();
  expect(within(detail).getAllByText('Main').length).toBeGreaterThan(0);
  expect(within(detail).getByText('General purpose')).toBeInTheDocument();
});

test('expanding a backfill-only row shows phase detail with no breakdown', () => {
  render(<CostTable entries={populatedEntries} />);

  fireEvent.click(screen.getByRole('button', {name: /expand spec-150/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-150');

  expect(within(detail).getByText('Spec')).toBeInTheDocument();
  expect(
    within(detail).queryByText(/by model|by agent|claude/i)
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

test('a resolved session shows timestamp-first detail and a working jump-link', () => {
  const onViewSession = vi.fn();

  render(
    <CostTable
      entries={populatedEntries}
      onViewSession={onViewSession}
      sessions={sessions}
    />
  );

  fireEvent.click(screen.getByRole('button', {name: /expand spec-201/i}));

  const detail = screen.getByTestId('cost-row-detail-SPEC-201');

  expect(
    within(detail).queryByTestId('session-detail-skeleton')
  ).not.toBeInTheDocument();
  expect(
    within(detail).getByText('Refactor telemetry ingestion pipeline')
  ).toBeInTheDocument();

  const jumpLink = within(detail).getByRole('link', {
    name: /view in sessions/i,
  });

  expect(jumpLink).toHaveAttribute(
    'href',
    '?tab=sessions&session=session-201-a'
  );

  fireEvent.click(jumpLink);
  expect(onViewSession).toHaveBeenCalledWith('session-201-a');
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
