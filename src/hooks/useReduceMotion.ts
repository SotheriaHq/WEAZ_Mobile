import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility setting, including changes made
 * while the app is running.
 *
 * The read/subscribe pair was already open-coded in `ThreadTapBurstOverlay` and
 * `ThreadRailAction`; the Runway transit scale would have been a third copy.
 * Those two are still on their own inline copies — migrating them is mechanical
 * but touches unrelated catalog animation timing, so it is left as follow-up
 * rather than folded into a feed change.
 *
 * Defaults to `false` (motion allowed) so the first frame never suppresses an
 * effect that the user has not actually asked to suppress; the async read
 * corrects it immediately after mount.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(Boolean(enabled));
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
