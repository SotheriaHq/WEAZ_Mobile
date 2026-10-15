import type { StudioRouteKey, StudioRouteParams } from '@/src/features/studio/studioRoutes';

/**
 * In-place Studio navigation, without going through Expo Router.
 *
 * Island chips used `router.navigate({ pathname: '/studio', params })`. That
 * waits a React commit + the WebView screen's effect before the WebView even
 * hears about the tap. When the SPA bridge was not yet on `window`, the
 * injected script fell through to `location.assign` — a full document reload
 * (HTML + JS bundle + React mount + every query). That is the 3–5s "nothing
 * is happening" stall on every Studio dock tap, including mashed re-taps
 * which restarted the reload.
 *
 * The WebView screen registers the real injector here. The island calls it
 * on press-in so the SPA route change starts in the same turn as the chip
 * highlight. Expo Router `setParams` only updates native chrome (title / active
 * chip) and must never be what starts the web navigation.
 */
type StudioInPlaceHandler = (
  routeKey: StudioRouteKey,
  params?: StudioRouteParams,
) => boolean;

let handler: StudioInPlaceHandler | null = null;

export function registerStudioInPlaceHandler(next: StudioInPlaceHandler | null): void {
  handler = next;
}

export function requestStudioInPlaceNav(
  routeKey: StudioRouteKey,
  params?: StudioRouteParams,
): boolean {
  if (!handler) return false;
  return handler(routeKey, params);
}

export function isStudioInPlaceNavReady(): boolean {
  return handler != null;
}
