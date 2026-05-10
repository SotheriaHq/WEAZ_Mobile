import * as NavigationBar from 'expo-navigation-bar';
import { AppState, Appearance, Platform } from 'react-native';
import { useEffect } from 'react';

import type { ResolvedTheme } from '@/src/types/theme';

const TRANSPARENT = '#00000000';

export function getAndroidNavigationButtonStyle(scheme: ResolvedTheme) {
  return scheme === 'dark' ? 'light' : 'dark';
}

export function applyAndroidSystemBarsPolicy(scheme: ResolvedTheme, reason: string) {
  if (Platform.OS !== 'android') return;

  void Promise.allSettled([
    NavigationBar.setVisibilityAsync('visible'),
    NavigationBar.setPositionAsync('absolute'),
    NavigationBar.setBehaviorAsync('overlay-swipe'),
    NavigationBar.setBackgroundColorAsync(TRANSPARENT),
    NavigationBar.setBorderColorAsync(TRANSPARENT),
    NavigationBar.setButtonStyleAsync(getAndroidNavigationButtonStyle(scheme)),
  ]).then((results) => {
    if (!__DEV__) return;
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      console.warn('[system-ui]', {
        event: 'android-system-bars-policy-partial-failure',
        reason,
        error: rejected.reason,
      });
    }
  });
}

export function getInitialAndroidSystemScheme(): ResolvedTheme {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export function useAndroidSystemBars(scheme: ResolvedTheme, reasonKey: string) {
  useEffect(() => {
    applyAndroidSystemBarsPolicy(scheme, `effect:${reasonKey}`);
  }, [reasonKey, scheme]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applyAndroidSystemBarsPolicy(scheme, `app-state-active:${reasonKey}`);
      }
    });

    return () => subscription.remove();
  }, [reasonKey, scheme]);
}
