import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import EventFilters from '~/components/Sections/Work/EventFilters';
import {countEventsByType} from '~/components/Sections/Work/EventFilters/filters';
import {buildEvents} from '~/components/Sections/Work/events';
import {EVENT_SORT_OPTIONS} from '~/components/Sections/Work/sort';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const events = buildEvents(readFixture('costs-response.json'));
const counts = countEventsByType(events);

type Overrides = Partial<Parameters<typeof EventFilters>[0]>;

const renderFilters = (overrides: Overrides = {}) =>
  render(
    <EventFilters
      counts={counts}
      filter="all"
      onFilterChange={vi.fn()}
      onSortChange={vi.fn()}
      sort="date"
      visibleCount={events.length}
      {...overrides}
    />
  );

const optionsOf = (label: string): HTMLElement[] =>
  within(screen.getByLabelText(label)).getAllByRole('option');

const optionLabels = (label: string): string[] =>
  optionsOf(label).map((option) => option.textContent);

const optionNamed = (label: string, name: string): HTMLElement => {
  const found = optionsOf(label).find((option) => option.textContent === name);

  if (found === undefined) {
    throw new Error(`no ${label} option named ${name}`);
  }

  return found;
};

test('the filter select is labelled and renders the full vocabulary in order', () => {
  renderFilters();

  expect(screen.getByLabelText('Filter')).toBeInTheDocument();
  expect(optionLabels('Filter')).toStrictEqual([
    'All events (10)',
    'Spec (2)',
    'Plan (2)',
    'Debt (2)',
    'Audit (0)',
    'Fitness (0)',
    'Forensics (1)',
    'Harden (0)',
    'Wiki (0)',
    'Review (2)',
  ]);
});

test('both option groups render, Work before Maintenance', () => {
  renderFilters();

  const groups = screen.getAllByRole('group');

  expect(groups).toHaveLength(2);
  expect(groups[0]).toHaveAttribute('label', 'Work');
  expect(groups[1]).toHaveAttribute('label', 'Maintenance');
});

test('a zero-count option is disabled and a populated one is not', () => {
  renderFilters();

  expect(optionNamed('Filter', 'Audit (0)')).toBeDisabled();
  expect(optionNamed('Filter', 'Fitness (0)')).toBeDisabled();
  expect(optionNamed('Filter', 'Harden (0)')).toBeDisabled();
  expect(optionNamed('Filter', 'Wiki (0)')).toBeDisabled();
  expect(optionNamed('Filter', 'Spec (2)')).toBeEnabled();
  expect(optionNamed('Filter', 'Forensics (1)')).toBeEnabled();
  expect(optionNamed('Filter', 'Review (2)')).toBeEnabled();
});

test('All events is never disabled, even when the project has no events at all', () => {
  renderFilters({counts: countEventsByType([]), visibleCount: 0});

  expect(optionNamed('Filter', 'All events (0)')).toBeEnabled();
  expect(optionNamed('Filter', 'Spec (0)')).toBeDisabled();
});

test('the unknown type has no option and its count is shown nowhere', () => {
  renderFilters();

  expect(optionLabels('Filter').some((label) => /unknown/iu.test(label))).toBe(
    false
  );
  expect(screen.queryByText(/unknown/iu)).not.toBeInTheDocument();
});

test('the sort select renders the four options in the spec order', () => {
  renderFilters();

  expect(screen.getByLabelText('Sort')).toBeInTheDocument();
  expect(optionLabels('Sort')).toStrictEqual([
    'Date (newest first)',
    'Cost (highest first)',
    'Time (longest first)',
    'Status',
  ]);
  expect(optionLabels('Sort')).toStrictEqual(
    EVENT_SORT_OPTIONS.map((option) => option.label)
  );
});

test('the count line is a polite live region reporting the visible count', () => {
  renderFilters({visibleCount: 3});

  const count = screen.getByText('3 events');

  expect(count).toHaveAttribute('aria-live', 'polite');
  expect(count).toHaveClass('text-label');
});

test('choosing a category reports the resolved filter id', () => {
  const onFilterChange = vi.fn();

  renderFilters({onFilterChange});
  fireEvent.change(screen.getByLabelText('Filter'), {target: {value: 'debt'}});

  expect(onFilterChange).toHaveBeenCalledWith('debt');
});

test('choosing a sort reports the resolved sort id', () => {
  const onSortChange = vi.fn();

  renderFilters({onSortChange});
  fireEvent.change(screen.getByLabelText('Sort'), {target: {value: 'cost'}});

  expect(onSortChange).toHaveBeenCalledWith('cost');
});

test('while loading, both selects are disabled and reduced to one placeholder option', () => {
  renderFilters({disabled: true});

  expect(screen.getByLabelText('Filter')).toBeDisabled();
  expect(screen.getByLabelText('Sort')).toBeDisabled();
  expect(optionLabels('Filter')).toStrictEqual(['All events']);
  expect(optionLabels('Sort')).toStrictEqual(['Date (newest first)']);
  expect(screen.queryByRole('group')).not.toBeInTheDocument();
});

test('the selects carry the focus ring and no eyebrow treatment', () => {
  renderFilters();

  const filter = screen.getByLabelText('Filter');

  expect(filter).toHaveClass('focus-visible:outline-accent');
  expect(filter).toHaveClass('bg-bg-elev');
  expect(filter.className).not.toMatch(/uppercase|tracking-\[/u);
});
