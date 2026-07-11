/**
 * Phase 5 predictive tab warming + AppState bridge.
 *
 * After Runway (the `index` tab) is stable, warm the likely next tabs — Market
 * (discover), Messages (inbox), Profile (me) — on a staggered idle schedule.
 * `router.prefetch` mounts each screen off-screen, so its primary queries +
 * media warm via the screen's own mount effects (no per-tab query wiring needed).
 *
 * Guards: once per session and only while the app is active. Do not wait for
 * InteractionManager here: long scroll/gesture interactions can keep likely
 * destinations cold until the exact tap that needs them.
 */
import { AppState } from 'react-native';

import { navPerf } from '@/src/utils/navPerf';
import { prefetchRoute } from '@/src/prefetch/navPrefetch';
import { setPrefetchPaused } from '@/src/prefetch/prefetchBudget';

const PRIMARY_TABS = [
  { href: '/(tabs)/discover', delayMs: 400 },
  { href: '/(tabs)/inbox', delayMs: 700 },
  { href: '/(tabs)/me', delayMs: 1000 },
  // Brand catalogue is a top-level island destination (href null) — warm it too.
  { href: '/catalog', delayMs: 550 },
] as const;

let warmedThisSession = false;

export function warmPrimaryTabsAfterRunway(): void {
  if (warmedThisSession) return;
  warmedThisSession = true;

  navPerf.mark('predictive_tab_warm_started');
  PRIMARY_TABS.forEach(({ href, delayMs }) => {
    setTimeout(() => {
      if (AppState.currentState !== 'active') return;
      prefetchRoute(href, 'idle');
    }, delayMs);
  });
  setTimeout(() => navPerf.mark('predictive_tab_warm_completed'), 2200);
}

/** Test/diagnostic helper. */
export function __resetTabWarming(): void {
  warmedThisSession = false;
}

let appStateBridgeInstalled = false;

/**
 * Pause all non-tap prefetching whenever the app is not foregrounded.
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
