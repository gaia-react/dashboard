import {fireEvent, render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ActivityHeatmap, {
  ActivityHeatmapSkeleton,
} from '~/components/Sections/ActivityHeatmap';
import {activityResponseSchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (mirrors app/components/Charts/CalendarHeatmap/tests/index.test.tsx).
const readFixture = (name: string) =>
  activityResponseSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/activity-heatmap', name),
        'utf8'
      )
    )
  );

const populated = readFixture('populated.json');
const empty = readFixture('empty.json');
const allZeroOutput = readFixture('all-zero-output.json');

test('renders the section chrome and one cell per fixture day', () => {
  render(<ActivityHeatmap heatmap={populated.heatmap} locale="en-US" />);

  expect(
    screen.getByRole('heading', {name: 'Daily total tokens'})
  ).toBeInTheDocument();
  expect(screen.getByText('Activity')).toBeInTheDocument();
  expect(screen.getAllByRole('graphics-symbol')).toHaveLength(
    populated.heatmap.length
  );
});

test('the hover tooltip shows total tokens and the session count, not just output', () => {
  render(<ActivityHeatmap heatmap={populated.heatmap} locale="en-US" />);

  const peakDay = populated.heatmap.find((day) => day.date === '2026-07-03');

  expect(peakDay?.date).toBe('2026-07-03');
  const peakSessionCount = peakDay?.sessionCount ?? -1;

  // Phase 8 v2: the cell value is total tokens (77,600 -> "78K" in this
  // fixture), not output tokens alone (21,000 -> "21K"), proving the primary
  // metric actually moved, not just the label.
  const peakCell = screen.getByRole('graphics-symbol', {
    name: 'Jul 3, 2026: 78K total tokens',
  });

  fireEvent.mouseEnter(peakCell);
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Jul 3, 2026');
  expect(tooltip).toHaveTextContent('Total tokens');
  expect(tooltip).toHaveTextContent('Sessions');
  expect(tooltip).toHaveTextContent(String(peakSessionCount));
});

test('a screen-reader-only summary matches the hover tooltip: total tokens and the session count per day', () => {
  render(<ActivityHeatmap heatmap={populated.heatmap} locale="en-US" />);

  const peakDay = populated.heatmap.find((day) => day.date === '2026-07-03');

  expect(peakDay).toBeDefined();

  expect(screen.getByTestId('activity-heatmap-accessible-summary')).toHaveClass(
    'sr-only'
  );

  const summary = screen.getByText(/Jul 3, 2026:/);

  expect(summary).toHaveTextContent('78K total tokens');
  expect(summary).toHaveTextContent(
    `${peakDay?.sessionCount} ${peakDay?.sessionCount === 1 ? 'session' : 'sessions'}`
  );
});

test('labels months and shows the single-hue accent-ramp legend thresholds', () => {
  render(<ActivityHeatmap heatmap={populated.heatmap} locale="en-US" />);

  expect(screen.getByText('Jun')).toBeInTheDocument();
  expect(screen.getByText('Jul')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getAllByText(/^up to /).length).toBeGreaterThan(0);
  expect(screen.getByText(/^over /)).toBeInTheDocument();
});

test('a fully empty heatmap renders an intentional empty state, not a blank chart', () => {
  render(<ActivityHeatmap heatmap={empty.heatmap} locale="en-US" />);

  expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
  // The kit's own legend (with its all-zero duplicate-label bug) never mounts.
  expect(screen.queryByText(/^over /)).not.toBeInTheDocument();
});

test('all-zero total-token days render the same intentional empty state, sidestepping the kit legend bug', () => {
  render(<ActivityHeatmap heatmap={allZeroOutput.heatmap} locale="en-US" />);

  expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
  expect(screen.queryByText(/^over /)).not.toBeInTheDocument();
});

test('the skeleton mirrors the section chrome and is hidden from assistive tech', () => {
  render(<ActivityHeatmapSkeleton />);

  expect(screen.getByText('Activity')).toBeInTheDocument();
  expect(screen.getByText('Daily total tokens')).toBeInTheDocument();
  expect(screen.getByTestId('activity-heatmap-skeleton')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
});
