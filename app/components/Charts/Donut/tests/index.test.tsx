import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import Donut from '~/components/Charts/Donut';

test('renders one segment per model, colored by the palette, with a legend row each', () => {
  render(
    <Donut
      data={{'claude-haiku-4-5': 1_800_000, 'claude-opus-4-8': 8_200_000}}
      locale="en-US"
    />
  );

  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(2);
  expect(
    screen.getByRole('graphics-symbol', {
      name: 'Claude Opus 4.8: 8.2M, 82%',
    })
  ).toBeInTheDocument();
  expect(screen.getAllByText('Claude Opus 4.8')).not.toHaveLength(0);
  expect(screen.getAllByText('Claude Haiku 4.5')).not.toHaveLength(0);
});

test('center carries the total in mono tabular-nums, with a tokens caption', () => {
  render(
    <Donut
      data={{'claude-haiku-4-5': 1_800_000, 'claude-opus-4-8': 8_200_000}}
      locale="en-US"
    />
  );

  const total = screen.getByText('10M');

  expect(total).toHaveClass('font-mono');
  expect(total).toHaveClass('tabular-nums');
  expect(screen.getByText('tokens')).toBeInTheDocument();
});

test('a single 100% segment still renders a full ring, not a hollow chart, and no legend box', () => {
  render(<Donut data={{'claude-opus-4-8': 100}} locale="en-US" />);

  const arc = screen.getByRole('graphics-symbol');

  expect(arc).toBeInTheDocument();
  // A full-ring path always splits into two half-circle sectors (donut-arc.ts).
  expect(arc.getAttribute('d')?.match(/A/g)).toHaveLength(4);
  // "None for one series" (the kit's legend rule): no legend list is rendered.
  expect(
    screen.queryByRole('list', {name: /legend/iu})
  ).not.toBeInTheDocument();
});

test('past five named models the tail folds into "Other" in the neutral tone', () => {
  render(
    <Donut
      data={{
        alpha: 100,
        beta: 90,
        charlie: 80,
        delta: 70,
        echo: 60,
        foxtrot: 50,
        golf: 40,
      }}
      locale="en-US"
    />
  );

  // Five named plus "other": six segments, never more.
  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(6);
  expect(screen.getByText('Other')).toBeInTheDocument();
});

test('hover and focus on a segment surface a tooltip with model, tokens, and share; leave and blur hide it', () => {
  render(
    <Donut
      data={{'claude-haiku-4-5': 1_800_000, 'claude-opus-4-8': 8_200_000}}
      locale="en-US"
    />
  );

  const opusArc = screen.getByRole('graphics-symbol', {
    name: 'Claude Opus 4.8: 8.2M, 82%',
  });

  fireEvent.mouseEnter(opusArc);
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Claude Opus 4.8');
  expect(tooltip).toHaveTextContent('8.2M');
  expect(tooltip).toHaveTextContent('82%');

  fireEvent.mouseLeave(opusArc);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  expect(opusArc).toHaveAttribute('tabindex', '0');
  fireEvent.focus(opusArc);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Claude Opus 4.8');
  fireEvent.blur(opusArc);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('carries an sr-only list twin of every datum', () => {
  render(
    <Donut
      data={{'claude-haiku-4-5': 1_800_000, 'claude-opus-4-8': 8_200_000}}
      locale="en-US"
    />
  );

  const summary = screen.getByTestId('donut-accessible-summary');

  expect(summary).toHaveTextContent('Claude Opus 4.8');
  expect(summary).toHaveTextContent('8.2M');
  expect(summary).toHaveTextContent('Claude Haiku 4.5');
});

test('renders a defined empty state when the source map is null', () => {
  render(<Donut data={null} />);

  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
  expect(screen.getByText('No model breakdown')).toBeInTheDocument();
});

test('renders a defined empty state when every value is zero', () => {
  render(
    <Donut
      data={{'claude-haiku-4-5': 0, 'claude-opus-4-8': 0}}
      locale="en-US"
    />
  );

  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
  expect(screen.getByText('No model breakdown')).toBeInTheDocument();
});
