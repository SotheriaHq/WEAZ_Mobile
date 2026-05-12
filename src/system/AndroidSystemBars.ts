import * as NavigationBar from 'expo-navigation-bar';
import { AppState, Appearance, Platform } from 'react-native';
import { useEffect } from 'react';

import type { ResolvedTheme } from '@/src/types/theme';

const TRANSPARENT = '#00000000';

export function getAndroidNavigationButtonStyle(scheme: ResolvedTheme) {
  return scheme === 'dark' ? 'light' : 'dark';
}

export async function applyAndroidSystemBarsPolicy(scheme: ResolvedTheme, reason: string) {
  if (Platform.OS !== 'android') return;

  try {
    // Sequential calls - position must be set before colors
    await NavigationBar.setVisibilityAsync('visible');
    await NavigationBar.setPositionAsync('absolute');
    await NavigationBar.setBehaviorAsync('overlay-swipe');
    await NavigationBar.setBackgroundColorAsync(TRANSPARENT);
    await NavigationBar.setBorderColorAsync(TRANSPARENT);
    await NavigationBar.setButtonStyleAsync(getAndroidNavigationButtonStyle(scheme));
  } catch (error) {
    console.warn('[system-ui]', {
      event: 'android-system-bars-policy-failure',
      reason,
      error,
    });
  }
}

export function getInitialAndroidSystemScheme(): ResolvedTheme {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export function useAndroidSystemBars(scheme: ResolvedTheme, reasonKey: string) {
  useEffect(() => {
    void applyAndroidSystemBarsPolicy(scheme, `effect:${reasonKey}`);
  }, [reasonKey, scheme]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void applyAndroidSystemBarsPolicy(scheme, `app-state-active:${reasonKey}`);
      }
    });

    return () => subscription.remove();
  }, [reasonKey, scheme]);
}
