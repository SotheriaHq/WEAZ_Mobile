import { QueryClient } from '@tanstack/react-query';

import { replaceEqualDeepPreservingSignedUrls } from '@/src/query/structuralSharing';

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
      // Perf policy: merely being STALE must not trigger a refetch on mount —
      // staleTime governs, and screens remount constantly on a tab navigator.
      //
      // But a query that was explicitly INVALIDATED must refetch, or
      // invalidateQueries means nothing. A plain `false` suppressed both cases,
      // and that is what made freshly created content invisible: the default
      // refetchType ('active') only refetches queries that have a mounted
      // observer at the instant of the call, the owner catalog tabs are lazy so
      // the destination tab usually had none, and then mounting that tab did not
      // fetch either. Users had to pull-to-refresh to see their own upload.
      //
      // The predicate form keeps the perf intent exactly and only changes the
      // invalidated case — which is the contract invalidation already promised.
      refetchOnMount: (query) => (query.state.isInvalidated ? 'always' : false),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Stock structural sharing was defeated by re-signed S3 URLs, so every
      // background revalidation produced brand-new object references. On a
      // FlatList that means every visible row re-renders and every Image
      // re-resolves its source — the shake users see when a screen refreshes.
      // Mirrors fthreadly/src/query/queryClient.ts. See ./structuralSharing.
      structuralSharing: (previous, next) =>
        replaceEqualDeepPreservingSignedUrls(previous, next),
    },
  },
});
