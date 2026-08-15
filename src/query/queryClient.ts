import { QueryClient } from '@tanstack/react-query';

import { replaceEqualDeepPreservingSignedUrls } from '@/src/query/structuralSharing';

export const WIEZ_QUERY_STALE_TIME_MS = 3 * 60 * 1000;
export const WIEZ_QUERY_GC_TIME_MS = 30 * 60 * 1000;
export const WIEZ_COUNT_STALE_TIME_MS = 30 * 1000;
export const WIEZ_SAVED_STATUS_STALE_TIME_MS = 60 * 1000;
export const WIEZ_CATEGORY_FILTER_STALE_TIME_MS = 30 * 60 * 1000;
export const WIEZ_QUERY_CACHE_MAX_ENTRIES = 200;

/**
 * How long a minted media URL survives with NO mounted observer.
 *
 * Garbage-collection window, not a freshness window — the two were confused.
 * Media-URL queries were created with `gcTime` set to the *stale* time, so
 * leaving a screen left them observer-less and a few minutes later every one was
 * evicted. Returning re-minted a URL per image, which on native means a new
 * cache key per file for expo-image and a real re-download of the whole grid.
 * `staleTime` still governs revalidation; this only stops the eviction.
 *
 * Mirrors fthreadly/src/query/queryClient.ts.
 */
export const WIEZ_MEDIA_URL_GC_TIME_MS = 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: WIEZ_QUERY_STALE_TIME_MS,
      gcTime: WIEZ_QUERY_GC_TIME_MS,
      retry: 1,
      // Refetch on mount when the data is INVALIDATED or genuinely STALE.
      //
      // This was `(query) => query.state.isInvalidated ? 'always' : false`, on
      // the reasoning that "merely being stale must not trigger a refetch —
      // screens remount constantly on a tab navigator". But `staleTime` is
      // already the control for that: at 3 minutes, a remount only refetches if
      // the data really is 3+ minutes old, which is the whole point of having a
      // staleTime. Suppressing stale refetches on top of it meant persisted
      // data from a PREVIOUS APP LAUNCH was served indefinitely, and the only
      // way out was an explicit pull-to-refresh. That is what made a brand's
      // own email arrive blank on the profile until they manually refreshed,
      // and what let catalog tab counts sit on last session's numbers.
      //
      // The invalidated case still forces a refetch — see the note below on why
      // that mattered for freshly created content.
      refetchOnMount: (query) => (query.state.isInvalidated ? 'always' : true),
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
