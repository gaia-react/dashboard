import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {EVENT_TONES} from '~/components/Sections/Work/event-meta';
import EventCard from '~/components/Sections/Work/EventList/EventCard';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {buildEvents} from '~/components/Sections/Work/events';
import {NO_DATA_LABEL} from '~/data/format/units';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const events = buildEvents(readFixture('costs-response.json'));

const byKey = (key: string): GaiaEvent => {
  const found = events.find((event) => event.key === key);

  if (found === undefined) {
    throw new Error(`no event with key ${key}`);
  }

  return found;
};

const byType = (type: GaiaEvent['type']): GaiaEvent => {
  const found = events.find((event) => event.type === type);

  if (found === undefined) {
    throw new Error(`fixture has no ${type}-type event`);
  }

  return found;
};

const COMMAND_WITH_ARTIFACT = 'command:gaia-debt-20260715T114955Z-7b0a';
const COMMAND_WITHOUT_ARTIFACT = 'command:cc33dd44-ee55-66ff-a011-223344556677';
const REVIEW_KEY = 'review:7b0a1c2d-3e4f-5061-7283-94a5b6c7d8e9';

type Overrides = Partial<Parameters<typeof EventCard>[0]>;

const renderCard = (event: GaiaEvent, overrides: Overrides = {}) =>
  render(
    <ul>
      <EventCard
        event={event}
        isSelected={false}
        isTabStop={false}
        onSelect={vi.fn()}
        {...overrides}
      />
    </ul>
  );

test('the card carries the identity triple: tone icon, chip word, and handle', () => {
  renderCard(byKey('SPEC-032'));

  // The glyph renders exactly once, inside the chip (DESIGN-SPEC 4.1). The
  // standalone icon the spec originally put beside the chip was dropped at
  // P4: 4.2 already calls the chip's icon plus word plus tone the redundant
  // triple, and a second copy of the same glyph 8px away is noise. Asserted
  // by length, so a reintroduced duplicate fails here rather than passing a
  // loose query.
  const icons = screen.getAllByTestId('icon-spec');

  expect(icons).toHaveLength(1);
  expect(icons[0]).toHaveClass(EVENT_TONES.spec.icon);
  expect(screen.getByTestId('type-chip')).toBeInTheDocument();
  expect(screen.getByText('Spec')).toBeInTheDocument();
  expect(screen.getByText('SPEC-032')).toBeInTheDocument();
  expect(
    screen.getByText('Audit cost tracking and the recorded-spend drill-down.')
  ).toBeInTheDocument();
});

test('every card controls the detail panel', () => {
  renderCard(byKey('SPEC-032'));

  expect(screen.getByRole('button')).toHaveAttribute(
    'aria-controls',
    'event-detail'
  );
});

test('the selected card takes a full tone border and the raised surface, and nothing else', () => {
  renderCard(byKey('SPEC-032'), {isSelected: true, isTabStop: true});

  const card = screen.getByRole('button');

  expect(card).toHaveAttribute('aria-current', 'true');
  expect(card).toHaveAttribute('tabindex', '0');
  expect(card).toHaveClass(EVENT_TONES.spec.border);
  expect(card).toHaveClass('bg-bg-elev-2');
  expect(card).toHaveClass('rounded-md');
  expect(card.className).not.toMatch(
    /border-l-|border-r-|shadow|scale-|blur|gradient/u
  );
  // The tone border must REPLACE the neutral one. Leaving both on the element
  // would make the rendered color depend on stylesheet order rather than on
  // selection, which is the same bug wearing a passing assertion.
  expect(card).not.toHaveClass('border-border');
  expect(card).not.toHaveClass('bg-bg-elev');
  expect(card).not.toHaveClass('rounded-sm');
});

test('an unselected card keeps the neutral border and the base surface', () => {
  renderCard(byKey('SPEC-032'));

  const card = screen.getByRole('button');

  expect(card).not.toHaveAttribute('aria-current');
  expect(card).toHaveAttribute('tabindex', '-1');
  expect(card).toHaveClass('border-border');
  expect(card).not.toHaveClass(EVENT_TONES.spec.border);
  expect(card).toHaveClass('bg-bg-elev');
});

test('the tone border differs per event type and is never concatenated', () => {
  renderCard(byKey(COMMAND_WITH_ARTIFACT), {isSelected: true});

  expect(screen.getByRole('button')).toHaveClass(EVENT_TONES.debt.border);
});

test('hover never moves the border, so hover cannot read as selection', () => {
  renderCard(byKey('SPEC-032'));

  const card = screen.getByRole('button');

  expect(card).toHaveClass('hover:bg-bg-elev-2');
  expect(card.className).not.toMatch(/hover:border-/u);
});

test('the card honors reduced motion on its only transition', () => {
  renderCard(byKey('SPEC-032'));

  const card = screen.getByRole('button');

  expect(card).toHaveClass('transition-colors');
  expect(card).toHaveClass('motion-reduce:transition-none');
});

test('the figures row is a fixed three-track grid in text-fg, never fg-mute', () => {
  renderCard(byKey('SPEC-032'));

  const figures = screen.getByTestId('event-figures');

  expect(figures).toHaveClass('grid');
  expect(figures).toHaveClass('grid-cols-[auto_auto_auto]');
  expect(figures).toHaveClass('text-fg');
  expect(figures.className).not.toMatch(/text-fg-mute|\bflex\b/u);
  expect(
    screen.getAllByTestId(/^event-figure-/u).map((cell) => cell.dataset.testid)
  ).toStrictEqual([
    'event-figure-started',
    'event-figure-cost',
    'event-figure-elapsed',
  ]);
});

test('a null cost and a null duration render dashes in their own columns, never zeros', () => {
  renderCard(byKey('PLAN-004'));

  expect(screen.getByTestId('event-figure-cost')).toHaveTextContent('Cost -');
  expect(screen.getByTestId('event-figure-elapsed')).toHaveTextContent(
    'Elapsed -'
  );
  expect(
    screen.getAllByTestId(/^event-figure-/u).map((cell) => cell.dataset.testid)
  ).toStrictEqual([
    'event-figure-started',
    'event-figure-cost',
    'event-figure-elapsed',
  ]);
  expect(screen.getByTestId('event-figures')).not.toHaveTextContent(/0\.00/);
  expect(screen.getByTestId('event-figures')).not.toHaveTextContent(/0m/);
});

test('a recorded zero renders as a zero, because zero is a measurement', () => {
  renderCard(byKey('slug:offline-mode'));

  const cost = screen.getByTestId('event-figure-cost');

  expect(cost).toHaveTextContent(/0/);
  expect(cost).not.toHaveTextContent(new RegExp(NO_DATA_LABEL));
  expect(screen.getByTestId('event-figure-elapsed')).toHaveTextContent(
    'Elapsed 0m'
  );
});

test('the started column carries a date without a time', () => {
  renderCard(byKey('SPEC-032'));

  const started = screen.getByTestId('event-figure-started');

  expect(started).toHaveTextContent(/^Started .*2026/u);
  expect(started).not.toHaveTextContent(/:/);
});

test('a command card names its artifact without nesting a link inside the button', () => {
  renderCard(byKey(COMMAND_WITH_ARTIFACT));

  const card = screen.getByRole('button');

  expect(within(card).getByText('PR #769')).toBeInTheDocument();
  expect(within(card).queryByRole('link')).not.toBeInTheDocument();
});

test('a command with no github reference renders the dash, never a broken link', () => {
  renderCard(byKey(COMMAND_WITHOUT_ARTIFACT));

  const card = screen.getByRole('button');

  expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByTestId('event-artifact')).toHaveTextContent(NO_DATA_LABEL);
});

test('an unrecognized command degrades to the unknown tone and never breaks', () => {
  renderCard(byType('unknown'));

  expect(screen.getAllByTestId('icon-unknown')).toHaveLength(1);
  expect(screen.getByText('Unknown')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeInTheDocument();
});

test('an ad-hoc review card is structurally identical, with a dash where status would be', () => {
  renderCard(byKey(REVIEW_KEY));

  expect(screen.getByText('Code review 7b0a1c2d')).toBeInTheDocument();
  expect(screen.getByText(NO_DATA_LABEL)).toHaveClass('text-fg-dim');
  expect(screen.getByTestId('event-figures')).toBeInTheDocument();
});

test('a ledger status renders as text, uncolored', () => {
  renderCard(byKey('SPEC-032'));

  expect(screen.getByText('Merged')).toHaveClass('text-fg-dim');
});

test('activating the card reports its selection key', () => {
  const onSelect = vi.fn();

  renderCard(byKey('SPEC-018'), {onSelect});
  fireEvent.click(screen.getByRole('button'));

  expect(onSelect).toHaveBeenCalledWith('SPEC-018');
});
