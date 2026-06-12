import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to invalidate queries when app comes to foreground.
 * Prevents stale data after app is backgrounded.
 * 
 * Usage:
 * useAppStateListener(['market', 'feed'], 3 * 60 * 1000); // Refetch after 3min
 */
export const useAppStateListener = (queryPatterns: (string | string[])[] = [], staleTimeMs?: number) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // App has come to foreground
        // Invalidate queries matching patterns to trigger refresh
        queryPatterns.forEach((pattern) => {
          if (typeof pattern === 'string') {
            queryClient.invalidateQueries({
              queryKey: [pattern],
              exact: false,
            });
          } else if (Array.isArray(pattern)) {
            queryClient.invalidateQueries({
              queryKey: pattern,
              exact: false,
            });
          }
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [queryClient, queryPatterns]);
};

export default useAppStateListener;
