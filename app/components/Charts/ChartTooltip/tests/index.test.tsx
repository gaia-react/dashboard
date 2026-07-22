import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import ChartTooltip from '~/components/Charts/ChartTooltip';

test('renders a title and value-led rows with series color keys', () => {
  render(
    <ChartTooltip
      rows={[
        {label: 'claude-opus-4', swatchClassName: 'bg-accent', value: '8.2M'},
        {
          label: 'claude-haiku-4',
          swatchClassName: 'bg-secondary',
          value: '900K',
        },
      ]}
      title="Week of Jun 7"
      x={40}
      y={20}
    />
  );

  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Week of Jun 7');
  expect(screen.getByText('8.2M')).toBeInTheDocument();
  expect(screen.getByText('claude-haiku-4')).toBeInTheDocument();
});

test('positions itself at the anchor point and stays out of pointer reach', () => {
  render(<ChartTooltip rows={[{label: 'value', value: '1'}]} x={40} y={20} />);

  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveClass('pointer-events-none');
  expect(tooltip).toHaveStyle({left: '40px', top: '20px'});
});

test('anchors above the point by default', () => {
  render(<ChartTooltip rows={[{label: 'value', value: '1'}]} x={40} y={20} />);

  expect(screen.getByRole('tooltip')).toHaveStyle({
    transform: 'translate(-50%, calc(-100% - 0.5rem))',
  });
});

test('placement "below" flips the transform, so a tooltip near the top of a scrolling pane is not clipped', () => {
  render(
    <ChartTooltip
      placement="below"
      rows={[{label: 'value', value: '1'}]}
      x={40}
      y={20}
    />
  );

  expect(screen.getByRole('tooltip')).toHaveStyle({
    transform: 'translate(-50%, 0.5rem)',
  });
});

test('carries no shadow and renders its text at text-label', () => {
  render(<ChartTooltip rows={[{label: 'value', value: '1'}]} x={0} y={0} />);

  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveClass('text-label');
  expect(tooltip).not.toHaveClass('text-xs');
  expect(tooltip).not.toHaveClass('shadow-lg');
});
