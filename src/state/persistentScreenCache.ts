/**
 * Last-known screen content, kept across app restarts.
 *
 * `screenWarmState` is an in-memory `Map`, so it is empty on every cold start.
 * That is the whole of the "I routed to my profile and all my tabs were empty"
 * report: the screen had nothing to show and could only wait on the network.
 * The NAV_PERF trace says it plainly — `cache_miss` at mount, `data_ready` four
 * and a half seconds later, with nothing on screen in between.
 *
 * Instagram and Facebook do not fetch faster than we do. They render the last
 * thing they knew, immediately, and reconcile behind it. This is that: the
 * profile snapshot is written through to disk, primed back into the warm map
 * during boot, and the screen opens on real content while the refresh runs.
 *
 * Deliberately a small, explicit allow-list rather than persistence for every
 * warm key. Most warm state is cheap to refetch and would only cost disk I/O at
 * boot; this is for the handful of screens where an empty first frame is the
 * difference between "fast" and "broken".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { perfEnabled, perfNote } from '@/src/perf/wiezPerf';

import { readWarmScreenState, writeWarmScreenState } from './screenWarmState';

const primeNow: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

const STORAGE_PREFIX = 'warm:v1:';

/** How long to sit on a write, so a burst of setState does not thrash disk. */
const WRITE_DEBOUNCE_MS = 400;

const pendingWrites = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

async function flushPendingWrites(): Promise<void> {
  flushTimer = null;
  if (pendingWrites.size === 0) return;

  const entries = [...pendingWrites.entries()];
  pendingWrites.clear();

  try {
    await AsyncStorage.multiSet(
      entries.map(([key, value]) => [storageKey(key), JSON.stringify(value)]),
    );
  } catch {
    // A cache that cannot write is still a working app. Never surface this.
  }
}

/**
 * Write through to the warm map AND to disk.
 *
 * The in-memory write is synchronous so the current session behaves exactly as
 * before; the disk write is debounced and best-effort.
 */
export function persistScreenState<T>(key: string, value: T): void {
  writeWarmScreenState(key, value);
  pendingWrites.set(key, value);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushPendingWrites();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Load every persisted snapshot back into the warm map.
 *
 * Call once during boot, before the shopper can reach a tab. Anything already
 * in memory wins — a fresh fetch from this session must never be overwritten by
 * a snapshot from the last one.
 */
export async function primePersistentScreenCache(): Promise<void> {
  const startedAt = perfEnabled() ? primeNow() : 0;
  try {
    /*
      Two awaits, and both are on the measured path for a shopper who reaches a
      tab early. `getAllKeys` scans the whole AsyncStorage keyspace — not just
      this prefix — so its cost grows with everything else the app has ever
      stored, including the single large blob the React Query persister keeps.
      Nothing waits for this to finish, which is the right call, but it does
      mean a fast tap can beat it; the two marks say whether it did.
    */
    perfNote('BOOT', 'warm_cache_prime_began');
    const keys = await AsyncStorage.getAllKeys();
    const warmKeys = keys.filter((key) => key.startsWith(STORAGE_PREFIX));
    if (warmKeys.length === 0) {
      perfNote('BOOT', 'warm_cache_prime_finished', 'entries=0');
      return;
    }

    const entries = await AsyncStorage.multiGet(warmKeys);
    if (perfEnabled()) {
      perfNote(
        'BOOT',
        'warm_cache_prime_finished',
        `entries=${warmKeys.length} totalKeys=${keys.length}` +
          ` ms=${(primeNow() - startedAt).toFixed(1)}`,
      );
    }
    entries.forEach(([storedKey, raw]) => {
      if (!raw) return;
      const key = storedKey.slice(STORAGE_PREFIX.length);
      if (readWarmScreenState(key) != null) return;
      try {
        writeWarmScreenState(key, JSON.parse(raw));
      } catch {
        // A snapshot written by an older build whose shape has since changed.
        // Dropping it costs one load; letting it through would render garbage.
      }
    });
  } catch {
    // Boot must not depend on this succeeding.
  }
}

/** Forget everything. For sign-out: one account's content is not another's. */
export async function clearPersistentScreenCache(): Promise<void> {
  pendingWrites.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const warmKeys = keys.filter((key) => key.startsWith(STORAGE_PREFIX));
    if (warmKeys.length > 0) await AsyncStorage.multiRemove(warmKeys);
  } catch {
    // Best effort.
  }
}
