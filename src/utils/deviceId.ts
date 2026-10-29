import AsyncStorage from '@react-native-async-storage/async-storage';

import { analyticsPermitted } from '@/src/privacy/consent';

/**
 * A durable, locally generated id for this install.
 *
 * Survives sign-out, sign-in and app restarts, which is exactly the property
 * view counting needs: the same person viewing an item signed out and then
 * signed in must not be counted twice. It identifies an install, never a
 * person, and the server treats it as untrusted input used only to suppress a
 * count — it grants no authority.
 *
 * Deliberate twin of `fthreadly/src/utils/deviceId.ts`. Separate repos, so
 * change both or the two clients start disagreeing about who a viewer is.
 * Like the web id it is analytics, so it exists only while the person allows
 * analytics; without it the server simply does not dedupe their views.
 */
export const DEVICE_ID_STORAGE_KEY = 'wiez.device.id.v1';

export const WIEZ_DEVICE_ID_HEADER = 'x-wiez-device-id';

const createId = () =>
  `anon_${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

/**
 * Cached after the first read so the request interceptor is not paying an
 * AsyncStorage round trip on every call.
 */
let cached: string | null = null;
let loading: Promise<string | null> | null = null;
/** Bumped by `clearDeviceId`, so a read already in flight cannot restore the id. */
let generation = 0;

export function getCachedDeviceId(): string | null {
  return analyticsPermitted() ? cached : null;
}

export async function getDeviceId(): Promise<string | null> {
  if (!analyticsPermitted()) return null;
  if (cached) return cached;
  if (loading) return loading;

  const startedIn = generation;
  loading = (async () => {
    try {
      let id = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (!id) {
        id = createId();
        await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
      }
      if (startedIn !== generation) {
        await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
        return null;
      }
      cached = id;
      return cached;
    } catch {
      // Storage unavailable. Returning null rather than a fresh per-call id is
      // deliberate: a new id every request would defeat dedupe and inflate
      // every count.
      return null;
    } finally {
      // A newer read may have started after a clear; leave it in place.
      if (startedIn === generation) loading = null;
    }
  })();

  return loading;
}

/** Forget the id when analytics are turned off; a later "allow" starts a new one. */
export async function clearDeviceId(): Promise<void> {
  generation += 1;
  cached = null;
  loading = null;
  await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY).catch(() => undefined);
}
