import { focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryClient } from '@/src/query/queryClient';
import {
  THREADLY_QUERY_CACHE_BUSTER,
  THREADLY_QUERY_CACHE_MAX_AGE_MS,
  shouldDehydrateThreadlyQuery,
  threadlyQueryPersister,
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
        persister: threadlyQueryPersister,
        maxAge: THREADLY_QUERY_CACHE_MAX_AGE_MS,
        buster: THREADLY_QUERY_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateThreadlyQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
