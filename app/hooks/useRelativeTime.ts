import {useEffect, useState} from 'react';

const TICK_INTERVAL_MS = 60_000;
const SECONDS_PER_MINUTE = 60;

const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "Just now" under a minute, then "1 minute ago", "2 minutes ago", etc. */
export const formatRelativeTime = (
  sinceMs: number,
  nowMs: number = Date.now()
): string => {
  const elapsedSeconds = Math.max(0, (nowMs - sinceMs) / 1000);

  if (elapsedSeconds < SECONDS_PER_MINUTE) {
    return 'Just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);

  return `${pluralize(elapsedMinutes, 'minute')} ago`;
};

/**
 * Relative-time label for a fixed instant, recomputed every 60s (feedback:
 * the header's "last update" caption should tick over on its own rather than
 * freezing at whatever it read on mount). The label itself is derived fresh
 * from `sinceMs` on every render, so it reflects a new `sinceMs` immediately;
 * the interval only forces the periodic re-render that advances the clock.
 */
export const useRelativeTime = (sinceMs: number): string => {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      forceTick((tick) => tick + 1);
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  return formatRelativeTime(sinceMs);
};
