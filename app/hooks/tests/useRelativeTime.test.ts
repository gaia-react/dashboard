import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {formatRelativeTime, useRelativeTime} from '~/hooks/useRelativeTime';

describe('formatRelativeTime', () => {
  test('reads "Just now" inside the first minute', () => {
    const sinceMs = Date.parse('2026-07-05T12:00:00Z');
    const nowMs = Date.parse('2026-07-05T12:00:30Z');

    expect(formatRelativeTime(sinceMs, nowMs)).toBe('Just now');
  });

  test('reads "1 minute ago" at the one-minute threshold', () => {
    const sinceMs = Date.parse('2026-07-05T12:00:00Z');
    const nowMs = Date.parse('2026-07-05T12:01:00Z');

    expect(formatRelativeTime(sinceMs, nowMs)).toBe('1 minute ago');
  });

  test('pluralizes minutes', () => {
    const sinceMs = Date.parse('2026-07-05T12:00:00Z');
    const nowMs = Date.parse('2026-07-05T12:02:05Z');

    expect(formatRelativeTime(sinceMs, nowMs)).toBe('2 minutes ago');
  });
});

describe('useRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('ticks the label over every 60s without a manual refresh', () => {
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
    const sinceMs = Date.now();

    const {result} = renderHook(() => useRelativeTime(sinceMs));

    expect(result.current).toBe('Just now');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe('1 minute ago');

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(result.current).toBe('2 minutes ago');
  });

  test('clears the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));

    const {unmount} = renderHook(() => useRelativeTime(Date.now()));
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
