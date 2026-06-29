import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Opens the gate only after the destination has had a frame to paint and the
 * navigation interaction has settled. Use this for secondary requests,
 * subscriptions, analytics, and prefetch work; never for access control or the
 * primary data needed to render the destination.
 */
export function useDeferredScreenWork(enabled = true) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }

    let interactionTask: { cancel: () => void } | null = null;
    const frame = requestAnimationFrame(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        setReady(true);
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      interactionTask?.cancel();
    };
  }, [enabled]);

  return ready;
}
