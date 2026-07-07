import {useEffect, useState} from 'react';

/**
 * Drives an open/close height animation for disclosure content (e.g. an
 * expandable table row) without a motion library. Returns `mounted` (whether
 * to render the content at all) and `expanded` (whether to apply the
 * open-height class):
 *
 * - Opening: mount immediately (so the enter animation has something to run
 *   on), then flip `expanded` on the next frame so the grid-rows transition
 *   runs from 0fr to 1fr.
 * - Closing: flip `expanded` off to animate back to 0fr, then unmount after
 *   the transition duration so collapsed rows leave the DOM (and the a11y
 *   tree) entirely rather than lingering as focusable zero-height content.
 *
 * The synchronous mount-on-open / collapse-on-close are the whole point of the
 * hook: state must track the `open` prop across frames, which is exactly the
 * mount-transition pattern `set-state-in-effect` cannot express another way.
 * The deferred work (the enter frame, the unmount timer) is genuinely async.
 * The unmount is a duration-matched timer rather than a `transitionend`
 * listener so it also fires in environments without real CSS transitions.
 */
export const useCollapse = (
  open: boolean,
  durationMs = 200
): {expanded: boolean; mounted: boolean} => {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount now so the enter animation has a starting frame
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        setExpanded(true);
      });

      return () => {
        cancelAnimationFrame(frame);
      };
    }

    setExpanded(false);
    const timer = setTimeout(() => {
      setMounted(false);
    }, durationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [durationMs, open]);

  return {expanded, mounted};
};
