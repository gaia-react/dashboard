import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import SegmentedBar from '~/components/Charts/SegmentedBar';

const formatValue = (value: number): string => `$${value.toFixed(2)}`;

test('renders one segment per non-null, non-zero phase on the fixed accent ordinal ramp', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 6.14, plan: 4.2, spec: 2}}
    />
  );

  const bar = screen.getByRole('img', {name: 'Cost by phase'});
  const segments = within(bar).getAllByTestId(/^segmented-bar-fill-/u);

  expect(segments).toHaveLength(3);
  expect(segments[0]).toHaveClass('bg-accent-2'); // spec
  expect(segments[1]).toHaveClass('bg-accent'); // plan
  expect(segments[2]).toHaveClass('bg-accent-soft'); // execute
  expect(segments[0]).toHaveStyle({flexGrow: '2'});
});

test('the legend lists each phase with its label, percent, and formatted value', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 60, plan: 20, spec: 20}}
    />
  );

  expect(screen.getAllByText('Spec').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Plan').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Execute').length).toBeGreaterThan(0);
  // "20%" and the dollar figure also appear in the sr-only datum twin.
  expect(screen.getAllByText('20%').length).toBeGreaterThan(0);
  expect(screen.getAllByText('60%').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$60.00').length).toBeGreaterThan(0);
});

test('a zero-value phase is omitted entirely, not rendered at 0 width', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 100, plan: 0, spec: null}}
    />
  );

  const bar = screen.getByRole('img', {name: 'Cost by phase'});

  expect(within(bar).getAllByTestId(/^segmented-bar-fill-/u)).toHaveLength(1);
  expect(screen.queryByText('Plan')).not.toBeInTheDocument();
});

test('a null-valued phase is skipped from the bar and named in a footnote, never treated as zero', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: null, plan: 40, spec: 60}}
    />
  );

  const bar = screen.getByRole('img', {name: 'Cost by phase'});

  expect(within(bar).getAllByTestId(/^segmented-bar-fill-/u)).toHaveLength(2);
  expect(screen.queryByText('Execute')).not.toBeInTheDocument();
  expect(
    screen.getByText(/Execute phase recorded no cost/u)
  ).toBeInTheDocument();
});

test('emptyMeasureLabel names the actual measure, not always "cost"', () => {
  render(
    <SegmentedBar
      emptyMeasureLabel="elapsed time"
      formatValue={formatValue}
      label="Elapsed by phase"
      values={{execute: null, plan: 40, spec: 60}}
    />
  );

  expect(
    screen.getByText(/Execute phase recorded no elapsed time/u)
  ).toBeInTheDocument();
  expect(screen.queryByText(/recorded no cost/u)).not.toBeInTheDocument();
});

test('hovering a bar segment dims it and highlights its matching legend row', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 60, plan: 20, spec: 20}}
    />
  );

  const specSegment = screen.getByTestId('segmented-bar-fill-spec');

  fireEvent.mouseEnter(specSegment);
  expect(specSegment).toHaveClass('opacity-80');

  const specRow = screen.getByTestId('segmented-bar-legend-spec');

  expect(specRow).toHaveClass('text-fg');

  fireEvent.mouseLeave(specSegment);
  expect(specSegment).not.toHaveClass('opacity-80');
});

test('hovering a legend row highlights its matching bar segment', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 60, plan: 20, spec: 20}}
    />
  );

  const specRow = screen.getByTestId('segmented-bar-legend-spec');

  fireEvent.mouseEnter(specRow);

  const specSegment = screen.getByTestId('segmented-bar-fill-spec');

  expect(specSegment).toHaveClass('opacity-80');
});

test('carries an sr-only list twin of every rendered datum', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: 60, plan: 20, spec: 20}}
    />
  );

  const summary = screen.getByTestId('segmented-bar-accessible-summary');

  expect(summary).toHaveTextContent('Spec');
  expect(summary).toHaveTextContent('$20.00');
});

test('a single recorded phase renders one segment at 100%, honest rather than degenerate', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: null, plan: null, spec: 12}}
    />
  );

  const bar = screen.getByRole('img', {name: 'Cost by phase'});

  expect(within(bar).getAllByTestId(/^segmented-bar-fill-/u)).toHaveLength(1);
  expect(screen.getByText('100%')).toBeInTheDocument();
});

test('renders a defined empty state when every phase is zero or null', () => {
  render(
    <SegmentedBar
      formatValue={formatValue}
      label="Cost by phase"
      values={{execute: null, plan: 0, spec: null}}
    />
  );

  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('No phase breakdown')).toBeInTheDocument();
});
