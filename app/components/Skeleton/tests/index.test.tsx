import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import Skeleton, {shimmer} from '~/components/Skeleton';

test('renders a shimmer block hidden from assistive tech', () => {
  render(<Skeleton className="h-40" />);

  const skeleton = screen.getByTestId('skeleton');
  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  expect(skeleton).toHaveClass('h-40');
  expect(skeleton).toHaveClass('motion-safe:animate-shimmer');
});

test('shimmer classes keep text transparent and motion behind motion-safe', () => {
  expect(shimmer).toContain('text-transparent');
  expect(shimmer).toContain('motion-safe:animate-shimmer');
});
