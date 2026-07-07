import {render, screen} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import SectionSlot from '~/components/App/SectionSlot';

test('loading: the skeleton mirrors the placeholder text and typography', () => {
  render(
    <SectionSlot
      description="Every session, attributed or ad hoc."
      onRetry={vi.fn()}
      state={{status: 'loading'}}
      title="Sessions"
    />
  );

  const skeletonTitle = screen.getByText('Sessions');
  expect(skeletonTitle).toHaveClass(
    'font-display',
    'text-lg',
    'font-light',
    'text-transparent'
  );
  expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
    'aria-busy',
    'true'
  );
});

test('success: reveals the placeholder with identical typography', () => {
  render(
    <SectionSlot
      description="Every session, attributed or ad hoc."
      onRetry={vi.fn()}
      state={{data: {}, status: 'success'}}
      title="Sessions"
    />
  );

  const title = screen.getByText('Sessions');
  expect(title).toHaveClass('font-display', 'text-lg', 'font-light');
  expect(title).not.toHaveClass('text-transparent');
  expect(
    screen.getByText('Every session, attributed or ad hoc.')
  ).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
    'aria-busy',
    'false'
  );
});
