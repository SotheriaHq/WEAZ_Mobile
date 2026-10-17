import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type QueryClient } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { AppState } from 'react-native';

import { isPersistableWiezQueryKey } from '@/src/query/queryKeys';

export const WIEZ_QUERY_CACHE_BUSTER = 'WIEZ-mobile-phase2-v1';
// 24h, matching the catalogue content gcTime (queryClient.ts). At 30 minutes
// any app reopened after a break restored nothing and started cold.
export const WIEZ_QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const WIEZ_QUERY_CACHE_STORAGE_KEY = 'WIEZ_QUERY_CACHE_V1';

export const wiezQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: WIEZ_QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

/**
 * When the cache is written to disk — and, more importantly, when it is NOT.
 *
 * The stock `PersistQueryClientProvider` subscribes to the query cache and,
 * on EVERY added/removed/updated event, runs `dehydrate()` over the whole
 * cache synchronously; only the write after it is throttled, to once a
 * second, and that write is a `JSON.stringify` of every persisted list. A
 * single screen load is dozens of events (each media URL query alone is
 * three), so the JS thread rebuilt the snapshot dozens of times and
 * serialized megabytes every second for as long as data kept arriving —
 * exactly while the user was tapping. That is the 400-840ms "unattributed"
 * block on the 2026-10-17 capture: work outside any React commit, landing on
 * every tab switch and right after sign-in, when everything refetches.
 *
 * Now a cache event only marks the snapshot dirty (O(1), persistable roots
 * only). The snapshot is built and written once the cache has been quiet for
 * PERSIST_QUIET_MS, or immediately when the app goes to the background — the
 * one moment serializing costs the user nothing, and the moment before Android
 * may kill the process. A crash loses at most the last quiet window, and the
 * cache is a speed-up, never a source of truth.
 */
const PERSIST_QUIET_MS = 20_000;

let persistDirty = false;
let lastPersistableChangeAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingQueryPersist() {
  persistDirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

export function subscribeWiezQueryPersistence(client: QueryClient): () => void {
  const flush = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!persistDirty) return;
    persistDirty = false;
    void persistQueryClientSave({
      queryClient: client,
      persister: wiezQueryPersister,
      buster: WIEZ_QUERY_CACHE_BUSTER,
      dehydrateOptions: { shouldDehydrateQuery: shouldDehydrateWiezQuery },
    }).catch(() => undefined);
  };

  const flushWhenQuiet = () => {
    persistTimer = null;
    if (!persistDirty) return;
    const quietFor = Date.now() - lastPersistableChangeAt;
    if (quietFor < PERSIST_QUIET_MS) {
      persistTimer = setTimeout(flushWhenQuiet, PERSIST_QUIET_MS - quietFor);
      return;
    }
    flush();
  };

  const unsubscribeCache = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'added' && event.type !== 'removed' && event.type !== 'updated') return;
    if (!isPersistableWiezQueryKey(event.query.queryKey)) return;
    persistDirty = true;
    lastPersistableChangeAt = Date.now();
    if (!persistTimer) persistTimer = setTimeout(flushWhenQuiet, PERSIST_QUIET_MS);
  });

  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') flush();
  });

  return () => {
    unsubscribeCache();
    appState.remove();
    cancelPendingQueryPersist();
  };
}

export async function purgeMobilePersistedQueryCache(): Promise<void> {
  // A save queued before logout must not write the old session back to disk.
  cancelPendingQueryPersist();
  try {
    await wiezQueryPersister.removeClient?.();
  } catch {
    // Query cache cleanup must not block logout.
  }

  try {
    await AsyncStorage.removeItem(WIEZ_QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable or full on mobile devices.
  }
}

export const shouldDehydrateWiezQuery = (query: { queryKey: readonly unknown[] }) =>
  defaultShouldDehydrateQuery(query as Parameters<typeof defaultShouldDehydrateQuery>[0]) &&
  isPersistableWiezQueryKey(query.queryKey);
