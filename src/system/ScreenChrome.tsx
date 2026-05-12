import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

export const NATIVE_ISLAND_NAV = {
  height: 56,
  radius: 28,
  maxWidth: 420,
  minSideOffset: 16,
  safeAreaGap: 10,
  minBottomOffset: 14,
  horizontalPadding: 4,
  contentClearance: 88,
} as const;

export type NativeIslandLayout = {
  bottomOffset: number;
  sideOffset: number;
  islandWidth: number;
};

type ScreenChromeMetrics = {
  insets: EdgeInsets;
  windowWidth: number;
  windowHeight: number;
  bottomSystemInset: number;
  islandLayout: NativeIslandLayout;
  islandContentClearance: number;
  standardScreenBottomPadding: number;
  immersiveOverlayBottomClearance: number;
  getImmersivePageHeight: (viewportHeight: number) => number;
};

const ScreenChromeContext = createContext<ScreenChromeMetrics | null>(null);

const normalizeInset = (value: number) => Math.max(0, Math.round(value || 0));

export function getNativeIslandLayout(windowWidth: number, bottomInset: number): NativeIslandLayout {
  const islandWidth = Math.min(
    Math.max(windowWidth - NATIVE_ISLAND_NAV.minSideOffset * 2, 0),
    NATIVE_ISLAND_NAV.maxWidth,
  );
  const sideOffset = Math.max(
    NATIVE_ISLAND_NAV.minSideOffset,
    Math.round((windowWidth - islandWidth) / 2),
  );
  const bottomOffset = Math.max(
    NATIVE_ISLAND_NAV.minBottomOffset,
    normalizeInset(bottomInset) + NATIVE_ISLAND_NAV.safeAreaGap,
  );

  return { bottomOffset, sideOffset, islandWidth };
}

export function getNativeIslandContentClearance(bottomInset: number) {
  return NATIVE_ISLAND_NAV.contentClearance + normalizeInset(bottomInset);
}

export function getImmersiveViewportPageHeight(viewportHeight: number, bottomInset: number) {
  const baseHeight = Math.max(1, Math.round(viewportHeight || 0));
  if (Platform.OS !== 'android') return baseHeight;

  return baseHeight + normalizeInset(bottomInset);
}

export function ScreenChromeProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const bottomSystemInset = normalizeInset(insets.bottom);

  const value = useMemo<ScreenChromeMetrics>(() => {
    const islandLayout = getNativeIslandLayout(windowWidth, bottomSystemInset);
    const islandContentClearance = getNativeIslandContentClearance(bottomSystemInset);

    return {
      insets,
      windowWidth,
      windowHeight,
      bottomSystemInset,
      islandLayout,
      islandContentClearance,
      standardScreenBottomPadding: islandContentClearance,
      immersiveOverlayBottomClearance: islandContentClearance,
      getImmersivePageHeight: (viewportHeight: number) =>
        getImmersiveViewportPageHeight(viewportHeight, bottomSystemInset),
    };
  }, [bottomSystemInset, insets, windowHeight, windowWidth]);

  return <ScreenChromeContext.Provider value={value}>{children}</ScreenChromeContext.Provider>;
}

export function useScreenChrome() {
  const value = useContext(ScreenChromeContext);
  if (!value) {
    throw new Error('useScreenChrome must be used inside ScreenChromeProvider');
  }
  return value;
}
