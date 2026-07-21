import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import Sparkline from '~/components/Charts/Sparkline';

test('renders a single accent stroke path shaped by the values', () => {
  render(<Sparkline values={[1, 4, 2, 8, 5]} />);

  const path = screen.getByTestId('sparkline-path');

  expect(path).toHaveClass('stroke-accent');
  expect(path).toHaveAttribute('stroke-width', '2');
  expect(path).toHaveAttribute('stroke-linecap', 'round');
  expect(path).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  expect(path).toHaveAttribute('fill', 'none');
});

test('the accessible name summarizes point count, low, high, and latest', () => {
  render(<Sparkline values={[1, 4, 2, 8, 5]} />);

  expect(
    screen.getByRole('img', {
      name: '5 points, low 1, high 8, latest 5',
    })
  ).toBeInTheDocument();
});

test('a caller-supplied label overrides the default summary', () => {
  render(<Sparkline label="Cost trend, last 12 weeks" values={[1, 2]} />);

  expect(
    screen.getByRole('img', {name: 'Cost trend, last 12 weeks'})
  ).toBeInTheDocument();
});

test('renders nothing and reserves no space for a single point', () => {
  const {container} = render(<Sparkline values={[5]} />);

  expect(container).toBeEmptyDOMElement();
});

test('renders nothing for an empty series', () => {
  const {container} = render(<Sparkline values={[]} />);

  expect(container).toBeEmptyDOMElement();
});

test('an all-equal series still renders (a flat line), never crashing on a zero-range scale', () => {
  render(<Sparkline values={[3, 3, 3]} />);

  expect(screen.getByRole('img')).toBeInTheDocument();
});
