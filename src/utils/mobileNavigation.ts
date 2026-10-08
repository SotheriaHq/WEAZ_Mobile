import { router, type Href } from 'expo-router';

import { navPerf, setDrillDownFlowReadyListener } from '@/src/utils/navPerf';

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
let inFlightTarget: string | null = null;
let lockTimeoutId: ReturnType<typeof setTimeout> | null = null;
/**
 * Ignore further drill-down pushes until the one we just opened is showing
 * its content, and at least through the burst that follows a stalled thread.
 *
 * The in-flight lock releases on `path_match`, which on these captures is
 * 30–60ms after the press. The screen then stays blank for seconds
 * (`market→section` T3→T4 was 7356ms, api window 8227ms). Presses during
 * that wait each pushed, and the blocked thread painted them all at once.
 * A 600ms window only covers the clump delivered at the unlock.
 *
 * The window opens when the push runs. It lasts until that screen reports
 * `dataReady` (never shorter than the burst floor) or until the reader
 * leaves it for a tab root. The cap is the longest content wait measured.
 */
let pushQuietUntil = 0;
let drillQuietFloorUntil = 0;
let lockIsSingleFlight = false;
const PUSH_BURST_MS = 600;
const PUSH_QUIET_MAX_MS = 8_000;
const DRILL_DOWN_SETTLE_FLOWS = new Set([
  'market→section',
  'product_detail',
  'collection_viewer',
  'create_design',
  'profile_detail',
  'inbox→thread',
  'bag→checkout',
  'tabs→search',
]);
const DRILL_QUIET_CLEAR_PATHS = new Set([
  '/',
  '/discover',
  '/inbox',
  '/charts',
  '/catalog',
  '/me',
  '/market',
]);

function armDrillDownQuiet() {
  const now = Date.now();
  drillQuietFloorUntil = now + PUSH_BURST_MS;
  pushQuietUntil = now + PUSH_QUIET_MAX_MS;
}

function noteDrillDownSettled() {
  if (pushQuietUntil === 0) return;
  const now = Date.now();
  const floor = Math.max(now, drillQuietFloorUntil);
  pushQuietUntil = Math.min(pushQuietUntil, floor);
  if (pushQuietUntil <= now) {
    pushQuietUntil = 0;
    drillQuietFloorUntil = 0;
  }
}

setDrillDownFlowReadyListener((flow) => {
  if (DRILL_DOWN_SETTLE_FLOWS.has(flow)) noteDrillDownSettled();
});
// Failsafe only — a successful navigation releases the lock early via the
// path-match effect in app/(tabs)/_layout.tsx. It must outlast the slowest
// screen mount we ship: under dev/SIT latency heavy screens take 1–2s to
// commit, and the old 1100ms window expired mid-mount, letting a frustrated
// re-tap stack a second copy of the same screen.
const LOCK_TIMEOUT_MS = 2500;

/**
 * Collapse an href into the string used for lock / same-target comparisons.
 *
 * The query string is part of the identity, NOT decoration. Dropping it for
 * string hrefs (while the object branch below carefully sorts and keeps its
 * params) made the two forms disagree: `'/studio?routeKey=store'` normalized to
 * `/studio`, matched the pathname the user was already on, and every Studio dock
 * chip was discarded as "same target" — the dock looked dead. Both branches now
 * produce the same key for the same destination.
 */
function normalizeTarget(href: Href): string {
  if (typeof href === 'string') {
    const [path, query] = href.split('?');
    const base = path || '/';
    if (!query) return base;
    // Sorted so a string href and its object equivalent hash identically.
    const sorted = query.split('&').filter(Boolean).sort().join('&');
    return sorted ? `${base}?${sorted}` : base;
  }
  const p = href as any;
  let base = (p.pathname || '').split('?')[0];
  if (p.params && Object.keys(p.params).length) {
    const sorted = Object.entries(p.params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('&');
    base += `?${sorted}`;
  }
  return base || '/';
}

function clearLock(reason: string) {
  if (lockTimeoutId) {
    clearTimeout(lockTimeoutId);
    lockTimeoutId = null;
  }
  const prev = inFlightTarget;
  inFlightTarget = null;
  lockIsSingleFlight = false;
  if (prev) {
    navPerf.navigation_lock_released?.(prev, reason);
  }
}

export function releaseNavigationLock(reason = 'manual') {
  const landingSingleFlight = reason === 'path_match' && Boolean(inFlightTarget) && lockIsSingleFlight;
  if (reason === 'path_match' && !landingSingleFlight && pushQuietUntil) {
    const path = String((global as { __navCurrentPathname?: string }).__navCurrentPathname || '');
    const norm = path.replace('/(tabs)', '').split('?')[0] || '/';
    if (DRILL_QUIET_CLEAR_PATHS.has(norm)) {
      const now = Date.now();
      if (now >= drillQuietFloorUntil) {
        pushQuietUntil = 0;
        drillQuietFloorUntil = 0;
      } else {
        pushQuietUntil = drillQuietFloorUntil;
      }
    }
  }
  clearLock(reason);
}

export function withNavigationLock<T>(
  href: Href,
  action: () => T,
  opts: { force?: boolean; singleFlight?: boolean } = {},
): T | undefined {
  const target = normalizeTarget(href);
  const current = (global as any).__navCurrentPathname || null;

  if (!opts.force && inFlightTarget === target) {
    navPerf.mark?.('navigation_ignored_duplicate', target);
    return undefined;
  }

  if (current && normalizeTarget(current) === target && !opts.force) {
    navPerf.mark?.('navigation_same_target_ignored', target);
    return undefined;
  }

  if (!opts.force && opts.singleFlight && Date.now() < pushQuietUntil) {
    navPerf.mark?.('navigation_ignored_in_flight', target);
    return undefined;
  }

  if (inFlightTarget && !opts.force && opts.singleFlight) {
    /*
      A push while a push is already in flight is a queued tap, not a decision.

      The JS thread stalls for 327-408ms on a navigation (measured on device),
      and taps that land during the stall sit in the native queue and then all
      dispatch within a few milliseconds of each other once the thread frees.
      Replacing the lock per target meant every one of them pushed: the screen
      looked frozen, then four or five detail screens opened at once and had to
      be dismissed one by one.

      Rejecting while a target is in flight collapses the burst that is already
      queued. Presses that arrive after `path_match` — while the new screen is
      still blank — are rejected by the quiet window armed in `drillDownPush`,
      which stays up until that screen's data is ready.
    */
    navPerf.mark?.('navigation_ignored_in_flight', target);
    return undefined;
  }

  if (inFlightTarget && !opts.force) {
    // replace pending with new different target
    clearLock('replaced');
  }

  inFlightTarget = target;
  lockIsSingleFlight = Boolean(opts.singleFlight);
  navPerf.mark?.('navigation_locked', target);

  if (lockTimeoutId) clearTimeout(lockTimeoutId);
  lockTimeoutId = setTimeout(() => {
    navPerf.navigation_lock_released?.(target, 'timeout');
    inFlightTarget = null;
    lockIsSingleFlight = false;
    lockTimeoutId = null;
  }, LOCK_TIMEOUT_MS);

  try {
    return action();
  } finally {
    // release happens via path match or timeout
  }
}

export function topLevelNavigate(href: Href) {
  const target = normalizeTarget(href);
  const result = withNavigationLock(href, () => {
    navPerf.routeCallStart(undefined, { target });
    navPerf.navigationCalled();
    router.navigate(href as never);
    navPerf.routeCallEnd(undefined, { target });
  });
  return result;
}

/**
 * Open a true drill-down detail screen on top of the current screen.
 *
 * Single-flight: one push at a time, whatever the target. A push stacks a
 * screen that the user must dismiss, so a burst of queued taps must not stack
 * a burst of screens. See the note in `withNavigationLock`.
 */
export function drillDownPush(href: Href) {
  const target = normalizeTarget(href);
  const result = withNavigationLock(href, () => {
    armDrillDownQuiet();
    navPerf.routeCallStart(undefined, { target });
    navPerf.navigationCalled();
    router.push(href as never);
    navPerf.routeCallEnd(undefined, { target });
  }, { singleFlight: true });
  return result;
}

/**
 * Perform a back action. Go back when there is history; otherwise navigate to a
 * safe top-level fallback. Never uses `replace`, which would destroy the
 * fallback's warm state on a subsequent return.
 */
export function backOrNavigate(fallback: Href) {
  const target = normalizeTarget(fallback);
  const result = withNavigationLock(fallback, () => {
    navPerf.routeCallStart(undefined, { target: 'backOrNavigate' });
    navPerf.navigationCalled();
    if (router.canGoBack()) {
      router.back();
      navPerf.routeCallEnd(undefined, { target: 'back' });
      clearLock('back');
      return;
    }
    navPerf.routeCallStart(undefined, { target });
    router.navigate(fallback as never);
    navPerf.routeCallEnd(undefined, { target });
  });
  return result;
}

/**
 * Close a nested flow back to a source screen that should already exist behind
 * it (e.g. create-design → catalogue). Falls back to `navigate` when
 * `dismissTo` is unavailable so the call can never crash.
 */
export function dismissToSource(href: Href) {
  const target = normalizeTarget(href);
  const result = withNavigationLock(href, () => {
    navPerf.routeCallStart(undefined, { target });
    navPerf.navigationCalled();
    const dismissTo = (router as unknown as { dismissTo?: (href: never) => void }).dismissTo;
    if (typeof dismissTo === 'function') {
      dismissTo.call(router, href as never);
      navPerf.routeCallEnd(undefined, { target });
      clearLock('dismiss');
      return;
    }
    router.navigate(href as never);
    navPerf.routeCallEnd(undefined, { target });
  });
  return result;
}
