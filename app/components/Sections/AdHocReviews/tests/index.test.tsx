import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import AdHocReviews from '~/components/Sections/AdHocReviews';
import type {AdHocReview} from '~/data/schemas/api';

const review = (overrides: Partial<AdHocReview> = {}): AdHocReview => ({
  at: '2026-07-05T14:00:00.000Z',
  durationSeconds: 120,
  recordedDollars: 0.75,
  reviewId: 'agent-adhoc0001',
  sessionId: 'ssssssss-1111-2222-3333-444444444444',
  totalTokens: 17,
  ...overrides,
});

test('renders nothing when there are no ad-hoc reviews', () => {
  const {container} = render(<AdHocReviews reviews={[]} />);

  expect(container).toBeEmptyDOMElement();
});

test('lists each ad-hoc review with its recorded cost and totals them', () => {
  render(
    <AdHocReviews
      reviews={[
        review({recordedDollars: 0.75, reviewId: 'agent-a'}),
        review({
          recordedDollars: 1.25,
          reviewId: 'agent-b',
          sessionId: 'tttttttt-1111-2222-3333-444444444444',
        }),
      ]}
    />
  );

  const section = screen.getByRole('region', {name: 'Ad hoc reviews'});

  expect(within(section).getByText('agent-a')).toBeInTheDocument();
  expect(within(section).getByText('agent-b')).toBeInTheDocument();
  expect(within(section).getByText('$0.75')).toBeInTheDocument();
  expect(within(section).getByText('$1.25')).toBeInTheDocument();
  // The header total sums the recorded figures ($2.00).
  expect(within(section).getByText('$2.00')).toBeInTheDocument();
  // Copy makes clear this is counted apart from spec & plan recorded spend.
  expect(
    within(section).getByText(/not tied to a spec or plan/i)
  ).toBeInTheDocument();
});

test('falls back to a label and dash figures when fields are absent', () => {
  render(
    <AdHocReviews
      reviews={[
        review({durationSeconds: null, recordedDollars: null, reviewId: null}),
      ]}
    />
  );

  const section = screen.getByRole('region', {name: 'Ad hoc reviews'});

  expect(within(section).getByText('Code review')).toBeInTheDocument();
  // A missing figure is a dash, never a misleading $0.
  expect(within(section).getAllByText('-').length).toBeGreaterThan(0);
});

test('jump-links a review to its session via the callback', () => {
  const onViewSession = vi.fn();

  render(<AdHocReviews onViewSession={onViewSession} reviews={[review()]} />);

  fireEvent.click(screen.getByRole('link', {name: /view in sessions/i}));

  expect(onViewSession).toHaveBeenCalledWith(
    'ssssssss-1111-2222-3333-444444444444'
  );
});
