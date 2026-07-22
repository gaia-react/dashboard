import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import StatusText from '~/components/Sections/Work/StatusText';
import {NO_DATA_LABEL} from '~/data/format/units';

test('formats a ledger status through the shared label formatter', () => {
  render(<StatusText status="merged" />);

  expect(screen.getByText('Merged')).toBeInTheDocument();
});

test('renders an unrecognized status verbatim rather than hiding it', () => {
  render(<StatusText status="allocated" />);

  expect(screen.getByText('Allocated')).toBeInTheDocument();
});

test('renders the shared dash for a null status, never "Unknown" or zero', () => {
  render(<StatusText status={null} />);

  expect(screen.getByText(NO_DATA_LABEL)).toBeInTheDocument();
});

test('status is never colored, including abandoned', () => {
  for (const status of ['abandoned', 'archived', 'merged', 'ready', 'draft']) {
    const {unmount} = render(<StatusText status={status} />);
    const element = screen.getByText(/\S/u);

    expect(element).toHaveClass('text-fg-dim');
    expect(element.className).not.toMatch(
      /text-(warn|accent|secondary|moss|info)/u
    );
    unmount();
  }
});

test('a null status uses the same fg-dim as a real one, not fg-mute', () => {
  render(<StatusText status={null} />);

  const element = screen.getByText(NO_DATA_LABEL);

  expect(element).toHaveClass('text-fg-dim');
  expect(element).not.toHaveClass('text-fg-mute');
});
