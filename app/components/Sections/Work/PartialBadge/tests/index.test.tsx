import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import PartialBadge from '~/components/Sections/Work/PartialBadge';

test('names the caveat in words, not by color alone', () => {
  render(<PartialBadge />);

  expect(screen.getByText('Partial')).toBeInTheDocument();
});

test('takes the amber tone as a border and soft text, never a fill', () => {
  render(<PartialBadge />);

  const badge = screen.getByText('Partial');

  expect(badge).toHaveClass('border-warn-2');
  expect(badge).toHaveClass('text-warn-soft');
  expect(badge.className).not.toMatch(/bg-warn/u);
});

test('is a square-cornered badge, not a pill', () => {
  render(<PartialBadge />);

  expect(screen.getByText('Partial')).toHaveClass('rounded-sm');
  expect(screen.getByText('Partial')).not.toHaveClass('rounded-full');
});
