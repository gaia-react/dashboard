import {useEffect, useState} from 'react';

/**
 * Drives an open/close height animation for disclosure content (e.g. an
 * expandable table row) without a motion library. Returns `mounted` (whether
 * to render the content at all) and `expanded` (whether to apply the
 * open-height class):
 *
 * - Opening: mount immediately (so the enter animation has something to run
 *   on), then flip `expanded` two frames later so the grid-rows transition
 *   runs from 0fr to 1fr. Two frames, not one: the mount commit and a single
 *   rAF's commit can still land in the same browser paint, so the 0fr frame
 *   is never actually rendered and the panel just pops open. The first frame
 *   only guarantees that paint happens; the second is what flips to 1fr.
 * - Closing: flip `expanded` off to animate back to 0fr, then unmount after
 *   the transition duration so collapsed rows leave the DOM (and the a11y
 *   tree) entirely rather than lingering as focusable zero-height content.
 *
 * The synchronous mount-on-open / collapse-on-close are the whole point of the
 * hook: state must track the `open` prop across frames, which is exactly the
 * mount-transition pattern `set-state-in-effect` cannot express another way.
 * The deferred work (the enter frames, the unmount timer) is genuinely async.
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

      let expandFrame = 0;
      const paintFrame = requestAnimationFrame(() => {
        expandFrame = requestAnimationFrame(() => {
          setExpanded(true);
        });
      });

      return () => {
        cancelAnimationFrame(paintFrame);
        cancelAnimationFrame(expandFrame);
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
