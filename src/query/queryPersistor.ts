import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';

import { isPersistableThreadlyQueryKey } from '@/src/query/queryKeys';

export const THREADLY_QUERY_CACHE_BUSTER = 'threadly-mobile-phase2-v1';
export const THREADLY_QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

export const threadlyQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'THREADLY_QUERY_CACHE_V1',
  throttleTime: 1000,
});

export const shouldDehydrateThreadlyQuery = (query: { queryKey: readonly unknown[] }) =>
  defaultShouldDehydrateQuery(query as Parameters<typeof defaultShouldDehydrateQuery>[0]) &&
  isPersistableThreadlyQueryKey(query.queryKey);
