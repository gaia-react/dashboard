import {fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import SessionsList, {
  SessionsListSkeleton,
} from '~/components/Sections/SessionsList';
import {formatSessionDateTime} from '~/components/Sections/SessionsList/format';
import {activityResponseSchema} from '~/data/schemas/api';
import type {SessionSummary} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
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

const setType = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Type'), {target: {value}});
};

const setModel = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Model'), {target: {value}});
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

test('renders the section chrome and the GAIA/ad hoc counts', () => {
  render(<SessionsList sessions={sessions} />);

  expect(screen.getByText('Sessions')).toBeInTheDocument();
  expect(screen.getByText(/54 sessions/)).toBeInTheDocument();
  expect(screen.getByText(/3 GAIA/)).toBeInTheDocument();
  expect(screen.getByText(/51 ad hoc/)).toBeInTheDocument();
});

test('renders an intentional empty state when there are no sessions at all', () => {
  render(<SessionsList sessions={emptySessions} />);

  expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

test('paginates 50 sessions per page, tracking the page in the URL', () => {
  render(<SessionsList sessions={sessions} />);

  expect(getRows()).toHaveLength(50);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));

  expect(window.location.search).toBe('?page=2');
  expect(getRows()).toHaveLength(4);
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Next page'})).toBeDisabled();

  fireEvent.click(screen.getByRole('button', {name: 'Previous page'}));

  // Page 1 drops the param entirely.
  expect(window.location.search).toBe('');
  expect(getRows()).toHaveLength(50);
});

test('the type filter narrows the list, writes the URL, and resets to page 1', () => {
  render(<SessionsList sessions={sessions} />);

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

  setType('gaia');

  expect(window.location.search).toBe('?type=gaia');
  expect(getRows()).toHaveLength(3);
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

test('the ad hoc filter, applied before paging, still spans two pages', () => {
  render(<SessionsList sessions={sessions} />);

  setType('ad-hoc');

  expect(getRows()).toHaveLength(50);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
  expect(getRows()).toHaveLength(1);
});

test('the model filter narrows to sessions using that model, shown humanized', () => {
  render(<SessionsList sessions={sessions} />);

  setModel('claude-haiku-4-5');

  const rows = getRows();

  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText(/Claude Haiku 4\.5/)).toBeInTheDocument();
  expect(window.location.search).toBe('?model=claude-haiku-4-5');
});

test('type and model filters combine (both narrow the same list)', () => {
  render(<SessionsList sessions={sessions} />);

  setType('gaia');
  setModel('claude-opus-4-1');

  const rows = getRows();

  expect(rows).toHaveLength(2);
  expect(screen.getByText('Ship the ledger repair')).toBeInTheDocument();
  expect(screen.getByText('Vintage plan archive replay')).toBeInTheDocument();
});

test('shows an intentional empty state when a filter combination matches nothing', () => {
  render(<SessionsList sessions={sessions} />);

  setType('gaia');
  setModel('claude-sonnet-4-5');

  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(
    screen.getByText('No sessions match these filters')
  ).toBeInTheDocument();
});

test('reads the filters from the URL on first render', () => {
  window.history.replaceState(null, '', '/?type=gaia&model=claude-opus-4-1');

  render(<SessionsList sessions={sessions} />);

  expect(screen.getByLabelText('Type')).toHaveValue('gaia');
  expect(screen.getByLabelText('Model')).toHaveValue('claude-opus-4-1');
  expect(getRows()).toHaveLength(2);
});

test('an ?id= jump pages to and highlights the target row', () => {
  const targetId = sessions[52]?.sessionId ?? '';
  window.history.replaceState(null, '', `/?id=${targetId}`);

  render(<SessionsList sessions={sessions} />);

  // The target lives on page 2; the list pages there so the row is present.
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

  const targetRow = getSessionRow(targetId);

  expect(targetRow).toBeInTheDocument();
  expect(targetRow).toHaveClass('ring-1');
});

test('the attribution badge links to the matching entry on the Work tab, with no work= param', () => {
  render(<SessionsList sessions={sessions} />);

  expect(screen.getByRole('link', {name: 'SPEC-001'})).toHaveAttribute(
    'href',
    '?tab=work&entry=SPEC-001'
  );
  expect(screen.getByRole('link', {name: 'slug:vintage-plan'})).toHaveAttribute(
    'href',
    '?tab=work&entry=slug%3Avintage-plan'
  );
});

test('clicking the attribution badge calls onViewEntry with just the entry key', () => {
  const onViewEntry = vi.fn();
  render(<SessionsList onViewEntry={onViewEntry} sessions={sessions} />);

  fireEvent.click(screen.getByRole('link', {name: 'SPEC-001'}));

  expect(onViewEntry).toHaveBeenCalledWith('SPEC-001');
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

test('recorded dollars are visually distinct from estimated, with a lower-bound marker', () => {
  render(<SessionsList sessions={sessions} />);

  const recordedRow = getSessionRow(RECORDED_SESSION_ID);
  const lowerBoundRow = getSessionRow(LOWER_BOUND_SESSION_ID);
  const estimatedRow = getSessionRow(ESTIMATED_SESSION_ID);
  const noDataRow = getSessionRow(NO_DATA_SESSION_ID);

  expect(within(recordedRow).getByText('$14.35')).toHaveClass('text-fg');
  expect(within(recordedRow).getByText('recorded')).toBeInTheDocument();

  const estimatedValue = within(estimatedRow).getByText('~$2.10');

  expect(estimatedValue).toHaveClass('text-fg-dim');
  expect(estimatedValue).toHaveClass('italic');

  expect(within(lowerBoundRow).getByText('~$0.75+')).toBeInTheDocument();
  expect(
    within(lowerBoundRow).getByText('estimated, lower bound')
  ).toBeInTheDocument();

  // Unpriceable session renders the neutral dash, not "no data" prose.
  expect(within(noDataRow).getByText('-')).toBeInTheDocument();
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

  expect(screen.getByTestId('sessions-list-skeleton')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
});

test('captions, controls, and figures move onto the five-token type scale (DESIGN-SPEC 1.5)', () => {
  render(<SessionsList sessions={sessions} />);

  expect(screen.getByText(/54 sessions/)).toHaveClass('text-body');
  expect(screen.getByText('Page 1 of 2')).toHaveClass('text-body');

  expect(screen.getByLabelText('Type')).toHaveClass('text-label');
  expect(screen.getByRole('button', {name: 'Next page'})).toHaveClass(
    'text-label'
  );
  expect(screen.getByRole('link', {name: 'SPEC-001'})).toHaveClass(
    'text-label'
  );

  const recordedRow = getSessionRow(RECORDED_SESSION_ID);

  expect(within(recordedRow).getByText('Ship the ledger repair')).toHaveClass(
    'text-body'
  );
  expect(within(recordedRow).getByText('$14.35')).toHaveClass('text-body');
  expect(within(recordedRow).getByText('recorded')).toHaveClass('text-label');

  const estimatedRow = getSessionRow(ESTIMATED_SESSION_ID);

  expect(within(estimatedRow).getByText('~$2.10')).toHaveClass('text-body');

  const noDataRow = getSessionRow(NO_DATA_SESSION_ID);

  expect(within(noDataRow).getByText('-')).toHaveClass('text-label');
});
