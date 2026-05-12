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

  // With edge-to-edge enabled, most NavigationBar API calls are not supported.
  // The expo-navigation-bar plugin in app.json handles static configuration.
  // However, setButtonStyleAsync might still work for dynamic theming.

  try {
    await NavigationBar.setButtonStyleAsync(getAndroidNavigationButtonStyle(scheme));
  } catch (error) {
    // If this fails, the plugin's static barStyle will be used
    console.log('[system-ui]', {
      event: 'android-navigation-bar-button-style-fallback',
      reason,
      scheme,
      error: error.message,
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
