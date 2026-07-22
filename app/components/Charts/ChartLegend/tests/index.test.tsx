import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import ChartLegend from '~/components/Charts/ChartLegend';

test('renders one item per series with a token-colored swatch', () => {
  render(
    <ChartLegend
      items={[
        {label: 'claude-opus-4', swatchClassName: 'bg-accent'},
        {label: 'claude-sonnet-4-5', swatchClassName: 'bg-secondary'},
        {label: 'Other', swatchClassName: 'bg-fg-mute'},
      ]}
    />
  );

  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Other')).toBeInTheDocument();
});

test('supports opacity steps for single-hue ramps', () => {
  render(
    <ChartLegend
      items={[
        {label: '0', swatchClassName: 'bg-bg-elev'},
        {label: 'up to 125K', swatchClassName: 'bg-accent', swatchOpacity: 0.3},
      ]}
    />
  );

  expect(screen.getByText('up to 125K')).toBeInTheDocument();
});

test('item text is text-label, never the legacy smaller size', () => {
  render(
    <ChartLegend
      items={[{label: 'claude-opus-4', swatchClassName: 'bg-accent'}]}
    />
  );

  expect(screen.getByText('claude-opus-4')).toHaveClass('text-label');
});
