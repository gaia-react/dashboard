import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ModelMix, {ModelMixSkeleton} from '~/components/Sections/ModelMix';
import type {ActivityResponse} from '~/data/schemas/api';
import {activityResponseSchema} from '~/data/schemas/api';

// Vitest runs from the repo root; happy-dom rewrites import.meta.url to an
// http URL, so dom-environment tests resolve fixtures from cwd instead
// (mirrors app/components/Sections/ActivityHeatmap/tests/index.test.tsx).
const readFixture = (name: string): ActivityResponse =>
  activityResponseSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'test/fixtures/model-mix', name),
        'utf8'
      )
    )
  );

const populated = readFixture('populated.json');
const empty = readFixture('empty.json');
const otherCollision = readFixture('other-collision.json');
const allSynthetic = readFixture('all-synthetic.json');

test('renders the section chrome, totals bars, and weekly stacks from fixture data', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={populated.modelTotals}
      modelWeekly={populated.modelWeekly}
    />
  );

  expect(screen.getByText('Model mix')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {name: 'Which models do the work'})
  ).toBeInTheDocument();

  // Totals bars: one row per real model, <synthetic> excluded.
  expect(
    screen.getByRole('graphics-symbol', {name: 'Claude Opus 4.8: 50K'})
  ).toBeInTheDocument();
  expect(
    screen.getByTestId('horizontal-bar-Claude Haiku 4.5')
  ).toBeInTheDocument();
  expect(screen.queryByText('<synthetic>')).not.toBeInTheDocument();

  // Weekly stacks: one week band per fixture entry.
  expect(
    screen.getByRole('graphics-symbol', {name: /Week of Jun 22/})
  ).toBeInTheDocument();
  expect(
    screen.getByRole('graphics-symbol', {name: /Week of Jun 29/})
  ).toBeInTheDocument();
});

test('hovering a model total bar shows the full bucket split, not just output', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={populated.modelTotals}
      modelWeekly={populated.modelWeekly}
    />
  );

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: 'Claude Opus 4.8: 50K'})
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('Claude Opus 4.8');
  expect(tooltip).toHaveTextContent('cache read');
  expect(tooltip).toHaveTextContent('cache write');
  expect(tooltip).toHaveTextContent('fresh input');
});

test('subagent-traffic models (e.g. a lighter model used for subagent work) are included, not filtered out', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={populated.modelTotals}
      modelWeekly={populated.modelWeekly}
    />
  );

  expect(
    screen.getByRole('graphics-symbol', {name: 'Claude Haiku 4.5: 6K'})
  ).toBeInTheDocument();
});

test('a fully empty fixture renders an intentional empty state, not blank charts', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={empty.modelTotals}
      modelWeekly={empty.modelWeekly}
    />
  );

  expect(screen.getByText('No model activity yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('a dataset where every model is <synthetic> in every week renders the empty state, not a hollow chart', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={allSynthetic.modelTotals}
      modelWeekly={allSynthetic.modelWeekly}
    />
  );

  expect(screen.getByText('No model activity yet')).toBeInTheDocument();
  expect(screen.queryByRole('graphics-symbol')).not.toBeInTheDocument();
});

test('more than six models fold the tail into an "Other" legend entry, palette in series order', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={otherCollision.modelTotals}
      modelWeekly={otherCollision.modelWeekly}
    />
  );

  // 8 fixture series collapse to 5 named + Other (scoped to the weekly
  // chart's legend: the totals bars intentionally still list every model,
  // since HorizontalBars has no tail-folding concept, only a color-series
  // chart does).
  const legend = screen.getByRole('list');

  expect(within(legend).getAllByRole('listitem')).toHaveLength(6);
  expect(within(legend).getByText('Other')).toBeInTheDocument();
  expect(within(legend).queryByText('foxtrot')).not.toBeInTheDocument();

  // Series colors follow the palette order by descending total.
  expect(screen.getByTestId('stack-segment-2026-06-07-alpha')).toHaveClass(
    'fill-accent'
  );
});

test('a real model literally named "other" does not collide with the kit\'s synthetic tail bucket', () => {
  render(
    <ModelMix
      locale="en-US"
      modelTotals={otherCollision.modelTotals}
      modelWeekly={otherCollision.modelWeekly}
    />
  );

  // The real "other" model (500) survives as its own kept, colored series,
  // distinct from the synthetic tail's "Other" (echo+foxtrot+golf = 600).
  // Scoped to the weekly chart's legend: "other" also appears as a totals
  // bar row label (HorizontalBars has no tail-folding concept).
  const legend = screen.getByRole('list');

  expect(within(legend).getByText('other')).toBeInTheDocument();
  expect(within(legend).getByText('Other')).toBeInTheDocument();

  const realOtherSegment = screen.getByTestId(
    'stack-segment-2026-06-07-other.model'
  );
  const syntheticOtherSegment = screen.getByTestId(
    'stack-segment-2026-06-07-other'
  );

  expect(realOtherSegment).not.toHaveClass('fill-fg-mute');
  expect(syntheticOtherSegment).toHaveClass('fill-fg-mute');

  fireEvent.mouseEnter(
    screen.getByRole('graphics-symbol', {name: /Week of Jun 7: 3\.6K total/})
  );
  const tooltip = screen.getByRole('tooltip');

  expect(tooltip).toHaveTextContent('500');
  expect(tooltip).toHaveTextContent('600');
});

test('the skeleton mirrors the section chrome and is hidden from assistive tech', () => {
  render(<ModelMixSkeleton />);

  expect(screen.getByText('Model mix')).toBeInTheDocument();
  expect(screen.getByTestId('model-mix-skeleton')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
});
