import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { THREADLY_QUERY_STALE_TIME_MS } from '@/src/query/queryClient';

/**
 * Hook to invalidate queries when app comes to foreground.
 * Prevents stale data after app is backgrounded.
 * 
 * Usage:
 * useAppStateListener(['market', 'feed'], 3 * 60 * 1000); // Refetch after 3min
 */
export const useAppStateListener = (queryPatterns: (string | string[])[] = [], staleTimeMs?: number) => {
  const queryClient = useQueryClient();
  const staleThresholdMs = staleTimeMs ?? THREADLY_QUERY_STALE_TIME_MS;
  const lastInactiveAtRef = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const patternKey = JSON.stringify(queryPatterns);
  const normalizedPatterns = useMemo(
    () => {
      const patterns = JSON.parse(patternKey) as (string | string[])[];
      return patterns.map((pattern) =>
        Array.isArray(pattern) ? pattern : [pattern],
      );
    },
    [patternKey],
  );

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (nextAppState === 'inactive' || nextAppState === 'background') {
        lastInactiveAtRef.current = Date.now();
        return;
      }

      if (nextAppState === 'active' && previousAppState !== 'active') {
        const inactiveAt = lastInactiveAtRef.current;
        const backgroundAgeMs = inactiveAt ? Date.now() - inactiveAt : Number.POSITIVE_INFINITY;
        if (backgroundAgeMs < staleThresholdMs) return;

        normalizedPatterns.forEach((queryKey) => {
          queryClient.invalidateQueries({
            queryKey,
            exact: false,
          });
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [normalizedPatterns, queryClient, staleThresholdMs]);
};

export default useAppStateListener;
