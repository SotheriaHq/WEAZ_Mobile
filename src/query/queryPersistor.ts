import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';

import { isPersistableWiezQueryKey } from '@/src/query/queryKeys';

export const WIEZ_QUERY_CACHE_BUSTER = 'WIEZ-mobile-phase2-v1';
export const WIEZ_QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
export const WIEZ_QUERY_CACHE_STORAGE_KEY = 'WIEZ_QUERY_CACHE_V1';

export const wiezQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: WIEZ_QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

export async function purgeMobilePersistedQueryCache(): Promise<void> {
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
