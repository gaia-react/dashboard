import type {FC, KeyboardEvent} from 'react';
import {useRef} from 'react';
import {twJoin} from 'tailwind-merge';

/**
 * A horizontal tab strip following the WAI-ARIA tabs pattern: one tab stop
 * (roving `tabindex`), Arrow/Home/End move focus and activate, and every tab
 * points at its panel via `aria-controls`. Presentational and controlled: the
 * parent owns the active id (the dashboard keeps it in the URL) and renders
 * the panels itself, wiring `id={tabPanelId(id)}` / `aria-labelledby={tabButtonId(id)}`.
 */

export type TabItem = {
  id: string;
  label: string;
};

export const tabButtonId = (id: string): string => `tab-${id}`;

export const tabPanelId = (id: string): string => `tabpanel-${id}`;

type Props = {
  activeId: string;
  items: TabItem[];
  /** Accessible name for the tablist. */
  label: string;
  onSelect: (id: string) => void;
};

const tablistClass = 'border-border flex gap-1 border-b';
const tabBaseClass =
  '-mb-px border-b-2 px-4 py-2.5 font-mono text-xs tracking-[0.15em] uppercase transition-colors focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none';
const tabActiveClass = 'border-accent text-fg';
const tabInactiveClass =
  'border-transparent text-fg-dim hover:border-border-soft hover:text-fg';

const Tabs: FC<Props> = ({activeId, items, label, onSelect}) => {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTabAt = (index: number): void => {
    const wrapped = (index + items.length) % items.length;

    buttonRefs.current[wrapped]?.focus();
    onSelect(items[wrapped].id);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTabAt(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTabAt(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTabAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTabAt(items.length - 1);
    }
  };

  return (
    <div aria-label={label} className={tablistClass} role="tablist">
      {items.map((item, index) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            aria-controls={tabPanelId(item.id)}
            aria-selected={isActive}
            className={twJoin(
              tabBaseClass,
              isActive ? tabActiveClass : tabInactiveClass
            )}
            id={tabButtonId(item.id)}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
