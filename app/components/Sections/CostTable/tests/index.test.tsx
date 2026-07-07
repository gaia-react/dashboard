import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
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

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

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

  expect(jumpLink).toHaveAttribute('href', '?tab=sessions&id=session-201-a');

  fireEvent.click(jumpLink);
  expect(onViewSession).toHaveBeenCalledWith('session-201-a');
});

test('a row with no phase or session data has no expand affordance and cannot be clicked', () => {
  render(<CostTable entries={populatedEntries} />);

  const emptyRow = screen.getByRole('row', {name: /SPEC-777/});

  expect(
    screen.queryByRole('button', {name: /expand spec-777/i})
  ).not.toBeInTheDocument();
  expect(emptyRow).toHaveClass('cursor-not-allowed');
  expect(emptyRow).not.toHaveClass('cursor-pointer');

  fireEvent.click(emptyRow);
  expect(
    screen.queryByTestId('cost-row-detail-SPEC-777')
  ).not.toBeInTheDocument();
});

test('removes the Output Tokens and Total Tokens columns entirely', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(
    screen.queryByRole('columnheader', {name: /output tokens/i})
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', {name: /total tokens/i})
  ).not.toBeInTheDocument();
});

test('defaults to sorting the ID column descending', () => {
  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('columnheader', {name: 'ID'})).toHaveAttribute(
    'aria-sort',
    'descending'
  );
  expect(dataRowKeys()).toEqual([
    'cost-entry-SPEC-777',
    'cost-entry-SPEC-201',
    'cost-entry-SPEC-150',
  ]);
});

test('clicking a header sorts ascending, clicking it again reverses to descending', () => {
  render(<CostTable entries={populatedEntries} />);

  const titleHeader = screen.getByRole('columnheader', {name: 'Title'});

  fireEvent.click(within(titleHeader).getByRole('button'));
  expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');

  const ascendingOrder = dataRowKeys();

  fireEvent.click(within(titleHeader).getByRole('button'));
  expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
  expect(dataRowKeys()).toEqual(ascendingOrder.toReversed());
});

test('the sort button fills the whole header cell, not just the label text', () => {
  render(<CostTable entries={populatedEntries} />);

  const idHeader = screen.getByRole('columnheader', {name: 'ID'});
  const button = within(idHeader).getByRole('button');

  // Full-size fill (feedback: click anywhere in the header cell, not just
  // the label, toggles sort), not a button that only wraps the text.
  expect(button).toHaveClass('h-full', 'w-full');

  fireEvent.click(button);
  expect(idHeader).toHaveAttribute('aria-sort', 'ascending');
});

test('shows cumulative cost and time for the currently shown table, next to the toggle', () => {
  render(<CostTable entries={populatedEntries} />);

  // Specs: only SPEC-201 has a recorded figure ($3.42); durations sum to
  // 900s + 2100s = 3000s = 50m (SPEC-777 has neither).
  expect(
    within(screen.getByTestId('cost-table-totals')).getByText('$3.42')
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId('cost-table-totals')).getByText('50m')
  ).toBeInTheDocument();

  showPlans();

  // Plans: legacy-onboarding ($2.10, 1500s) + PLAN-090 ($1.10, 600s) =
  // $3.20, 2100s = 35m (archive-notes has neither).
  expect(
    within(screen.getByTestId('cost-table-totals')).getByText('$3.20')
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId('cost-table-totals')).getByText('35m')
  ).toBeInTheDocument();
});

test('the view toggle is URL-driven via ?work=', () => {
  window.history.replaceState(null, '', '/?work=plans');

  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('button', {name: 'Plans (3)'})).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  showPlans();
  expect(window.location.search).toBe('?work=plans');

  fireEvent.click(screen.getByRole('button', {name: /specs \(/i}));
  expect(window.location.search).toBe('');
});

test('an invalid ?work= value falls back to specs', () => {
  window.history.replaceState(null, '', '/?work=bogus');

  render(<CostTable entries={populatedEntries} />);

  expect(screen.getByRole('button', {name: 'Specs (3)'})).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('?entry= deep-links into whichever table holds the entry, expanding and highlighting it', () => {
  window.history.replaceState(null, '', '/?work=specs&entry=PLAN-090');

  render(<CostTable entries={populatedEntries} />);

  // PLAN-090 lives in plans, so ?entry= overrides the ?work=specs request.
  expect(screen.getByRole('button', {name: 'Plans (3)'})).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  const targetRow = screen.getByRole('row', {name: /PLAN-090/});

  expect(targetRow).toHaveClass('ring-accent/40');
  expect(screen.getByTestId('cost-row-detail-PLAN-090')).toBeInTheDocument();
});

test('CostTableSkeleton renders a pixel-matching placeholder hidden from assistive tech', () => {
  render(<CostTableSkeleton />);

  const skeleton = screen.getByTestId('cost-table-skeleton');

  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  expect(within(skeleton).getAllByTestId('skeleton').length).toBeGreaterThan(0);
});

test('CostTableSkeleton header cells are static labels, not focusable buttons', () => {
  render(<CostTableSkeleton />);

  // `aria-hidden` hides descendants from the accessibility tree but not from
  // the tab order (KNOWN-ISSUES): a real `<button>` here would still be
  // reachable by keyboard while announcing nothing. `hidden: true` opts back
  // into querying aria-hidden content, so this actually proves none exist
  // rather than the query silently filtering them out either way.
  const skeleton = screen.getByTestId('cost-table-skeleton');

  expect(
    within(skeleton).queryAllByRole('button', {hidden: true})
  ).toHaveLength(0);
});
