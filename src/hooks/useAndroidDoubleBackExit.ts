import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { router } from 'expo-router';

import { useToast } from '@/src/toast/ToastContext';

const DOUBLE_BACK_WINDOW_MS = 2000;

/**
 * Industry-standard Android back behavior: hardware/gesture back pops in-app
 * history normally; at the root (nothing left to pop) the first press shows
 * "Press back again to exit" and a second press within 2s exits the app.
 */
export function useAndroidDoubleBackExit() {
  const toast = useToast();
  const lastBackPressAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // In-app history remains — let the router pop normally.
      if (router.canGoBack()) return false;

      const now = Date.now();
      if (now - lastBackPressAtRef.current < DOUBLE_BACK_WINDOW_MS) {
        // Second press inside the window — allow default behavior (exit).
        return false;
      }
      lastBackPressAtRef.current = now;
      toast.info('Press back again to exit');
      return true; // swallow the first press
    });

    return () => subscription.remove();
  }, [toast]);
}
