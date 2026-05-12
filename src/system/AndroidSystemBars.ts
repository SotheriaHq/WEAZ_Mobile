import * as NavigationBar from 'expo-navigation-bar';
import { requireNativeModule } from 'expo-modules-core';
import { isEdgeToEdge } from 'react-native-is-edge-to-edge';
import { AppState, Appearance, Platform, processColor } from 'react-native';
import { useEffect } from 'react';

import type { ResolvedTheme } from '@/src/types/theme';

const TRANSPARENT = '#00000000';

type NavigationBarOperation = {
  name: string;
  run: () => Promise<void> | void;
};

type NativeNavigationBarModule = {
  setBackgroundColorAsync?: (color: ReturnType<typeof processColor>) => Promise<void>;
  setBorderColorAsync?: (color: ReturnType<typeof processColor>) => Promise<void>;
  setButtonStyleAsync?: (style: 'light' | 'dark') => Promise<void>;
  setPositionAsync?: (position: 'absolute' | 'relative') => Promise<void>;
  setVisibilityAsync?: (visibility: 'visible' | 'hidden') => Promise<void>;
};

let nativeNavigationBarModule: NativeNavigationBarModule | null | undefined;

function getNativeNavigationBarModule() {
  if (Platform.OS !== 'android') return null;
  if (nativeNavigationBarModule !== undefined) return nativeNavigationBarModule;

  try {
    nativeNavigationBarModule =
      requireNativeModule<NativeNavigationBarModule>('ExpoNavigationBar');
  } catch {
    nativeNavigationBarModule = null;
  }

  return nativeNavigationBarModule;
}

export function getAndroidNavigationButtonStyle(scheme: ResolvedTheme) {
  return scheme === 'dark' ? 'light' : 'dark';
}

function getAndroidNavigationBarStyle(scheme: ResolvedTheme) {
  return scheme === 'dark' ? 'dark' : 'light';
}

function getUnsupportedReason(result: PromiseSettledResult<void>) {
  if (result.status === 'fulfilled') return null;
  const error = result.reason;
  return error instanceof Error ? error.message : String(error);
}

export async function applyAndroidSystemBarsPolicy(scheme: ResolvedTheme, reason: string) {
  if (Platform.OS !== 'android') return;

  const buttonStyle = getAndroidNavigationButtonStyle(scheme);
  const edgeToEdgeActive = isEdgeToEdge();
  const nativeNavigationBar = getNativeNavigationBarModule();
  const transparentColor = processColor(TRANSPARENT);
  const operations: NavigationBarOperation[] = [
    {
      name: 'visibility',
      run: () => NavigationBar.setVisibilityAsync('visible'),
    },
    {
      name: 'button-style',
      run: () => NavigationBar.setButtonStyleAsync(buttonStyle),
    },
  ];

  if (typeof NavigationBar.setStyle === 'function') {
    operations.push({
      name: 'edge-to-edge-style',
      run: () => NavigationBar.setStyle(getAndroidNavigationBarStyle(scheme)),
    });
  }

  // Expo's public wrapper intentionally no-ops these mutators after edge-to-edge
  // is detected. Calling the same native module directly keeps already-installed
  // dev-client/Expo Go hosts and rebuilt apps on the same transparent policy.
  if (nativeNavigationBar) {
    operations.push(
      ...(nativeNavigationBar.setVisibilityAsync
        ? [
            {
              name: 'native-visibility',
              run: () => nativeNavigationBar.setVisibilityAsync?.('visible'),
            },
          ]
        : []),
      ...(nativeNavigationBar.setPositionAsync
        ? [
            {
              name: 'native-position',
              run: () => nativeNavigationBar.setPositionAsync?.('absolute'),
            },
          ]
        : []),
      ...(nativeNavigationBar.setBackgroundColorAsync && transparentColor != null
        ? [
            {
              name: 'native-background',
              run: () => nativeNavigationBar.setBackgroundColorAsync?.(transparentColor),
            },
          ]
        : []),
      ...(nativeNavigationBar.setBorderColorAsync && transparentColor != null
        ? [
            {
              name: 'native-border',
              run: () => nativeNavigationBar.setBorderColorAsync?.(transparentColor),
            },
          ]
        : []),
      ...(nativeNavigationBar.setButtonStyleAsync
        ? [
            {
              name: 'native-button-style',
              run: () => nativeNavigationBar.setButtonStyleAsync?.(buttonStyle),
            },
          ]
        : []),
    );
  } else if (!edgeToEdgeActive) {
    operations.push(
      {
        name: 'position',
        run: () => NavigationBar.setPositionAsync('absolute'),
      },
      {
        name: 'background',
        run: () => NavigationBar.setBackgroundColorAsync(TRANSPARENT),
      },
      {
        name: 'border',
        run: () => NavigationBar.setBorderColorAsync(TRANSPARENT),
      },
    );
  }

  const results = await Promise.allSettled(operations.map((operation) => operation.run()));

  if (__DEV__) {
    const failed = results
      .map((result, index) => ({
        operation: operations[index]?.name,
        error: getUnsupportedReason(result),
      }))
      .filter((entry) => entry.error);

    if (failed.length > 0) {
      console.warn('[system-ui]', {
        event: 'android-navigation-bar-policy-fallback',
        reason,
        scheme,
        failed,
      });
    }
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
