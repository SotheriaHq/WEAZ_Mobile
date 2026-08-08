import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { cachePolicies, type CachePolicy } from '@/src/cache/policies';
import {
  queryClient as defaultQueryClient,
  WIEZ_QUERY_CACHE_MAX_ENTRIES,
} from '@/src/query/queryClient';

type CachedFetcher<T> = (context: { signal?: AbortSignal }) => Promise<T>;

type CachedQueryOptions<T> = {
  key: QueryKey;
  fetcher: CachedFetcher<T>;
  policy?: CachePolicy;
  client?: QueryClient;
  forceRefresh?: boolean;
  backgroundRefresh?: boolean;
  onBackgroundData?: (data: T) => void;
};

type UseCachedQueryOptions<T> = CachedQueryOptions<T> & {
  enabled?: boolean;
  cancelOnUnmount?: boolean;
};

type CachedRequest = {
  promise: Promise<unknown>;
  controller: AbortController;
};

const inFlightByKey = new Map<string, CachedRequest>();

export function queryKeyToCacheKey(key: QueryKey): string {
  return JSON.stringify(key);
}

export function getCachedQueryAgeMs(
  key: QueryKey,
  client: QueryClient = defaultQueryClient,
): number | null {
  const updatedAt = client.getQueryState(key)?.dataUpdatedAt ?? 0;
  return updatedAt > 0 ? Date.now() - updatedAt : null;
}

export function isCachedQueryFresh(
  key: QueryKey,
  policy: CachePolicy = cachePolicies.defaultQuery,
  client: QueryClient = defaultQueryClient,
) {
  // An invalidated entry is never fresh, whatever its age. invalidateQueries
  // sets state.isInvalidated but leaves dataUpdatedAt untouched, so an age-only
  // check reported "fresh" for data we had explicitly declared stale — and the
  // read paths below then served it until the TTL elapsed. That silently made
  // every invalidation from this layer a no-op, including invalidateCache and
  // invalidateByPrefix, which pass refetchType: 'none' precisely because they
  // expect this function to force the revalidation on the next read.
  const state = client.getQueryState(key);
  if (!state || state.isInvalidated) return false;
  const ageMs = getCachedQueryAgeMs(key, client);
  return typeof ageMs === 'number' && ageMs <= policy.ttl;
}

async function runCachedQueryRequest<T>({
  key,
  fetcher,
  policy = cachePolicies.defaultQuery,
  client = defaultQueryClient,
  forceRefresh = false,
}: Omit<CachedQueryOptions<T>, 'backgroundRefresh' | 'onBackgroundData'>): Promise<T> {
  const requestKey = queryKeyToCacheKey(key);
  const inFlight = inFlightByKey.get(requestKey);
  if (inFlight) {
    return inFlight.promise as Promise<T>;
  }

  const controller = new AbortController();
  const promise = (forceRefresh
    ? fetcher({ signal: controller.signal }).then((data) => {
        client.setQueryData(key, data);
        return data;
      })
    : client.fetchQuery<T>({
        queryKey: key,
        queryFn: ({ signal }) => fetcher({ signal: signal ?? controller.signal }),
        staleTime: policy.ttl,
        gcTime: policy.gcTime,
        retry: policy.retry,
      })
  ).finally(() => {
    if (inFlightByKey.get(requestKey)?.promise === promise) {
      inFlightByKey.delete(requestKey);
    }
  });

  inFlightByKey.set(requestKey, { promise, controller });
  return promise;
}

export async function revalidateCachedQuery<T>(options: CachedQueryOptions<T>): Promise<T> {
  const { key, policy = cachePolicies.defaultQuery, client = defaultQueryClient, forceRefresh = false } = options;
  const cached = client.getQueryData<T>(key);

  if (!forceRefresh && cached !== undefined && isCachedQueryFresh(key, policy, client)) {
    return cached;
  }

  try {
    return await runCachedQueryRequest({ ...options, policy, client, forceRefresh });
  } catch (error) {
    if (cached !== undefined) return cached;
    throw error;
  }
}

export async function getCachedQuery<T>(options: CachedQueryOptions<T>): Promise<T> {
  const {
    key,
    policy = cachePolicies.defaultQuery,
    client = defaultQueryClient,
    forceRefresh = false,
    backgroundRefresh = true,
    onBackgroundData,
  } = options;
  const cached = client.getQueryData<T>(key);

  if (!forceRefresh && cached !== undefined) {
    if (isCachedQueryFresh(key, policy, client)) {
      return cached;
    }

    if (policy.staleWhileRevalidate !== false) {
      if (backgroundRefresh) {
        void revalidateCachedQuery({ ...options, policy, client })
          .then((data) => onBackgroundData?.(data))
          .catch(() => undefined);
      }
      return cached;
    }
  }

  return revalidateCachedQuery({ ...options, policy, client, forceRefresh });
}

export function preloadQuery<T>(options: CachedQueryOptions<T>): Promise<T> {
  return revalidateCachedQuery({ ...options, backgroundRefresh: true });
}

export async function invalidateCache(
  key: QueryKey,
  client: QueryClient = defaultQueryClient,
) {
  await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
}

export async function invalidateByPrefix(
  prefix: string | QueryKey,
  client: QueryClient = defaultQueryClient,
) {
  const serializedPrefix = typeof prefix === 'string' ? prefix : queryKeyToCacheKey(prefix);
  const arrayPrefix = Array.isArray(prefix) ? prefix : null;

  await client.invalidateQueries({
    refetchType: 'none',
    predicate: (query) => {
      if (arrayPrefix) {
        return arrayPrefix.every((part, index) => query.queryKey[index] === part);
      }
      return queryKeyToCacheKey(query.queryKey).startsWith(serializedPrefix);
    },
  });
}

export function cancelCachedQuery(
  key: QueryKey,
  client: QueryClient = defaultQueryClient,
) {
  const requestKey = queryKeyToCacheKey(key);
  const inFlight = inFlightByKey.get(requestKey);
  inFlight?.controller.abort();
  inFlightByKey.delete(requestKey);
  void client.cancelQueries({ queryKey: key, exact: true });
}

export function enforceCachedQueryBudget(
  client: QueryClient = defaultQueryClient,
  maxEntries = WIEZ_QUERY_CACHE_MAX_ENTRIES,
) {
  const queries = client.getQueryCache().findAll();
  if (queries.length <= maxEntries) return;

  const removable = queries
    .filter((query) => query.getObserversCount() === 0)
    .sort((a, b) => (a.state.dataUpdatedAt || 0) - (b.state.dataUpdatedAt || 0));

  const removeCount = Math.min(queries.length - maxEntries, removable.length);
  removable.slice(0, removeCount).forEach((query) => {
    client.removeQueries({ queryKey: query.queryKey, exact: true });
  });
}

export function useCachedQuery<T>({
  key,
  fetcher,
  policy = cachePolicies.defaultQuery,
  client = defaultQueryClient,
  enabled = true,
  cancelOnUnmount = false,
  forceRefresh = false,
}: UseCachedQueryOptions<T>) {
  const cacheKey = useMemo(() => queryKeyToCacheKey(key), [key]);
  const stableKey = useMemo(() => key, [cacheKey]);
  const fetcherRef = useRef(fetcher);
  const [data, setData] = useState<T | undefined>(() => client.getQueryData<T>(stableKey));
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(() => enabled && data === undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refetch = useCallback(
    async (nextOptions?: { forceRefresh?: boolean }) => {
      const shouldForce = nextOptions?.forceRefresh ?? forceRefresh;
      const cached = client.getQueryData<T>(stableKey);
      if (cached !== undefined && !shouldForce) {
        setData(cached);
      }
      setIsLoading(cached === undefined);
      setIsRefreshing(cached !== undefined);
      setError(null);

      try {
        const nextData = await revalidateCachedQuery<T>({
          key: stableKey,
          fetcher: (context) => fetcherRef.current(context),
          policy,
          client,
          forceRefresh: shouldForce,
        });
        setData(nextData);
        return nextData;
      } catch (caught) {
        const nextError = caught instanceof Error ? caught : new Error('Request failed');
        setError(nextError);
        throw nextError;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [client, forceRefresh, policy, stableKey],
  );

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsRefreshing(false);
      return undefined;
    }

    let cancelled = false;
    const cached = client.getQueryData<T>(stableKey);
    // Assign unconditionally, including `undefined`. The miss branch used to
    // leave `data` untouched, so when the key changed to something uncached
    // (opening a second brand, switching profile tabs) the screen kept
    // rendering the PREVIOUS key's rows underneath the loading flag and then
    // swapped them out when the fetch landed — wrong content first, then a jump.
    setData(cached);
    setIsLoading(cached === undefined);

    const shouldRevalidate =
      forceRefresh ||
      cached === undefined ||
      !isCachedQueryFresh(stableKey, policy, client);

    if (shouldRevalidate) {
      setIsRefreshing(cached !== undefined);
      void getCachedQuery<T>({
        key: stableKey,
        fetcher: (context) => fetcherRef.current(context),
        policy,
        client,
        forceRefresh,
        onBackgroundData: (nextData) => {
          if (!cancelled) setData(nextData);
        },
      })
        .then((nextData) => {
          if (!cancelled) {
            setData(nextData);
            setError(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught : new Error('Request failed'));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });
    }

    return () => {
      cancelled = true;
      if (cancelOnUnmount) {
        cancelCachedQuery(stableKey, client);
      }
    };
  }, [cancelOnUnmount, client, enabled, forceRefresh, policy, stableKey]);

  // Optimistic local mutation that also writes through to the query cache so
  // sibling readers and later revalidations start from the updated value.
  const mutate = useCallback(
    (updater: T | ((current: T | undefined) => T)) => {
      const next =
        typeof updater === 'function'
          ? (updater as (current: T | undefined) => T)(client.getQueryData<T>(stableKey))
          : updater;
      client.setQueryData(stableKey, next);
      setData(next);
      return next;
    },
    [client, stableKey],
  );

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refetch,
    mutate,
  };
}
