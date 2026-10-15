import {
  WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
  WIEZ_COUNT_STALE_TIME_MS,
  WIEZ_QUERY_GC_TIME_MS,
  WIEZ_QUERY_STALE_TIME_MS,
  WIEZ_SAVED_STATUS_STALE_TIME_MS,
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
    ttl: WIEZ_QUERY_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: true,
    gcTime: WIEZ_QUERY_GC_TIME_MS,
    retry: 1,
  },
  count: {
    ttl: WIEZ_COUNT_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: false,
    gcTime: WIEZ_QUERY_STALE_TIME_MS,
    retry: 1,
  },
  savedStatus: {
    ttl: WIEZ_SAVED_STATUS_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: false,
    gcTime: WIEZ_QUERY_STALE_TIME_MS,
    retry: 1,
  },
  categoryMetadata: {
    ttl: WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
    staleWhileRevalidate: true,
    persist: true,
    gcTime: WIEZ_QUERY_GC_TIME_MS,
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
