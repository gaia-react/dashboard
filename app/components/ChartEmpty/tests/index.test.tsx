import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import ChartEmpty from '~/components/ChartEmpty';

test('renders the title and the teaching reason', () => {
  render(
    <ChartEmpty
      reason="This event was reconstructed from the backfill, which records total cost but not which models did the work."
      title="No model breakdown"
    />
  );

  expect(screen.getByText('No model breakdown')).toBeInTheDocument();
  expect(
    screen.getByText(
      'This event was reconstructed from the backfill, which records total cost but not which models did the work.'
    )
  ).toBeInTheDocument();
});

// It sits inside the detail panel, which is already a bordered surface. A
// border here would be a card inside a card, banned outright.
test('draws no box of its own', () => {
  render(<ChartEmpty reason="reason" title="title" />);

  const root = screen.getByTestId('chart-empty');

  expect(root.className).not.toMatch(/border/u);
  expect(root.className).not.toMatch(/rounded/u);
  expect(root.className).not.toMatch(/shadow/u);
});

test('reserves the smallest chart height so the panel does not jump', () => {
  render(<ChartEmpty reason="reason" title="title" />);

  expect(screen.getByTestId('chart-empty')).toHaveClass('min-h-24');
});
