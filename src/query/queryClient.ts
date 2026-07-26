import { QueryClient } from '@tanstack/react-query';

export const WIEZ_QUERY_STALE_TIME_MS = 3 * 60 * 1000;
export const WIEZ_QUERY_GC_TIME_MS = 30 * 60 * 1000;
export const WIEZ_COUNT_STALE_TIME_MS = 30 * 1000;
export const WIEZ_SAVED_STATUS_STALE_TIME_MS = 60 * 1000;
export const WIEZ_CATEGORY_FILTER_STALE_TIME_MS = 30 * 60 * 1000;
export const WIEZ_QUERY_CACHE_MAX_ENTRIES = 200;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: WIEZ_QUERY_STALE_TIME_MS,
      gcTime: WIEZ_QUERY_GC_TIME_MS,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
