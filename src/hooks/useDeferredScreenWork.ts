import { useEffect, useState } from 'react';

/**
 * Opens the gate after the destination has had a frame to paint.
 *
 * Use this for secondary requests, subscriptions, analytics, and prefetch
 * work; never for access control or the primary data needed to render the
 * destination.
 *
 * Waiting on the interaction queue was the previous implementation. Any
 * decorative `Animated.timing`/`delay` that still counts as an interaction
 * held that queue open, so a tab that had already painted sat on a skeleton
 * until some unrelated animation finished. One rAF is the contract: yield
 * the tap frame, then run. A short timeout fail-opens if the frame callback
 * is dropped (backgrounded screen, frozen tab).
 */
export function useDeferredScreenWork(enabled = true) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }

    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      setReady(true);
    };

    const frame = requestAnimationFrame(open);
    const failOpen = setTimeout(open, 48);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(failOpen);
    };
  }, [enabled]);

  return ready;
}
