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
