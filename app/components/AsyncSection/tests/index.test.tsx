import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import AsyncSection from '~/components/AsyncSection';
import Skeleton from '~/components/Skeleton';

const renderRows = (data: {rows: number}) => <p>{data.rows} rows</p>;

test('loading: marks the region busy, shows the skeleton, announces loading', () => {
  render(
    <AsyncSection
      label="Sessions"
      skeleton={<Skeleton className="h-20" />}
      state={{status: 'loading'}}
    >
      {renderRows}
    </AsyncSection>
  );

  const region = screen.getByRole('region', {name: 'Sessions'});
  expect(region).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Loading Sessions');
});

test('success: renders the content and clears the busy state', () => {
  render(
    <AsyncSection
      label="Sessions"
      skeleton={<Skeleton className="h-20" />}
      state={{data: {rows: 3}, status: 'success'}}
    >
      {renderRows}
    </AsyncSection>
  );

  expect(screen.getByText('3 rows')).toBeInTheDocument();
  expect(screen.getByRole('region', {name: 'Sessions'})).toHaveAttribute(
    'aria-busy',
    'false'
  );
  expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
});

test('error: renders the error primitive wired to onRetry', () => {
  const onRetry = vi.fn();
  render(
    <AsyncSection
      label="Sessions"
      onRetry={onRetry}
      skeleton={<Skeleton className="h-20" />}
      state={{message: 'Session scan failed', status: 'error'}}
    >
      {renderRows}
    </AsyncSection>
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Session scan failed');
  fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("error: forwards isRetrying to ErrorState so C-31's X and L states are reachable", () => {
  render(
    <AsyncSection
      isRetrying={true}
      label="Sessions"
      onRetry={vi.fn()}
      skeleton={<Skeleton className="h-20" />}
      state={{message: 'Session scan failed', status: 'error'}}
    >
      {renderRows}
    </AsyncSection>
  );

  const button = screen.getByRole('button', {name: 'Retrying'});

  expect(button).toBeDisabled();
});

test('keeps the same section element when content replaces the skeleton', () => {
  const {rerender} = render(
    <AsyncSection
      label="Sessions"
      skeleton={<Skeleton className="h-20" />}
      state={{status: 'loading'}}
    >
      {renderRows}
    </AsyncSection>
  );
  const regionWhileLoading = screen.getByRole('region', {name: 'Sessions'});

  rerender(
    <AsyncSection
      label="Sessions"
      skeleton={<Skeleton className="h-20" />}
      state={{data: {rows: 3}, status: 'success'}}
    >
      {renderRows}
    </AsyncSection>
  );

  expect(screen.getByRole('region', {name: 'Sessions'})).toBe(
    regionWhileLoading
  );
});
