import * as NavigationBar from 'expo-navigation-bar';
import { requireNativeModule } from 'expo';
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
  const nativeNavigationBar = getNativeNavigationBarModule();
  const transparentColor = processColor(TRANSPARENT);
  const operations: NavigationBarOperation[] = [
    {
      name: 'visibility',
      // NavigationBar.NavigationBar.setHidden is the newer API (attached to the
      // component function in .android.js). Fall back to deprecated setVisibilityAsync
      // for builds where the native binding hasn't shipped yet — both are functionally
      // equivalent (show the nav bar). The try/catch is needed because a synchronous
      // throw here escapes Promise.allSettled; async rejections are already handled.
      run: () => {
        try {
          return NavigationBar.NavigationBar.setHidden(false);
        } catch {
          return NavigationBar.setVisibilityAsync('visible');
        }
      },
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

export function useAndroidOverlaySystemBars(
  visible: boolean,
  scheme: ResolvedTheme,
  reasonKey: string,
) {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const reason = visible ? `overlay-open:${reasonKey}` : `overlay-closed:${reasonKey}`;
    void applyAndroidSystemBarsPolicy(scheme, reason);

    if (!visible) return undefined;

    const refreshTimers = [
      setTimeout(() => {
        void applyAndroidSystemBarsPolicy(scheme, `overlay-open-settled:${reasonKey}`);
      }, 80),
      setTimeout(() => {
        void applyAndroidSystemBarsPolicy(scheme, `overlay-open-after-animation:${reasonKey}`);
      }, 280),
    ];

    return () => {
      refreshTimers.forEach(clearTimeout);
      void applyAndroidSystemBarsPolicy(scheme, `overlay-cleanup:${reasonKey}`);
    };
  }, [reasonKey, scheme, visible]);
}
