import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import EmptyState from '~/components/EmptyState';

test('renders the title', () => {
  render(<EmptyState title="No cost data yet" />);

  expect(screen.getByText('No cost data yet')).toBeInTheDocument();
});

test('renders the explanatory description', () => {
  render(
    <EmptyState
      description="Cost tracking begins with the first spec or plan run."
      title="No cost data yet"
    />
  );

  expect(
    screen.getByText('Cost tracking begins with the first spec or plan run.')
  ).toBeInTheDocument();
});
