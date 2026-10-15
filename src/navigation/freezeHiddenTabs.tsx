/**
 * Freeze the React tree of every tab the user is not looking at.
 *
 * WHY THIS EXISTS. The tab navigator sets `freezeOnBlur: true` with
 * `detachInactiveScreens={false}`, and the second silently cancels the first:
 * `react-native-screens` only applies the freeze inside its `enabled` branch
 * (`Screen.tsx`, `if (enabled && isNativePlatformSupported)`), and the tab view
 * passes `enabled: detachInactiveScreens`. With detaching off, each scene is a
 * plain `Animated.View` and nothing is frozen. Every hidden tab the session has
 * visited therefore re-rendered on every context change — the 2026-10-15 device
 * capture measured hidden Market at 400-1250ms on presses to Runway, Catalogue
 * and Inbox.
 *
 * Detaching stays off (it rebuilt Studio's WebView on every return), so the
 * freeze is applied here instead, through the navigator's `screenLayout`.
 *
 * The rule mirrors `react-native-screens` exactly: frozen when not focused AND
 * not preloaded (a preloaded tab must still be allowed to mount), and the
 * freeze lands one tick after blur so the screen finishes its blurred render —
 * `useIsFocused`, `useFocusEffect` cleanups — before React stops it.
 */
import React, { useEffect, useState } from 'react';
import { Freeze } from 'react-freeze';

type TabLayoutArgs = {
  route: { key: string };
  navigation: {
    getState: () => { index: number; routes: { key: string }[]; preloadedRouteKeys?: string[] };
  };
  children: React.ReactElement;
};

function DelayedFreeze({ freeze, children }: { freeze: boolean; children: React.ReactNode }) {
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFrozen(freeze), 0);
    return () => clearTimeout(id);
  }, [freeze]);

  // Unfreezing is immediate: a press must never wait a tick for its screen.
  return <Freeze freeze={freeze ? frozen : false}>{children}</Freeze>;
}

export function freezeHiddenTabLayout({ route, navigation, children }: TabLayoutArgs) {
  const state = navigation.getState();
  const focused = state.routes[state.index]?.key === route.key;
  const preloaded = state.preloadedRouteKeys?.includes(route.key) ?? false;
  return <DelayedFreeze freeze={!focused && !preloaded}>{children}</DelayedFreeze>;
}
