import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {HeatmapDay} from '~/components/Charts/CalendarHeatmap';
import CalendarHeatmap from '~/components/Charts/CalendarHeatmap';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead.
const fixturePath = path.join(
  process.cwd(),
  'test/fixtures/charts/heatmap-days.json'
);
const heatmapDays = JSON.parse(
  readFileSync(fixturePath, 'utf8')
) as HeatmapDay[];

const renderHeatmap = (): void => {
  render(
    <CalendarHeatmap
      data={heatmapDays}
      locale="en-US"
      valueLabel="output tokens"
    />
  );
};

test('renders one cell per local day across the fixture range', () => {
  renderHeatmap();

  // 2026-06-01 through 2026-07-07 is 37 days.
  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(37);
});

test('positions cells on a Sunday-first week/day grid', () => {
  renderHeatmap();

  // Jun 1 is a Monday: first week column, second row.
  const firstCell = screen.getByRole('graphics-symbol', {
    name: 'Jun 1, 2026: 120K output tokens',
  });

  expect(firstCell).toHaveAttribute('x', '32');
  expect(firstCell).toHaveAttribute('y', '34');
});

test('encodes magnitude as a transparent-to-accent single-hue ramp', () => {
  renderHeatmap();

  const maxCell = screen.getByRole('graphics-symbol', {
    name: 'Jul 3, 2026: 500K output tokens',
  });
  const lowCell = screen.getByRole('graphics-symbol', {
    name: 'Jun 2, 2026: 40K output tokens',
  });
  const zeroCell = screen.getByRole('graphics-symbol', {
    name: 'Jun 4, 2026: 0 output tokens',
  });
  const gapCell = screen.getByRole('graphics-symbol', {
    name: 'Jun 3, 2026: 0 output tokens',
  });

  expect(maxCell).toHaveClass('fill-accent');
  expect(maxCell).toHaveAttribute('fill-opacity', '1');
  expect(lowCell).toHaveAttribute('fill-opacity', '0.3');
  expect(zeroCell).toHaveClass('fill-bg-elev');
  expect(gapCell).toHaveClass('fill-bg-elev');
});

test('labels months, weekdays, and the bucket-threshold legend', () => {
  renderHeatmap();

  expect(screen.getByText('Jun')).toBeInTheDocument();
  expect(screen.getByText('Jul')).toBeInTheDocument();
  expect(screen.getByText('Mon')).toBeInTheDocument();
  expect(screen.getByText('up to 125K')).toBeInTheDocument();
  expect(screen.getByText('over 375K')).toBeInTheDocument();
});

test('shows a tooltip on hover and honors reduced motion', () => {
  renderHeatmap();

  const maxCell = screen.getByRole('graphics-symbol', {
    name: 'Jul 3, 2026: 500K output tokens',
  });

  expect(maxCell).toHaveClass('motion-reduce:transition-none');

  fireEvent.mouseEnter(maxCell);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Jul 3, 2026');
  expect(screen.getByRole('tooltip')).toHaveTextContent('500K');

  fireEvent.mouseLeave(maxCell);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('shows a tooltip on keyboard focus and hides it on blur, mirroring hover', () => {
  renderHeatmap();

  const maxCell = screen.getByRole('graphics-symbol', {
    name: 'Jul 3, 2026: 500K output tokens',
  });

  expect(maxCell).toHaveAttribute('tabindex', '0');

  fireEvent.focus(maxCell);
  expect(screen.getByRole('tooltip')).toHaveTextContent('500K');

  fireEvent.blur(maxCell);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('a caller-provided tooltip overrides the default single-metric readout', () => {
  render(
    <CalendarHeatmap
      data={[
        {
          day: '2026-07-03',
          tooltip: {
            rows: [
              {label: 'output tokens', value: '500K'},
              {label: 'sessions', value: '7'},
            ],
            title: 'Jul 3, 2026',
          },
          value: 500_000,
        },
      ]}
      locale="en-US"
      valueLabel="output tokens"
    />
  );

  fireEvent.mouseEnter(screen.getByRole('graphics-symbol'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('sessions');
});
