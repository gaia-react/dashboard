import {render, screen} from '@testing-library/react';
import {describe, expect, test} from 'vitest';
import Icon from '~/components/Icon';
import {iconMap} from '~/components/Icon/icon-map';
import type {IconName} from '~/components/Icon/icon-map';

const everyIconName = Object.keys(iconMap) as IconName[];

describe('Icon', () => {
  test.each(everyIconName)('renders an svg for icon name "%s"', (name) => {
    render(<Icon name={name} />);

    expect(screen.getByTestId(`icon-${name}`)).toBeInTheDocument();
  });

  test('is aria-hidden and exposes no accessible name by default', () => {
    render(<Icon name="spec" />);

    expect(screen.getByTestId('icon-spec')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('with a label, takes role="img", the accessible name, and drops aria-hidden', () => {
    render(<Icon label="Spec" name="spec" />);

    const icon = screen.getByRole('img', {name: 'Spec'});

    expect(icon).not.toHaveAttribute('aria-hidden');
  });

  test.each([14, 16, 20, 24] as const)(
    'size %i produces a %ipx square svg',
    (size) => {
      render(<Icon name="spec" size={size} />);
      const icon = screen.getByTestId('icon-spec');

      expect(icon).toHaveAttribute('height', String(size));
      expect(icon).toHaveAttribute('width', String(size));
    }
  );

  test('defaults to size 16 when no size prop is given', () => {
    render(<Icon name="spec" />);
    const icon = screen.getByTestId('icon-spec');

    expect(icon).toHaveAttribute('height', '16');
    expect(icon).toHaveAttribute('width', '16');
  });

  test('merges a caller className instead of replacing the component classes', () => {
    render(<Icon className="text-accent" name="spec" />);
    const icon = screen.getByTestId('icon-spec');

    expect(icon).toHaveClass('text-accent');
    expect(icon).toHaveClass('shrink-0');
  });

  test('an unrecognized name degrades to the terminal fallback icon', () => {
    render(<Icon name={'does-not-exist' as IconName} />);
    render(<Icon name="unknown" />);

    expect(screen.getByTestId('icon-does-not-exist').innerHTML).toEqual(
      screen.getByTestId('icon-unknown').innerHTML
    );
  });

  test.each([
    'constructor',
    'hasOwnProperty',
    'valueOf',
    '__proto__',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ])(
    'a runtime name colliding with Object.prototype ("%s") also degrades to the terminal fallback, not a crash',
    (name) => {
      render(<Icon name={name as IconName} />);
      render(<Icon name="unknown" />);

      expect(screen.getByTestId(`icon-${name}`).innerHTML).toEqual(
        screen.getByTestId('icon-unknown').innerHTML
      );
    }
  );

  test('sets no fill or stroke color of its own, so currentColor inheritance works', () => {
    render(<Icon name="spec" />);
    const icon = screen.getByTestId('icon-spec');

    expect(icon).toHaveAttribute('stroke', 'currentColor');
    expect(icon).not.toHaveAttribute('color');
    expect(icon).toHaveStyle({color: ''});
  });

  test('renders with a 1.5 stroke width (DESIGN.md: Lucide, 1.5px, round caps)', () => {
    render(<Icon name="spec" />);
    const icon = screen.getByTestId('icon-spec');

    expect(icon).toHaveAttribute('stroke-width', '1.5');
    expect(icon).toHaveAttribute('stroke-linecap', 'round');
    expect(icon).toHaveAttribute('stroke-linejoin', 'round');
  });
});
