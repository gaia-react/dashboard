import {renderHook, waitFor} from '@testing-library/react';
import {describe, expect, test} from 'vitest';
import {useCollapse} from '~/hooks/useCollapse';

describe('useCollapse', () => {
  test('starts mounted and expanded when open from the first render', () => {
    const {result} = renderHook(() => useCollapse(true));

    expect(result.current.mounted).toBe(true);
  });

  test('starts unmounted when closed', () => {
    const {result} = renderHook(() => useCollapse(false));

    expect(result.current.mounted).toBe(false);
    expect(result.current.expanded).toBe(false);
  });

  test('mounts immediately on open', () => {
    const {rerender, result} = renderHook(({open}) => useCollapse(open), {
      initialProps: {open: false},
    });

    rerender({open: true});

    expect(result.current.mounted).toBe(true);
  });

  test('unmounts after the transition duration on close', async () => {
    const {rerender, result} = renderHook(({open}) => useCollapse(open, 20), {
      initialProps: {open: true},
    });

    rerender({open: false});

    // Still mounted while the close animation runs.
    expect(result.current.mounted).toBe(true);
    expect(result.current.expanded).toBe(false);

    await waitFor(() => {
      expect(result.current.mounted).toBe(false);
    });
  });
});
