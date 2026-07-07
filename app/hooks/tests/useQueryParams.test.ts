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
});
