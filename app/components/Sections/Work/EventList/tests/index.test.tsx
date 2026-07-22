import type {FC} from 'react';
import {useState} from 'react';
import {createEvent, fireEvent, render, screen} from '@testing-library/react';
import {expect, test, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {ALL_EVENTS_LABEL} from '~/components/Sections/Work/EventFilters/filters';
import EventList, {
  EventListSkeleton,
} from '~/components/Sections/Work/EventList';
import type {GaiaEvent} from '~/components/Sections/Work/events';
import {buildEvents} from '~/components/Sections/Work/events';
import type {CostsResponse} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const events = buildEvents(readFixture('costs-response.json'));

type HarnessProps = {
  initialKey: null | string;
  list?: GaiaEvent[];
};

/**
 * The list is controlled, so keyboard behavior only means something when the
 * parent feeds the new selection back in. Every arrow-key assertion runs
 * through this harness rather than through a spy, so a handler that reports a
 * key but never moves focus fails.
 */
const Harness: FC<HarnessProps> = ({initialKey, list = events}) => {
  const [selectedKey, setSelectedKey] = useState<null | string>(initialKey);

  return (
    <EventList
      events={list}
      filterLabel={ALL_EVENTS_LABEL}
      onSelect={setSelectedKey}
      selectedKey={selectedKey}
    />
  );
};

const cards = (): HTMLElement[] => screen.getAllByRole('button');

const pressKey = (element: HTMLElement, key: string): void => {
  element.focus();
  fireEvent.keyDown(element, {key});
};

test('renders one card per event, in the order it was given', () => {
  render(<Harness initialKey={events[0].key} />);

  expect(cards()).toHaveLength(events.length);

  for (const card of cards()) {
    expect(card).toHaveAttribute('aria-controls', 'event-detail');
  }
});

test('the list is a ul of li of button, never a listbox of options', () => {
  render(<Harness initialKey={events[0].key} />);

  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(events.length);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('option')).toHaveLength(0);
});

test('exactly one card is a tab stop, and it is the selected one', () => {
  render(<Harness initialKey={events[2].key} />);

  const stops = cards().filter((card) => card.getAttribute('tabindex') === '0');

  expect(stops).toHaveLength(1);
  expect(stops[0]).toHaveAttribute('aria-current', 'true');
  expect(cards()[2]).toBe(stops[0]);
});

test('with no selection the list is still reachable by Tab, at the first card', () => {
  render(<Harness initialKey={null} />);

  const stops = cards().filter((card) => card.getAttribute('tabindex') === '0');

  expect(stops).toHaveLength(1);
  expect(stops[0]).toBe(cards()[0]);
  expect(
    cards().filter((card) => card.hasAttribute('aria-current'))
  ).toHaveLength(0);
});

test('ArrowDown moves the selection and the DOM focus together', () => {
  render(<Harness initialKey={events[0].key} />);

  pressKey(cards()[0], 'ArrowDown');

  expect(cards()[1]).toHaveFocus();
  expect(cards()[1]).toHaveAttribute('aria-current', 'true');
  expect(cards()[1]).toHaveAttribute('tabindex', '0');
  expect(cards()[0]).not.toHaveAttribute('aria-current');
});

test('ArrowUp moves the selection and the DOM focus together', () => {
  render(<Harness initialKey={events[3].key} />);

  pressKey(cards()[3], 'ArrowUp');

  expect(cards()[2]).toHaveFocus();
  expect(cards()[2]).toHaveAttribute('aria-current', 'true');
});

test('ArrowDown at the last card is a no-op: the list does not wrap', () => {
  const last = events.length - 1;

  render(<Harness initialKey={events[last].key} />);
  pressKey(cards()[last], 'ArrowDown');

  expect(cards()[last]).toHaveFocus();
  expect(cards()[last]).toHaveAttribute('aria-current', 'true');
  expect(cards()[0]).not.toHaveAttribute('aria-current');
});

test('ArrowUp at the first card is a no-op: the list does not wrap', () => {
  render(<Harness initialKey={events[0].key} />);
  pressKey(cards()[0], 'ArrowUp');

  expect(cards()[0]).toHaveFocus();
  expect(cards()[0]).toHaveAttribute('aria-current', 'true');
  expect(cards()[events.length - 1]).not.toHaveAttribute('aria-current');
});

test('Home and End select and focus the ends', () => {
  const last = events.length - 1;

  render(<Harness initialKey={events[4].key} />);

  pressKey(cards()[4], 'End');
  expect(cards()[last]).toHaveFocus();
  expect(cards()[last]).toHaveAttribute('aria-current', 'true');

  pressKey(cards()[last], 'Home');
  expect(cards()[0]).toHaveFocus();
  expect(cards()[0]).toHaveAttribute('aria-current', 'true');
});

test('arrow keys claim the keypress; Enter and Space are left to the button', () => {
  render(<Harness initialKey={events[0].key} />);

  const first = cards()[0];

  first.focus();

  const arrow = createEvent.keyDown(first, {key: 'ArrowDown'});

  fireEvent(first, arrow);
  expect(arrow.defaultPrevented).toBe(true);

  const enter = createEvent.keyDown(cards()[1], {key: 'Enter'});

  fireEvent(cards()[1], enter);
  expect(enter.defaultPrevented).toBe(false);

  const space = createEvent.keyDown(cards()[1], {key: ' '});

  fireEvent(cards()[1], space);
  expect(space.defaultPrevented).toBe(false);
});

test('clicking a card reports its key to the parent', () => {
  const onSelect = vi.fn();

  render(
    <EventList
      events={events}
      filterLabel={ALL_EVENTS_LABEL}
      onSelect={onSelect}
      selectedKey={events[0].key}
    />
  );
  fireEvent.click(cards()[1]);

  expect(onSelect).toHaveBeenCalledWith(events[1].key);
});

test('a project with no events teaches what would fill the list', () => {
  render(<Harness initialKey={null} list={[]} />);

  expect(screen.getByText('No GAIA events yet')).toBeInTheDocument();
  expect(
    screen.getByText(
      "Events appear here as GAIA records specs, plans, reviews, and command runs to this project's cost ledger. A fresh project has none."
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

test('an empty filter names the category and points back to All events', () => {
  render(
    <EventList
      events={[]}
      filterLabel="Audit"
      onSelect={vi.fn()}
      selectedKey={null}
    />
  );

  expect(screen.getByText('No Audit events')).toBeInTheDocument();
  expect(
    screen.getByText(
      'This project has no Audit events yet. Choose "All events" to see everything.'
    )
  ).toBeInTheDocument();
});

test('the skeleton holds the real shape: a disabled filter row over five cards', () => {
  render(<EventListSkeleton />);

  const skeleton = screen.getByTestId('event-list-skeleton');

  expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getAllByTestId('event-skeleton-card')).toHaveLength(5);

  const selects = screen.getAllByTestId('event-skeleton-select');

  expect(selects).toHaveLength(2);

  for (const select of selects) {
    expect(select).toBeDisabled();
  }

  expect(selects[0]).toHaveTextContent(ALL_EVENTS_LABEL);
  expect(selects[1]).toHaveTextContent('Date (newest first)');
});

test('the skeleton adds no second live region', () => {
  render(<EventListSkeleton />);

  expect(screen.getByTestId('event-skeleton-count')).not.toHaveAttribute(
    'aria-live'
  );
});

test('the skeleton card mirrors the real card box, so the swap shifts nothing', () => {
  render(<EventListSkeleton />);

  const card = screen.getAllByTestId('event-skeleton-card')[0];

  expect(card).toHaveClass('px-4');
  expect(card).toHaveClass('py-3');
  expect(card).toHaveClass('rounded-md');
  expect(card).toHaveClass('border-border');
});
