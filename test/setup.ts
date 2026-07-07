import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import '@testing-library/jest-dom/vitest';

// Vitest runs without injected globals, so Testing Library's automatic
// cleanup never registers; do it explicitly.
afterEach(() => {
  cleanup();
});
