import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import ErrorState from '~/components/ErrorState';

test('announces the failure message as an alert', () => {
  render(<ErrorState message="Session scan failed" />);

  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Something went wrong');
  expect(alert).toHaveTextContent('Session scan failed');
});

test('renders a custom title', () => {
  render(<ErrorState message="boom" title="Activity unavailable" />);

  expect(screen.getByRole('alert')).toHaveTextContent('Activity unavailable');
});

test('retries through the retry button', () => {
  const onRetry = vi.fn();
  render(<ErrorState message="boom" onRetry={onRetry} />);

  fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('omits the retry button without a handler', () => {
  render(<ErrorState message="boom" />);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

// The tiny tracked uppercase eyebrow is banned outright (DESIGN-SPEC 9.1),
// and an error heading is where a legible one matters most.
test('the title carries no uppercase eyebrow treatment', () => {
  render(<ErrorState message="boom" />);

  const heading = screen.getByText('Something went wrong');

  expect(heading).toHaveClass('text-title');
  expect(heading).toHaveClass('text-warn-soft');
  expect(heading.className).not.toMatch(/uppercase/u);
  expect(heading.className).not.toMatch(/tracking-\[/u);
  expect(heading.className).not.toMatch(/font-mono/u);
});

test('the message renders at body size, not the old text-sm', () => {
  render(<ErrorState message="Session scan failed" />);

  expect(screen.getByText('Session scan failed')).toHaveClass('text-body');
});

test('the retry button takes the shared focus ring and a safe transition', () => {
  render(<ErrorState message="boom" onRetry={() => undefined} />);

  const button = screen.getByRole('button', {name: 'Retry'});

  expect(button).toHaveClass('focus-visible:outline-accent');
  expect(button).toHaveClass('focus-visible:outline-offset-2');
  expect(button).toHaveClass('motion-reduce:transition-none');
  expect(button).toHaveClass('border-border');
});
