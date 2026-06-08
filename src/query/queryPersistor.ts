import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';

import { isPersistableThreadlyQueryKey } from '@/src/query/queryKeys';

export const THREADLY_QUERY_CACHE_BUSTER = 'Threadly-mobile-phase2-v1';
export const THREADLY_QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
export const THREADLY_QUERY_CACHE_STORAGE_KEY = 'THREADLY_QUERY_CACHE_V1';

export const threadlyQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: THREADLY_QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

export async function purgeMobilePersistedQueryCache(): Promise<void> {
  try {
    await threadlyQueryPersister.removeClient?.();
  } catch {
    // Query cache cleanup must not block logout.
  }

  try {
    await AsyncStorage.removeItem(THREADLY_QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable or full on mobile devices.
  }
}

export const shouldDehydrateThreadlyQuery = (query: { queryKey: readonly unknown[] }) =>
  defaultShouldDehydrateQuery(query as Parameters<typeof defaultShouldDehydrateQuery>[0]) &&
  isPersistableThreadlyQueryKey(query.queryKey);
