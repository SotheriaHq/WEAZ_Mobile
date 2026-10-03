/**
 * Whether the app is rendering without Inter — and a way to stop doing so.
 *
 * This was a bare module-level `let`, written once by the splash path and read
 * during render by every `AppText`. Nothing subscribed to it, so nothing
 * re-rendered when it changed. That is a latch, and it is the bug behind
 * "the fonts in the entire native app are flat and dull":
 *
 *   1. Boot starts a 3s timer and `useFonts` at the same moment.
 *   2. In dev, each .ttf is fetched over the Metro dev server. Six faces on a
 *      LAN routinely take longer than 3s, so the timer wins.
 *   3. `setFontFallbackMode(true)` latches, the app renders, and `AppText`
 *      drops `fontFamily` so Android resolves the DEVICE's default typeface.
 *   4. Inter finishes loading a second later. `usingFontFallback` flips back to
 *      false — and no component re-renders, because a plain `let` schedules
 *      nothing. The whole session stays on the system font.
 *
 * Step 4 is why this looked like a design problem rather than a loading one. On
 * a phone whose owner has picked a handwriting system font, every screen in the
 * app renders in that face, and no amount of tuning the type scale touches it.
 *
 * So: a store with subscribers, read through `useSyncExternalStore`. Fallback
 * becomes what it was always meant to be — a brief degraded state the app
 * recovers from — instead of a one-way door.
 */

let fallbackMode = false;

const listeners = new Set<() => void>();

export function setFontFallbackMode(locked: boolean) {
  if (fallbackMode === locked) return;
  fallbackMode = locked;
  // Copy before iterating: a subscriber may unsubscribe inside its own callback.
  [...listeners].forEach((listener) => listener());
}

export function getFontFallbackMode(): boolean {
  return fallbackMode;
}

export function subscribeToFontMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Kept so existing non-render callers (and tests) still read the live value.
 * Render paths must use `getFontFallbackMode` via `useSyncExternalStore`, or
 * they re-introduce the latch this module exists to remove.
 */
export function isFontFallbackModeNow(): boolean {
  return fallbackMode;
}
