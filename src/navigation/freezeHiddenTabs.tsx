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
  route: { key: string; name?: string };
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

/**
 * Tabs that are never frozen, because thawing them costs more than the
 * re-renders freezing saves.
 *
 * Thawing is not free: react-freeze suspends the tree, and on reveal React
 * reconnects every effect and layout effect in it at once. For Market
 * (`discover`) — a very large screen with several lists — that was the
 * unattributed 0.9-1.5s block on every entry in the 2026-10-16 capture
 * (tabs→market blockedMs=1414/1481/926). What the freeze was added to stop,
 * hidden Market re-rendering on navigation, came mostly from the BagFlow
 * context value changing on every route, which was fixed in the same change;
 * left unfrozen, Market now re-renders only when its own data changes.
 */
const NEVER_FROZEN_ROUTES = new Set(['discover']);

export function freezeHiddenTabLayout({ route, navigation, children }: TabLayoutArgs) {
  if (route.name && NEVER_FROZEN_ROUTES.has(route.name)) {
    return children;
  }
  const state = navigation.getState();
  const focused = state.routes[state.index]?.key === route.key;
  const preloaded = state.preloadedRouteKeys?.includes(route.key) ?? false;
  return <DelayedFreeze freeze={!focused && !preloaded}>{children}</DelayedFreeze>;
}
