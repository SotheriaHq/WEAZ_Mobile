import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function getCachedDeviceId(): string | null {
  return cached;
}

export async function getDeviceId(): Promise<string | null> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    try {
      const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) {
        cached = existing;
        return cached;
      }
      const created = createId();
      await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
      cached = created;
      return cached;
    } catch {
      // Storage unavailable. Returning null rather than a fresh per-call id is
      // deliberate: a new id every request would defeat dedupe and inflate
      // every count.
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}
