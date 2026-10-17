import { IsRestoringProvider, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { CacheRestoreProbe } from '@/src/perf/CacheRestoreProbe';
import { queryClient } from '@/src/query/queryClient';
import {
  WIEZ_QUERY_CACHE_BUSTER,
  WIEZ_QUERY_CACHE_MAX_AGE_MS,
  subscribeWiezQueryPersistence,
  wiezQueryPersister,
} from '@/src/query/queryPersistor';

/**
 * `PersistQueryClientProvider`, minus its save path.
 *
 * Restore is identical — same persister, maxAge and buster, and
 * `useIsRestoring` still reads true until hydration finishes. Saving is what
 * changed: the stock provider re-dehydrated the whole cache on every cache
 * event, on the JS thread, while the user was tapping. See
 * `subscribeWiezQueryPersistence` for when the snapshot is written now.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [isRestoring, setIsRestoring] = useState(true);
  const didRestore = useRef(false);

  useEffect(() => {
    return focusManager.setEventListener((handleFocus) => {
      const subscription = AppState.addEventListener('change', (state) => {
        handleFocus(state === 'active');
      });
      return () => subscription.remove();
    });
  }, []);

  useEffect(() => {
    if (!didRestore.current) {
      didRestore.current = true;
      persistQueryClientRestore({
        queryClient,
        persister: wiezQueryPersister,
        maxAge: WIEZ_QUERY_CACHE_MAX_AGE_MS,
        buster: WIEZ_QUERY_CACHE_BUSTER,
      })
        .catch(() => undefined)
        .finally(() => setIsRestoring(false));
    }
    return isRestoring ? undefined : subscribeWiezQueryPersistence(queryClient);
  }, [isRestoring]);

  return (
    <QueryClientProvider client={queryClient}>
      <IsRestoringProvider value={isRestoring}>
        {/* Inert without EXPO_PUBLIC_DEBUG_NAV; must sit INSIDE the restoring
            provider so it can read `useIsRestoring`. */}
        <CacheRestoreProbe />
        {children}
      </IsRestoringProvider>
    </QueryClientProvider>
  );
}
