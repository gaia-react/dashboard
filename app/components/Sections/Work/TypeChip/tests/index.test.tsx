import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {EVENT_TONES} from '~/components/Sections/Work/event-meta';
import type {GaiaEventType} from '~/components/Sections/Work/events';
import TypeChip from '~/components/Sections/Work/TypeChip';

const ALL_TYPES: GaiaEventType[] = [
  'audit',
  'debt',
  'fitness',
  'forensics',
  'harden',
  'plan',
  'review',
  'spec',
  'unknown',
  'wiki',
];

test('renders the type label beside its icon', () => {
  render(<TypeChip type="spec" />);

  expect(screen.getByText('Spec')).toBeInTheDocument();
  expect(screen.getByTestId('icon-spec')).toBeInTheDocument();
});

test('every type renders both an icon and a word, so tone is never alone', () => {
  for (const type of ALL_TYPES) {
    const {unmount} = render(<TypeChip type={type} />);

    expect(screen.getByTestId(`icon-${type}`)).toBeInTheDocument();
    expect(screen.getByText(/\S/u)).toBeInTheDocument();
    unmount();
  }
});

test('carries the hairline border that keeps it visible on a selected card', () => {
  render(<TypeChip type="debt" />);

  const chip = screen.getByTestId('type-chip');

  expect(chip).toHaveClass('border-border-soft');
  expect(chip).toHaveClass('bg-bg-elev-2');
  expect(chip).not.toHaveClass('rounded-full');
});

test('applies the tone classes as literal utilities', () => {
  render(<TypeChip type="harden" />);

  expect(screen.getByText('Harden')).toHaveClass('text-info-soft');
  expect(screen.getByTestId('icon-harden')).toHaveClass('text-info');
});

test('review uses fg-dim chip text, not the fg-mute that fails AA', () => {
  render(<TypeChip type="review" />);

  expect(screen.getByText('Review')).toHaveClass('text-fg-dim');
  expect(screen.getByTestId('icon-review')).toHaveClass('text-fg-mute');
});

test('an explicit tone overrides the default lookup', () => {
  render(<TypeChip tone={EVENT_TONES.debt} type="spec" />);

  expect(screen.getByText('Spec')).toHaveClass('text-warn-soft');
});

test('is never a control', () => {
  render(<TypeChip type="wiki" />);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
