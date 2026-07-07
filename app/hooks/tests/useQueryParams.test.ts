import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, test} from 'vitest';
import {useQueryParams} from '~/hooks/useQueryParams';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useQueryParams', () => {
  test('reads the current query string', () => {
    window.history.replaceState(
      null,
      '',
      '/?tab=sessions&model=claude-opus-4-8'
    );

    const {result} = renderHook(() => useQueryParams());

    expect(result.current[0].get('tab')).toBe('sessions');
    expect(result.current[0].get('model')).toBe('claude-opus-4-8');
  });

  test('setting a patch pushes a new URL and re-renders with it', () => {
    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[1]({tab: 'work'});
    });

    expect(window.location.search).toBe('?tab=work');
    expect(result.current[0].get('tab')).toBe('work');
  });

  test('a null or empty value deletes the key', () => {
    window.history.replaceState(null, '', '/?tab=sessions&type=gaia&page=3');

    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[1]({page: null, type: ''});
    });

    expect(result.current[0].get('type')).toBeNull();
    expect(result.current[0].get('page')).toBeNull();
    expect(result.current[0].get('tab')).toBe('sessions');
  });

  test('merges a patch into existing params rather than replacing them', () => {
    window.history.replaceState(
      null,
      '',
      '/?tab=sessions&model=claude-sonnet-5'
    );

    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[1]({page: '2'});
    });

    expect(window.location.search).toBe(
      '?tab=sessions&model=claude-sonnet-5&page=2'
    );
  });

  test('separate hook instances stay in sync through the shared store', () => {
    const {result: firstResult} = renderHook(() => useQueryParams());
    const {result: secondResult} = renderHook(() => useQueryParams());

    act(() => {
      firstResult.current[1]({tab: 'activity'});
    });

    expect(secondResult.current[0].get('tab')).toBe('activity');
  });

  test('clearing every key drops the question mark entirely', () => {
    window.history.replaceState(null, '', '/?tab=work');

    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[1]({tab: null});
    });

    expect(window.location.search).toBe('');
  });

  test('resetQueryParams replaces the whole query, dropping params not in the patch', () => {
    window.history.replaceState(null, '', '/?tab=sessions&type=gaia&page=3');

    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[2]({tab: 'work'});
    });

    expect(window.location.search).toBe('?tab=work');
    expect(result.current[0].get('type')).toBeNull();
    expect(result.current[0].get('page')).toBeNull();
  });

  test('resetQueryParams sets every non-null key from the given patch', () => {
    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[2]({entry: 'SPEC-001', tab: 'work', work: 'specs'});
    });

    expect(window.location.search).toBe('?entry=SPEC-001&tab=work&work=specs');
  });

  test('resetQueryParams omits null values from the patch rather than erroring', () => {
    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[2]({entry: null, tab: 'work'});
    });

    expect(window.location.search).toBe('?tab=work');
  });

  test('setQueryParams still merges (unaffected by resetQueryParams)', () => {
    window.history.replaceState(null, '', '/?tab=work');

    const {result} = renderHook(() => useQueryParams());

    act(() => {
      result.current[2]({tab: 'sessions'});
    });
    act(() => {
      result.current[1]({id: 'abc'});
    });

    expect(window.location.search).toBe('?tab=sessions&id=abc');
  });
});
