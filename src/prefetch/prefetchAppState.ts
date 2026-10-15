/**
 * Pause non-tap prefetching whenever the app is not foregrounded.
 *
 * This file used to also export `warmPrimaryTabsAfterRunway`, which mounted
 * Market, Messages, Profile and the brand catalogue off-screen on a staggered
 * timer so their queries and media warmed ahead of a tap. That function had
 * NO callers and had not run for some time: `app/(tabs)/_layout.tsx` owns tab
 * preloading now and deliberately warms Market alone, after the first Runway
 * image is visible, to protect the first-paint budget on a constrained phone.
 *
 * It was deleted rather than left in place because dead code that looks live
 * is worse than no code — while investigating slow startup on a low-RAM
 * device, a four-tab warm on a 400ms timer read as an obvious cause, and it
 * cost real time to establish that it never executes. The file was named for
 * that behaviour too, so it was renamed to describe what actually remains.
 *
 * `prefetchRoute` itself is still very much alive; `navPrefetch` uses it on
 * the tap path.
 */
import { AppState } from 'react-native';

import { setPrefetchPaused } from '@/src/prefetch/prefetchBudget';

let appStateBridgeInstalled = false;

/**
 * Install once near the app root; returns a cleanup fn.
 */
export function installPrefetchAppStateBridge(): () => void {
  if (appStateBridgeInstalled) return () => undefined;
  appStateBridgeInstalled = true;

  setPrefetchPaused(AppState.currentState !== 'active');
  const subscription = AppState.addEventListener('change', (state) => {
    setPrefetchPaused(state !== 'active');
  });

  return () => {
    subscription.remove();
    appStateBridgeInstalled = false;
  };
}
