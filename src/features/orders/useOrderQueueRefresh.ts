import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Visible order hosts revalidate after navigation or returning from the background. */
export function useOrderQueueRefresh(refresh: () => void, enabled: boolean, resourceKey?: string) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    // The initial cached query already fetches on mount.
    if (focusedOnce.current) refreshRef.current();
    focusedOnce.current = true;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') refreshRef.current();
      previous = next;
    });
    return () => subscription.remove();
  }, [enabled, resourceKey]));
}
