import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import SessionsList, {
  SessionsListSkeleton,
} from '~/components/Sections/SessionsList';
import {formatSessionDateTime} from '~/components/Sections/SessionsList/format';
import {activityResponseSchema} from '~/data/schemas/api';
import type {SessionSummary} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (mirrors app/components/Sections/ActivityHeatmap/tests/index.test.tsx).
const loadFixture = (fileName: string): SessionSummary[] =>
  activityResponseSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/sessions-list', fileName),
        'utf8'
      )
    )
  ).sessions;

const sessions = loadFixture('populated.json');
const emptySessions = loadFixture('empty.json');

const RECORDED_SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOWER_BOUND_SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const ESTIMATED_SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const NO_DATA_SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000004';

const getRows = (): HTMLElement[] => screen.getAllByRole('listitem');
const getSessionRow = (sessionId: string): HTMLElement =>
  screen.getByTestId(`session-row-${sessionId}`);

test('renders the section chrome and the attributed/ad hoc counts', () => {
  render(<SessionsList sessions={sessions} />);

  expect(screen.getByText('Sessions')).toBeInTheDocument();
  expect(screen.getByText(/54 sessions/)).toBeInTheDocument();
  expect(screen.getByText(/3 attributed/)).toBeInTheDocument();
  expect(screen.getByText(/51 ad hoc/)).toBeInTheDocument();
});

test('renders an intentional empty state when there are no sessions at all', () => {
  render(<SessionsList sessions={emptySessions} />);

  expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

test('paginates 50 sessions per page, filters applied before paging', () => {
  render(<SessionsList sessions={sessions} />);

  expect(getRows()).toHaveLength(50);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));

  expect(getRows()).toHaveLength(4);
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Next page'})).toBeDisabled();

  fireEvent.click(screen.getByRole('button', {name: 'Previous page'}));

  expect(getRows()).toHaveLength(50);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('the attribution filter narrows the list and resets to page 1', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Filter by attribution'), {
    target: {value: 'attributed'},
  });

  expect(getRows()).toHaveLength(3);
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

test('the ad hoc filter, applied before paging, still spans two pages', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.change(screen.getByLabelText('Filter by attribution'), {
    target: {value: 'ad-hoc'},
  });

  // 51 ad hoc sessions: page 1 of 2 with the full 50-row page (never a
  // client-side count of 51 in one page; filters run before paging, D5).
  expect(getRows()).toHaveLength(50);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
  expect(getRows()).toHaveLength(1);
});

test('the model filter narrows to sessions using that model', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.change(screen.getByLabelText('Filter by model'), {
    target: {value: 'claude-haiku-4-5'},
  });

  const rows = getRows();

  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText(/claude-haiku-4-5/)).toBeInTheDocument();
});

test('attribution and model filters combine (both narrow the same list)', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.change(screen.getByLabelText('Filter by attribution'), {
    target: {value: 'attributed'},
  });
  fireEvent.change(screen.getByLabelText('Filter by model'), {
    target: {value: 'claude-opus-4-1'},
  });

  const rows = getRows();

  expect(rows).toHaveLength(2);
  expect(screen.getByText('Ship the ledger repair')).toBeInTheDocument();
  expect(screen.getByText('Vintage plan archive replay')).toBeInTheDocument();
  // PLAN-002 is attributed but uses claude-haiku-4-5, not claude-opus-4-1.
  expect(
    screen.queryByText('aaaaaaaa-0000-4000-8000-000000000002')
  ).not.toBeInTheDocument();
});

test('shows an intentional empty state when a filter combination matches nothing', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.change(screen.getByLabelText('Filter by attribution'), {
    target: {value: 'attributed'},
  });
  fireEvent.change(screen.getByLabelText('Filter by model'), {
    target: {value: 'claude-haiku-4-5'},
  });

  // PLAN-002 is attributed and uses claude-haiku-4-5.
  expect(getRows()).toHaveLength(1);

  fireEvent.change(screen.getByLabelText('Filter by model'), {
    target: {value: 'claude-sonnet-4-5'},
  });

  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(
    screen.getByText('No sessions match these filters')
  ).toBeInTheDocument();
});

test('the attribution badge links to the matching CostTable row', () => {
  render(<SessionsList sessions={sessions} />);

  const specBadge = screen.getByRole('link', {name: 'SPEC-001'});

  expect(specBadge).toHaveAttribute('href', '#cost-entry-SPEC-001');

  const slugBadge = screen.getByRole('link', {name: 'slug:vintage-plan'});

  expect(slugBadge).toHaveAttribute('href', '#cost-entry-slug-vintage-plan');
});

test("each session row carries the anchor id CostTable's jump-link points at", () => {
  render(<SessionsList sessions={sessions} />);

  expect(getSessionRow(RECORDED_SESSION_ID)).toHaveAttribute(
    'id',
    `session-${RECORDED_SESSION_ID}`
  );
});

test('an ad hoc session shows a non-linked "Ad hoc" badge', () => {
  render(<SessionsList sessions={sessions} />);

  expect(screen.getAllByText('Ad hoc').length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', {name: 'Ad hoc'})).not.toBeInTheDocument();
});

test('title falls back to the session id when the API sends no title', () => {
  render(<SessionsList sessions={sessions} />);

  expect(
    screen.getByText('aaaaaaaa-0000-4000-8000-000000000002')
  ).toBeInTheDocument();
});

test('recorded dollars are visually distinct from estimated dollars, with a lower-bound marker', () => {
  render(<SessionsList sessions={sessions} />);

  const recordedRow = getSessionRow(RECORDED_SESSION_ID);
  const lowerBoundRow = getSessionRow(LOWER_BOUND_SESSION_ID);
  const estimatedRow = getSessionRow(ESTIMATED_SESSION_ID);
  const noDataRow = getSessionRow(NO_DATA_SESSION_ID);

  const recordedValue = within(recordedRow).getByText('$14.35');

  expect(recordedValue).toHaveClass('text-fg');
  expect(within(recordedRow).getByText('recorded')).toBeInTheDocument();

  const estimatedValue = within(estimatedRow).getByText('~$2.10');

  expect(estimatedValue).toHaveClass('text-fg-dim');
  expect(estimatedValue).toHaveClass('italic');
  expect(within(estimatedRow).getByText('estimated')).toBeInTheDocument();

  expect(within(lowerBoundRow).getByText('~$0.75+')).toBeInTheDocument();
  expect(
    within(lowerBoundRow).getByText('estimated, lower bound')
  ).toBeInTheDocument();

  expect(within(noDataRow).getByText('no data')).toBeInTheDocument();

  // Never summed: no total combining recorded and estimated appears anywhere.
  expect(screen.queryByText(/\$17\.20/)).not.toBeInTheDocument();
});

test('renders duration and local date/time using the same formatter the component uses', () => {
  render(<SessionsList sessions={sessions} />);

  const row = getSessionRow(RECORDED_SESSION_ID);

  expect(within(row).getByText('42m 00s')).toBeInTheDocument();
  expect(
    within(row).getByText(formatSessionDateTime('2026-07-07T15:00:00Z'))
  ).toBeInTheDocument();
});

test('the skeleton mirrors the section chrome and is hidden from assistive tech', () => {
  render(<SessionsListSkeleton />);

  const skeleton = screen.getByTestId('sessions-list-skeleton');

  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
});
