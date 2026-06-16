import { router, type Href } from 'expo-router';

import { navPerf } from '@/src/utils/navPerf';

/**
 * Intent-based navigation helpers — the system route verb contract.
 *
 * Expo Router exposes several navigation verbs whose route-lifetime semantics
 * differ, and choosing the wrong one is the root of the "every tap feels
 * delayed / the screen reloads" class of bugs:
 *
 *   - `push` stacks a brand-new instance of (often heavy) screens, so returning
 *     to a top-level destination remounts it and re-runs its initial fetch
 *     (visible skeleton/empty flash), and repeated taps pile up duplicates.
 *   - `replace` destroys the screen you came from, forcing a remount + refetch
 *     when the user navigates back.
 *
 * These helpers encode the correct verb per intent so call sites read by intent
 * rather than by Expo Router primitive:
 *
 *   topLevelNavigate — switch to a persistent top-level destination (tabs,
 *                      catalogue, orders). Reuses an already-mounted instance.
 *   drillDownPush    — open a true detail screen on top of the current one.
 *   backOrNavigate   — a back action: go back when there is history, otherwise
 *                      `navigate` (NOT `replace`) to a safe top-level fallback so
 *                      the fallback destination keeps its warm state.
 *   dismissToSource  — close a nested flow back to a screen already behind it.
 *
 * `replace` is intentionally NOT wrapped here. It stays a direct `router.replace`
 * call at the few sites that genuinely need destructive replacement — auth
 * redirects, invalid direct-entry states, and notification/deeplink handoff — so
 * that intent stays explicit and greppable.
 */

/** Switch to a persistent top-level destination, reusing any existing instance. */
export function topLevelNavigate(href: Href) {
  navPerf.navigationCalled();
  router.navigate(href as never);
}

/** Open a true drill-down detail screen on top of the current screen. */
export function drillDownPush(href: Href) {
  navPerf.navigationCalled();
  router.push(href as never);
}

/**
 * Perform a back action. Go back when there is history; otherwise navigate to a
 * safe top-level fallback. Never uses `replace`, which would destroy the
 * fallback's warm state on a subsequent return.
 */
export function backOrNavigate(fallback: Href) {
  navPerf.navigationCalled();
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.navigate(fallback as never);
}

/**
 * Close a nested flow back to a source screen that should already exist behind
 * it (e.g. create-design → catalogue). Falls back to `navigate` when
 * `dismissTo` is unavailable so the call can never crash.
 */
export function dismissToSource(href: Href) {
  navPerf.navigationCalled();
  const dismissTo = (router as unknown as { dismissTo?: (href: never) => void }).dismissTo;
  if (typeof dismissTo === 'function') {
    dismissTo.call(router, href as never);
    return;
  }
  router.navigate(href as never);
}
