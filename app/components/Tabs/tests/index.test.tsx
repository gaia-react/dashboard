import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, test, vi} from 'vitest';
import Tabs, {tabButtonId, tabPanelId} from '~/components/Tabs';

const items = [
  {id: 'work', label: 'Work'},
  {id: 'sessions', label: 'Sessions'},
  {id: 'activity', label: 'Activity'},
];

const setupTabs = (activeId = 'work') => {
  const onSelect = vi.fn();

  render(
    <Tabs
      activeId={activeId}
      items={items}
      label="Dashboard sections"
      onSelect={onSelect}
    />
  );

  return onSelect;
};

describe('Tabs', () => {
  test('marks the active tab selected and wires it to its panel', () => {
    setupTabs('sessions');

    const active = screen.getByRole('tab', {name: 'Sessions', selected: true});

    expect(active).toHaveAttribute('id', tabButtonId('sessions'));
    expect(active).toHaveAttribute('aria-controls', tabPanelId('sessions'));
    expect(active).toHaveAttribute('tabindex', '0');
  });

  test('inactive tabs are removed from the tab order (roving tabindex)', () => {
    setupTabs('work');

    expect(screen.getByRole('tab', {name: 'Activity'})).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  test('clicking a tab selects it', () => {
    const onSelect = setupTabs('work');

    fireEvent.click(screen.getByRole('tab', {name: 'Activity'}));

    expect(onSelect).toHaveBeenCalledWith('activity');
  });

  test('ArrowRight moves to the next tab and wraps at the end', () => {
    const onSelect = setupTabs('activity');

    fireEvent.keyDown(screen.getByRole('tab', {name: 'Activity'}), {
      key: 'ArrowRight',
    });

    expect(onSelect).toHaveBeenCalledWith('work');
  });

  test('ArrowLeft moves to the previous tab', () => {
    const onSelect = setupTabs('sessions');

    fireEvent.keyDown(screen.getByRole('tab', {name: 'Sessions'}), {
      key: 'ArrowLeft',
    });

    expect(onSelect).toHaveBeenCalledWith('work');
  });

  test('Home and End jump to the first and last tab', () => {
    const onSelect = setupTabs('sessions');

    fireEvent.keyDown(screen.getByRole('tab', {name: 'Sessions'}), {
      key: 'Home',
    });
    expect(onSelect).toHaveBeenCalledWith('work');

    fireEvent.keyDown(screen.getByRole('tab', {name: 'Sessions'}), {
      key: 'End',
    });
    expect(onSelect).toHaveBeenCalledWith('activity');
  });
});
