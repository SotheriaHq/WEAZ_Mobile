import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * Where the person was when the app went to the background.
 *
 * Android kills backgrounded apps under memory pressure — on the SIT test phone
 * it happened every single time the person switched to Gmail — and a revived
 * app cold-starts on the Runway. Every other app on the phone puts you back
 * where you were; this is the app-level half of that contract (the other half,
 * state inside a screen, belongs to each screen).
 */
const SNAPSHOT_KEY = 'wiez.route-snapshot.v1';

/**
 * Past this, a launch is a new visit rather than a return to an interrupted
 * one, and starting at home is the expected behaviour.
 */
export const ROUTE_RESTORE_MAX_AGE_MS = 30 * 60 * 1000;

export type RouteSnapshot = { href: string; userId: string | null; savedAt: number; build?: string | null };

/**
 * The build that wrote a snapshot. A route saved by one build only means
 * something to the same build: an update can rename, move or remove a screen,
 * and restoring a path the new build does not have lands on "This screen
 * doesn't exist" (reported right after installing an update).
 *
 * Preview APKs all ship as versionCode 1 / 1.0.0, so the version alone cannot
 * tell two builds apart; CI stamps the commit into EXPO_PUBLIC_BUILD_SHA.
 * `process.env.EXPO_PUBLIC_*` is only inlined when read with a literal key.
 */
export function currentBuildId(): string {
  const version =
    (Constants as { nativeApplicationVersion?: string | null }).nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    'unknown';
  const sha = process.env.EXPO_PUBLIC_BUILD_SHA || 'local';
  return `${version}+${sha}`;
}

const NEVER_RESTORE: RegExp[] = [
  /^\/$/, // where a cold start lands anyway
  /^\/index$/, // the same Runway root, as the island's tab jump reports it
  /^\/oauthredirect/, // a spent Google callback
  /^\/(verify-email|reset-password)(\/|$)/, // single-use tokens
  /^\/(checkout|payment)(\/|$)/, // never drop someone back into a charge in flight
  /^\/modal(\/|$)/,
  /^\/\+not-found/,
  /^\/_sitemap/,
];

/** Query keys that must never be written to storage. */
const SENSITIVE_PARAM = /token|code|secret|password|reference|otp/i;

export function buildRestorableHref(
  pathname: string | null | undefined,
  params: Record<string, string | string[] | undefined>,
): string | null {
  if (!pathname || NEVER_RESTORE.some((pattern) => pattern.test(pathname))) {
    return null;
  }

  // Dynamic segments (`/orders/[orderId]`) are already in the pathname; repeating
  // them as query params would only produce a different-looking URL.
  const segments = new Set(
    pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      }),
  );

  const query = Object.entries(params)
    .flatMap(([key, raw]) => {
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value == null || value === '' || segments.has(String(value)) || SENSITIVE_PARAM.test(key)) {
        return [];
      }
      return [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`];
    })
    .join('&');

  return query ? `${pathname}?${query}` : pathname;
}

export async function saveRouteSnapshot(snapshot: RouteSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Best effort: the worst case is today's behaviour, starting at home.
  }
}

export async function clearRouteSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Read AND delete. Consuming it before navigating means a screen that crashes
 * on restore cannot trap the app in a restore → crash → restore loop.
 */
export async function takeRouteSnapshot(build: string = currentBuildId()): Promise<RouteSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(SNAPSHOT_KEY);
    const parsed = JSON.parse(raw) as Partial<RouteSnapshot>;
    if (typeof parsed.href !== 'string' || typeof parsed.savedAt !== 'number') return null;
    // Written by another build (or one that predates this check): its route
    // may not exist here. Starting at home is always valid.
    if (parsed.build !== build) return null;
    return {
      href: parsed.href,
      savedAt: parsed.savedAt,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      build: parsed.build,
    };
  } catch {
    return null;
  }
}
