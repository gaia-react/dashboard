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
