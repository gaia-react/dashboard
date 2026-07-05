import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import App from '~/components/App';

test('renders the GAIA wordmark', () => {
  render(<App />);
  expect(screen.getByAltText('GAIA')).toBeInTheDocument();
});
