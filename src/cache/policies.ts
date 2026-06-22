import {
  THREADLY_CATEGORY_FILTER_STALE_TIME_MS,
  THREADLY_COUNT_STALE_TIME_MS,
  THREADLY_QUERY_GC_TIME_MS,
  THREADLY_QUERY_STALE_TIME_MS,
  THREADLY_SAVED_STATUS_STALE_TIME_MS,
} from '@/src/query/queryClient';

export type CachePolicy = {
  ttl: number;
  staleWhileRevalidate?: boolean;
  persist?: boolean;
  gcTime?: number;
  retry?: boolean | number;
};

export const cachePolicies = {
  defaultQuery: {
    ttl: THREADLY_QUERY_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: true,
    gcTime: THREADLY_QUERY_GC_TIME_MS,
    retry: 1,
  },
  count: {
    ttl: THREADLY_COUNT_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: false,
    gcTime: THREADLY_QUERY_STALE_TIME_MS,
    retry: 1,
  },
  savedStatus: {
    ttl: THREADLY_SAVED_STATUS_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: false,
    gcTime: THREADLY_QUERY_STALE_TIME_MS,
    retry: 1,
  },
  categoryMetadata: {
    ttl: THREADLY_CATEGORY_FILTER_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: true,
    gcTime: THREADLY_QUERY_GC_TIME_MS,
    retry: 1,
  },
  interactionStatus: {
    ttl: 8 * 1000,
    staleWhileRevalidate: true,
    persist: false,
    gcTime: 60 * 1000,
    retry: false,
  },
} satisfies Record<string, CachePolicy>;
