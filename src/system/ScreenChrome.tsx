import React, { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useCommitCost } from '@/src/perf/commitCost';

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

export function getImmersiveViewportPageHeight(viewportHeight: number, _bottomInset: number) {
  const baseHeight = Math.max(1, Math.round(viewportHeight || 0));
  return baseHeight;
}

export function ScreenChromeProvider({ children }: { children: React.ReactNode }) {
  useCommitCost('P:ScreenChrome');
  const rawInsets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  /*
    Primitives in the dependency list, never the insets OBJECT.

    This context is consumed by the tab shell, the island, Runway, Market,
    Catalogue and Inbox — and a context update reaches every consumer directly,
    with no element memoization able to stop it. So whatever busts this memo
    re-renders the whole app.

    `insets` was in the list as an object. It is returned by
    `useSafeAreaInsets()`, so its identity is only as stable as that hook's,
    and this provider re-renders whenever anything above it does. An object
    whose contents are unchanged but whose reference is new is enough to
    publish a brand new context value and re-render every screen — which is
    exactly the shape of the 2026-10-09 14:21 capture: `TabShell`, `Runway`,
    `RunwayList` and `Market` all committing ×68 in one ten second window,
    identical counts across components whose only shared dependency is this.

    Depending on the four numbers means a parent re-render can no longer
    publish a new value. The insets object is still exposed on the context —
    callers read it — but it is rebuilt from those numbers so its identity
    changes only when a number does.
  */
  const insetTop = normalizeInset(rawInsets.top);
  const insetBottom = normalizeInset(rawInsets.bottom);
  const insetLeft = normalizeInset(rawInsets.left);
  const insetRight = normalizeInset(rawInsets.right);

  const value = useMemo<ScreenChromeMetrics>(() => {
    const islandLayout = getNativeIslandLayout(windowWidth, insetBottom);
    const islandContentClearance = getNativeIslandContentClearance(insetBottom);

    return {
      insets: { top: insetTop, bottom: insetBottom, left: insetLeft, right: insetRight },
      windowWidth,
      windowHeight,
      bottomSystemInset: insetBottom,
      islandLayout,
      islandContentClearance,
      standardScreenBottomPadding: islandContentClearance,
      immersiveOverlayBottomClearance: islandContentClearance,
      getImmersivePageHeight: (viewportHeight: number) =>
        getImmersiveViewportPageHeight(viewportHeight, insetBottom),
    };
  }, [insetBottom, insetLeft, insetRight, insetTop, windowHeight, windowWidth]);

  return <ScreenChromeContext.Provider value={value}>{children}</ScreenChromeContext.Provider>;
}

export function useScreenChrome() {
  const value = useContext(ScreenChromeContext);
  if (!value) {
    throw new Error('useScreenChrome must be used inside ScreenChromeProvider');
  }
  return value;
}
