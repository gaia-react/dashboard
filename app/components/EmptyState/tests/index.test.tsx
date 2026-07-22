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

// DESIGN-SPEC 9.4: a dashed rule reads as a drop target or an unfinished
// region, and this surface is neither.
test('draws a solid hairline, never a dashed one', () => {
  render(<EmptyState title="No cost data yet" />);

  const root = screen.getByTestId('empty-state');

  expect(root).toHaveClass('border-border-soft');
  expect(root).not.toHaveClass('border-dashed');
});

test('renders no icon unless one is passed, so no existing caller changes', () => {
  render(<EmptyState title="No cost data yet" />);

  expect(screen.queryByTestId('icon-unknown')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('renders the icon above the title when one is passed', () => {
  render(<EmptyState icon="unknown" title="No GAIA events yet" />);

  const icon = screen.getByTestId('icon-unknown');

  expect(icon).toBeInTheDocument();
  expect(icon).toHaveClass('text-fg-mute');
  expect(icon).toHaveAttribute('aria-hidden', 'true');
});
