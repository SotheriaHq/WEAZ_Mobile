import { focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { CacheRestoreProbe } from '@/src/perf/CacheRestoreProbe';
import { queryClient } from '@/src/query/queryClient';
import {
  WIEZ_QUERY_CACHE_BUSTER,
  WIEZ_QUERY_CACHE_MAX_AGE_MS,
  shouldDehydrateWiezQuery,
  wiezQueryPersister,
} from '@/src/query/queryPersistor';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return focusManager.setEventListener((handleFocus) => {
      const subscription = AppState.addEventListener('change', (state) => {
        handleFocus(state === 'active');
      });
      return () => subscription.remove();
    });
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: wiezQueryPersister,
        maxAge: WIEZ_QUERY_CACHE_MAX_AGE_MS,
        buster: WIEZ_QUERY_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateWiezQuery,
        },
      }}
    >
      {/* Inert without EXPO_PUBLIC_DEBUG_NAV; must sit INSIDE the provider so
          it can read `useIsRestoring`. */}
      <CacheRestoreProbe />
      {children}
    </PersistQueryClientProvider>
  );
}
