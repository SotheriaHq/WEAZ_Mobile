import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Warm entry into Studio.
 *
 * Studio is a WebView. Once it has booted it stays alive across tabs (the tab
 * navigator keeps it attached), so every return is instant. The FIRST entry
 * after the app starts is the slow one: a handoff request, then the web app
 * boots inside the WebView — measured 2026-11-09 at ~5s of splash before the
 * dashboard, and Android reclaiming the app overnight puts every brand back
 * on that path.
 *
 * So the tab shell boots Studio hidden, ahead of the tap, for a brand who is
 * likely to open it:
 *  - they opened Studio within the last two weeks (a brand that never uses it
 *    is not charged a browser engine and a handoff every session);
 *  - they are on their own profile, where the Studio entry lives, not on the
 *    Runway, whose feed must keep the JavaScript thread and memory;
 *  - their store setup is complete (an incomplete store is redirected to setup
 *    and must never be warmed into it behind the user's back);
 *  - they have stayed there a moment, so passing through does not trigger it.
 */

export const STUDIO_WARM_RECENT_MS = 14 * 24 * 60 * 60 * 1000;
export const STUDIO_WARM_DELAY_MS = 1_200;
/** Writes are throttled: one timestamp an hour is plenty for a two-week window. */
const MARK_THROTTLE_MS = 60 * 60 * 1000;

const keyFor = (userId: string) => `wiez.studio.lastOpenedAt.v1:${userId}`;
const lastMarkedAt = new Map<string, number>();

export function isRecentStudioOpen(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false;
  const openedAt = Number(raw);
  if (!Number.isFinite(openedAt) || openedAt <= 0) return false;
  // A clock moved backwards still counts as recent rather than never.
  return now - openedAt <= STUDIO_WARM_RECENT_MS;
}

export type StudioWarmInputs = {
  authenticated: boolean;
  isBrand: boolean;
  hasBrandWorkspace: boolean;
  storeSetupComplete: boolean | null;
  pathname: string;
  alreadyWarmed: boolean;
};

/** The surface Studio is opened from: the brand's own profile. */
export const STUDIO_WARM_SURFACES: ReadonlySet<string> = new Set(['/catalog']);

export function shouldConsiderStudioWarm(inputs: StudioWarmInputs): boolean {
  return (
    inputs.authenticated &&
    inputs.isBrand &&
    inputs.hasBrandWorkspace &&
    inputs.storeSetupComplete === true &&
    STUDIO_WARM_SURFACES.has(inputs.pathname) &&
    !inputs.alreadyWarmed
  );
}

export async function markStudioOpened(userId: string | null | undefined, now = Date.now()): Promise<void> {
  if (!userId) return;
  const previous = lastMarkedAt.get(userId) ?? 0;
  if (now - previous < MARK_THROTTLE_MS) return;
  lastMarkedAt.set(userId, now);
  try {
    await AsyncStorage.setItem(keyFor(userId), String(now));
  } catch {
    // A missed mark only costs one cold entry later.
  }
}

export async function wasStudioOpenedRecently(
  userId: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!userId) return false;
  try {
    return isRecentStudioOpen(await AsyncStorage.getItem(keyFor(userId)), now);
  } catch {
    return false;
  }
}
