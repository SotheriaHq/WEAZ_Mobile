import { QueryClient } from '@tanstack/react-query';

export const THREADLY_QUERY_STALE_TIME_MS = 3 * 60 * 1000;
export const THREADLY_QUERY_GC_TIME_MS = 30 * 60 * 1000;
export const THREADLY_COUNT_STALE_TIME_MS = 30 * 1000;
export const THREADLY_SAVED_STATUS_STALE_TIME_MS = 60 * 1000;
export const THREADLY_CATEGORY_FILTER_STALE_TIME_MS = 30 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: THREADLY_QUERY_STALE_TIME_MS,
      gcTime: THREADLY_QUERY_GC_TIME_MS,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
