import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { Tabs, router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';

import {
  NativeIslandBottomNav,
  type NativeIslandNavItem,
} from '@/components/navigation/NativeIslandBottomNav';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { useBagFlow } from '@/src/features/bagging/BagFlowProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  refreshUnreadNotificationCount as refreshSharedUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';
import {
  refreshUnreadMessageCount as refreshSharedUnreadMessageCount,
  useMessagingRealtimeChannel,
  useUnreadMessageCount,
} from '@/src/realtime/messaging';
import { resolveProfileImageSource } from '@/src/utils/profileImage';
import { useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { navDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { navPerf } from '@/src/utils/navPerf';
import {
  getRunwayFirstMediaVisible,
  subscribeRunwayFirstMediaVisible,
} from '@/src/features/feed/utils/runwayReadiness';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { WIEZ_COUNT_STALE_TIME_MS } from '@/src/query/queryClient';
import {
  NATIVE_ISLAND_ICONS,
  NATIVE_ISLAND_KEYS,
  buildNativeIslandItems,
  buildStudioIslandItems,
  getNativeIslandRoute,
  isStudioIslandKey,
  isStudioIslandPath,
  mapPathnameToIslandKey,
  mapPathnameToStudioIslandKey,
  type AnyIslandKey,
  type NativeIslandKey,
} from '@/src/navigation/nativeIslandConfig';
import { withNavigationLock, releaseNavigationLock } from '@/src/utils/mobileNavigation';

// Keep Runway (`index`) as the tab shell's anchor route now that Catalogue is
// also a (hidden) tab — without this, adding sibling screens can shift Expo
// Router's default/initial tab.
export const unstable_settings = {
  initialRouteName: 'index',
};

// Focused catalogue sub-flows are full-screen editors/viewers that must not be
// covered by the floating island (matches the pre-migration behaviour when
// catalogue rendered its own island and hid it for these routes). `/catalog`
// and the visitor `/catalog/[brandId]` keep the island.
const FOCUSED_CATALOG_FLOW = /^\/catalog\/(view|create-design|create-collection|edit-profile)(\/|$)/;

type ExpoTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];
type HiddenTabNavigation = ExpoTabBarProps['navigation'];
type TabNavigationActionType = 'JUMP_TO' | 'PRELOAD';

function createTabNavigationAction(type: TabNavigationActionType, name: string) {
  return {
    type,
    payload: { name },
  };
}

function getFocusedTabName(navigation: HiddenTabNavigation | null) {
  const state = navigation?.getState();
  if (!state) return null;
  return state.routes[state.index]?.name ?? null;
}

function hasTabRoute(navigation: HiddenTabNavigation | null, name: string) {
  const state = navigation?.getState();
  if (!state) return false;
  return state.routeNames.includes(name) || state.routes.some((route) => route.name === name);
}

function getIslandTabRouteName(key: string, isBrand: boolean) {
  if (key === NATIVE_ISLAND_KEYS.designs) return 'index';
  if (key === NATIVE_ISLAND_KEYS.market) return 'discover';
  if (key === NATIVE_ISLAND_KEYS.inbox) return 'inbox';
  if (key === NATIVE_ISLAND_KEYS.profile) return isBrand ? 'catalog' : 'me';
  return null;
}

function getIslandNavFlow(item: NativeIslandNavItem, isBrand: boolean, isAuthenticated: boolean) {
  if (item.key === NATIVE_ISLAND_KEYS.designs) return 'tabs→runway';
  if (item.key === NATIVE_ISLAND_KEYS.market) return 'tabs→market';
  if (item.key === NATIVE_ISLAND_KEYS.inbox) return 'tabs→inbox';
  if (item.key === NATIVE_ISLAND_KEYS.bag) return 'tabs→bag';
  if (item.key === NATIVE_ISLAND_KEYS.profile) {
    if (!isAuthenticated) return 'tabs→login';
    return isBrand ? 'tabs→catalog' : 'tabs→me';
  }
  return `tabs→${item.key}`;
}

export default function TabLayout() {
  const { theme } = useTheme();
  const { status, token, user } = useAuth();
  const toast = useToast();
  const bagFlow = useBagFlow();
  const { count: bagCount } = useBagCount();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ routeKey?: string | string[] }>();
  const studioRouteKeyParam = Array.isArray(globalParams.routeKey)
    ? globalParams.routeKey[0]
    : globalParams.routeKey;
  const { windowWidth, islandLayout } = useScreenChrome();
  const unreadNotificationCount = useUnreadNotificationCount();
  const unreadMessageCount = useUnreadMessageCount();
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const [messageCountReady, setMessageCountReady] = useState(false);
  const inStudioIsland = isStudioIslandPath(pathname);
  const lastBackPressAtRef = useRef(0);
  const lastNotificationRefreshAttemptAtRef = useRef(0);
  const lastMessageRefreshAttemptAtRef = useRef(0);
  const pendingRouteFrameRef = useRef<number | null>(null);
  const tabNavigationRef = useRef<HiddenTabNavigation | null>(null);
  const preloadedTabNamesRef = useRef<Set<string>>(new Set());
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<AnyIslandKey | null>(null);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const profileNavLabel = status === 'loading' || canOpenProfileMenu ? 'Me' : 'Sign In';
  const profileNavEmoji = status === 'loading' || canOpenProfileMenu
    ? NATIVE_ISLAND_ICONS.profile
    : NATIVE_ISLAND_ICONS.signIn;
  // Resolve the signed-in user's profile photo so the "Me" island item shows the
  // real avatar instead of the default 👤 emoji. Falls back to the emoji when no
  // image is available or while it resolves.
  const profileAvatarSource = resolveProfileImageSource(user);
  const { uri: profileAvatarResolvedUri } = useResolvedImageAsset({
    src: profileAvatarSource.src,
    fileId: profileAvatarSource.fileId,
    enabled: canOpenProfileMenu && Boolean(profileAvatarSource.src || profileAvatarSource.fileId),
  });
  const profileNavAvatarUri = canOpenProfileMenu
    ? profileAvatarResolvedUri ?? profileAvatarSource.src ?? null
    : null;
  const { islandWidth } = islandLayout;
  const isRootTabPath =
    pathname === '/' ||
    pathname === '/discover' ||
    pathname === '/inbox' ||
    pathname === '/me' ||
    pathname === '/(tabs)';

  const activeIslandKey = useMemo(() => {
    if (inStudioIsland) {
      return mapPathnameToStudioIslandKey(pathname, studioRouteKeyParam);
    }
    return mapPathnameToIslandKey(pathname);
  }, [inStudioIsland, pathname, studioRouteKeyParam]);
  const displayedActiveKey = bagFlow?.isMyBagOpen && !inStudioIsland
    ? NATIVE_ISLAND_KEYS.bag
    : optimisticActiveKey ?? activeIslandKey;
  const hideIslandForFocusedFlow = FOCUSED_CATALOG_FLOW.test(pathname);

  const refreshUnreadNotificationCount = useCallback(async () => {
    lastNotificationRefreshAttemptAtRef.current = Date.now();
    const ready = await refreshSharedUnreadNotificationCount({
      authenticated: status === 'authenticated',
    });
    setNotificationCountReady(ready);
  }, [status]);

  const refreshUnreadMessageCount = useCallback(async () => {
    lastMessageRefreshAttemptAtRef.current = Date.now();
    const ready = await refreshSharedUnreadMessageCount({
      authenticated: status === 'authenticated',
    });
    setMessageCountReady(ready);
  }, [status]);

  const cancelPendingRouteFrame = useCallback(() => {
    if (pendingRouteFrameRef.current === null) return;
    cancelAnimationFrame(pendingRouteFrameRef.current);
    pendingRouteFrameRef.current = null;
  }, []);

  const renderHiddenTabBar = useCallback((props: ExpoTabBarProps) => {
    tabNavigationRef.current = props.navigation;
    return null;
  }, []);

  const dispatchTabNavigationAction = useCallback((type: TabNavigationActionType, name: string) => {
    const navigation = tabNavigationRef.current;
    if (!hasTabRoute(navigation, name)) {
      return false;
    }

    if (type === 'PRELOAD' && getFocusedTabName(navigation) === name) {
      return true;
    }

    navigation?.dispatch(createTabNavigationAction(type, name));
    return true;
  }, []);

  const jumpToIslandTab = useCallback(
    (tabName: string, fallbackRoute: string) => {
      navPerf.routeCallStart(tabName, { target: fallbackRoute });
      if (dispatchTabNavigationAction('JUMP_TO', tabName)) {
        navPerf.routeCallEnd(tabName, { target: fallbackRoute });
        return;
      }

      router.navigate(fallbackRoute as any);
      navPerf.routeCallEnd(tabName, { target: fallbackRoute });
    },
    [dispatchTabNavigationAction],
  );

  const preloadIslandTab = useCallback(
    (tabName: string) => {
      if (preloadedTabNamesRef.current.has(tabName)) {
        navDevLog('tab-preload-skipped', { tabName, reason: 'already-preloaded' });
        return false;
      }

      if (dispatchTabNavigationAction('PRELOAD', tabName)) {
        preloadedTabNamesRef.current.add(tabName);
        navDevLog('tab-preload-start', { tabName, startedAt: Date.now() });
        return true;
      }
      navDevLog('tab-preload-skipped', { tabName, reason: 'tab-navigation-not-ready' });
      return false;
    },
    [dispatchTabNavigationAction],
  );

  const scheduleRouteAfterFrame = useCallback((navFlow: string, run: () => void) => {
    // Prefer immediate navigation when the destination tab is already warm —
    // cold JUMP_TO/mount still gets a single rAF so the optimistic active
    // indicator can commit without inheriting the destination render cost.
    // Waiting a frame on warm tabs made revisits feel laggy for no benefit.
    cancelPendingRouteFrame();
    navPerf.routeScheduled(navFlow);

    const tabName = (() => {
      if (navFlow === 'tabs→catalog') return 'catalog';
      if (navFlow === 'tabs→me') return 'me';
      if (navFlow === 'tabs→discover' || navFlow === 'tabs→market') return 'discover';
      if (navFlow === 'tabs→inbox' || navFlow === 'tabs→messages') return 'inbox';
      if (navFlow === 'tabs→index' || navFlow === 'tabs→runway' || navFlow === 'tabs→home') return 'index';
      return null;
    })();
    const isWarm =
      tabName != null &&
      (preloadedTabNamesRef.current.has(tabName) ||
        getFocusedTabName(tabNavigationRef.current) === tabName);

    if (isWarm) {
      navPerf.frameYieldBeforeRoute(navFlow);
      run();
      return;
    }

    pendingRouteFrameRef.current = requestAnimationFrame(() => {
      pendingRouteFrameRef.current = null;
      navPerf.frameYieldBeforeRoute(navFlow);
      run();
    });
  }, [cancelPendingRouteFrame]);

  useEffect(() => cancelPendingRouteFrame, [cancelPendingRouteFrame]);

  useEffect(() => {
    if (status === 'loading') {
      navDevLog('tab-preload-deferred', {
        deferredAt: Date.now(),
        reason: 'auth-loading',
      });
      return;
    }

    // Warm primary destinations early. Waiting on first Runway media left Market /
    // Catalog / Me cold for 1.5s+ on slow networks — the exact "tap and wait ~3s"
    // class of complaint when combined with a cold lazy mount.
    const nextTabsToWarm = ['discover'];
    if (status === 'authenticated') {
      nextTabsToWarm.push('inbox');
      nextTabsToWarm.push(isBrand ? 'catalog' : 'me');
    }

    let cancelled = false;
    let preloadTimers: Array<ReturnType<typeof setTimeout>> = [];
    let earlyTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduled = false;

    const schedulePreloads = (reason: string, firstMediaAt?: number) => {
      if (cancelled || scheduled || preloadTimers.length > 0) return;
      scheduled = true;
      if (earlyTimer) {
        clearTimeout(earlyTimer);
        earlyTimer = null;
      }
      navDevLog('tab-preload-scheduled', {
        scheduledAt: Date.now(),
        reason,
        firstMediaAt: firstMediaAt ?? null,
        tabNames: nextTabsToWarm,
      });
      // Stagger lightly but do not wait for InteractionManager — that API can
      // delay many seconds while Runway carousels keep interactions busy.
      preloadTimers = nextTabsToWarm.map((tabName, index) =>
        setTimeout(() => {
          if (!cancelled) preloadIslandTab(tabName);
        }, 80 + index * 180),
      );
    };

    const firstMedia = getRunwayFirstMediaVisible();
    const unsubscribe = firstMedia
      ? (() => {
          schedulePreloads('first-media-visible', firstMedia.timestamp);
          return () => undefined;
        })()
      : subscribeRunwayFirstMediaVisible((event) => {
          schedulePreloads('first-media-visible', event.timestamp);
        });

    // Start warming almost immediately even if Runway media is slow/empty.
    earlyTimer = setTimeout(() => {
      schedulePreloads('early-warm');
    }, firstMedia ? 0 : 250);

    return () => {
      cancelled = true;
      unsubscribe();
      if (earlyTimer) clearTimeout(earlyTimer);
      preloadTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [isBrand, preloadIslandTab, status]);

  const navigateToProfile = useCallback(() => {
    const target = isBrand ? '/catalog' : '/(tabs)/me';

    // The `profile` key returns early in `handleSelect`, so it never reached the
    // same-target check or the navigation lock that every other island key gets.
    // Tapping Profile while already on Profile re-navigated, and rapid taps were
    // not deduped at all — the one island key exempt from both protections.
    const normTarget = target.replace('/(tabs)', '');
    const normCurrent = String(pathname).replace('/(tabs)', '');
    if (normTarget === normCurrent) {
      navPerf.mark?.('navigation_same_target_ignored', target);
      return;
    }

    setOptimisticActiveKey(NATIVE_ISLAND_KEYS.profile);
    // navigate (not push) so an already-mounted Catalogue/Me instance is reused
    // instead of mounting a fresh copy on every visit.
    const navFlow = isBrand ? 'tabs→catalog' : 'tabs→me';
    navPerf.setContext(pathname, target, pathname);
    const locked = withNavigationLock(target as Href, () => {
      scheduleRouteAfterFrame(navFlow, () => {
        navPerf.navigationCalled(navFlow);
        navPerf.routeCallStart(navFlow, { target });
        jumpToIslandTab(isBrand ? 'catalog' : 'me', target);
        navPerf.routeCallEnd(navFlow, { target });
      });
      return true;
    }, { force: false });
    if (!locked) {
      navPerf.mark?.('navigation_ignored_duplicate', target);
    }
  }, [isBrand, jumpToIslandTab, pathname, scheduleRouteAfterFrame]);

  const handleProfilePress = useCallback(
    () => {
      if (!canOpenProfileMenu) {
        const navFlow = 'tabs→login';
        scheduleRouteAfterFrame(navFlow, () => {
          navPerf.navigationCalled(navFlow);
          navPerf.routeCallStart(navFlow, { target: '/(auth)/login' });
          router.replace({ pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as any);
          navPerf.routeCallEnd(navFlow, { target: '/(auth)/login' });
        });
        return;
      }

      navigateToProfile();
    },
    [canOpenProfileMenu, navigateToProfile, scheduleRouteAfterFrame],
  );

  const clearSelectionState = useCallback(() => {
    setOptimisticActiveKey(null);
  }, []);

  const markOptimisticActive = useCallback((item: NativeIslandNavItem) => {
    if (item.disabled) return;
    setOptimisticActiveKey(item.key);
    // Warm the destination tab on press-in so JUMP_TO hits a preloaded scene
    // instead of a cold lazy mount (main multi-second stall on first visit).
    // Studio chips stay inside the studio tab — no main-app tab preload.
    if (isStudioIslandKey(item.key)) return;
    const tabName = getIslandTabRouteName(item.key, isBrand);
    if (tabName) {
      preloadIslandTab(tabName);
    }
  }, [isBrand, preloadIslandTab]);

  const islandItems = useMemo<NativeIslandNavItem[]>(() => {
    // Inside Studio the dock must show Studio destinations (Dashboard, Store,
    // Orders, …) — same contract as web StudioSidebar / IslandBottomNav. Leaving
    // the main WIEZ island up made the surface look like the brand never left
    // the consumer app.
    if (inStudioIsland) {
      return buildStudioIslandItems({
        activeKey: String(displayedActiveKey),
        messagesBadge:
          canOpenProfileMenu && messageCountReady ? unreadMessageCount : undefined,
      });
    }

    return buildNativeIslandItems({
      activeKey: displayedActiveKey as NativeIslandKey,
      isBrand,
      profileLabel: profileNavLabel,
      profileIcon: profileNavEmoji,
      profileAvatarUri: profileNavAvatarUri,
      profileBadge: canOpenProfileMenu && notificationCountReady ? unreadNotificationCount : undefined,
      inboxBadge: canOpenProfileMenu && messageCountReady ? unreadMessageCount : undefined,
      bagBadge: bagCount.combinedCount,
    }).map((item) => ({
      ...item,
      disabled:
        status === 'loading' &&
        (item.key === NATIVE_ISLAND_KEYS.inbox || item.key === NATIVE_ISLAND_KEYS.profile),
      navFlow: getIslandNavFlow(item, isBrand, canOpenProfileMenu),
      targetRoute: getNativeIslandRoute(item.key, isBrand),
    }));
  }, [
    bagCount.combinedCount,
    canOpenProfileMenu,
    displayedActiveKey,
    inStudioIsland,
    isBrand,
    messageCountReady,
    notificationCountReady,
    profileNavAvatarUri,
    profileNavEmoji,
    profileNavLabel,
    status,
    unreadMessageCount,
    unreadNotificationCount,
  ]);

  useEffect(() => {
    navDevLog('island-layout', {
      pathname,
      itemCount: islandItems.length,
      keys: islandItems.map((item) => item.key),
      labels: islandItems.map((item) => item.label),
      activeKey: displayedActiveKey,
      compact: islandItems.length >= 6 || windowWidth < 380,
      windowWidth,
      islandWidth,
    });
  }, [displayedActiveKey, islandItems, islandWidth, pathname, windowWidth]);

  useEffect(() => {
    navPerf.setContext(null, null, pathname);
    navPerf.pathChanged(pathname);
    // Sync for central guard same-target check.
    //
    // Inside Studio the destination identity is (pathname + routeKey), not the
    // pathname alone — every section lives at `/studio`. Publishing the bare
    // pathname made the guard compare `/studio?routeKey=store` against
    // `/studio` for section chips (always different, so they worked) but
    // `/studio` against `/studio` for the Dashboard chip (always equal, so it
    // never fired). Carry the routeKey so both sides describe the same thing.
    (global as any).__navCurrentPathname =
      inStudioIsland && studioRouteKeyParam ? `${pathname}?routeKey=${studioRouteKeyParam}` : pathname;
    // Release lock if matches pending target.
    //
    // `studioRouteKeyParam` is in the deps on purpose: a Studio section switch
    // keeps `pathname` at `/studio` and only swaps `?routeKey=`, so a
    // pathname-only effect never fired and the lock sat until its 1100ms
    // timeout — making consecutive dock taps feel dead.
    releaseNavigationLock('path_match');
  }, [inStudioIsland, pathname, studioRouteKeyParam]);

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
      // Studio dock: every chip is a studio destination (or native finance/staff).
      if (isStudioIslandKey(item.key) || inStudioIsland) {
        const nextPath = item.targetRoute;
        if (!nextPath) return;
        const nextHref = item.targetParams
          ? ({ pathname: nextPath, params: item.targetParams } as Href)
          : (nextPath as Href);
        const lockKey = item.targetParams
          ? `${nextPath}?${Object.entries(item.targetParams)
              .map(([k, v]) => `${k}=${v}`)
              .join('&')}`
          : nextPath;
        const activeNow = mapPathnameToStudioIslandKey(pathname, studioRouteKeyParam);
        if (activeNow === item.key) {
          navPerf.mark?.('navigation_same_target_ignored', lockKey);
          return;
        }
        const navFlow = item.navFlow ?? `studio→${item.key}`;
        navPerf.setContext(pathname, lockKey, pathname);
        const locked = withNavigationLock(lockKey as Href, () => {
          scheduleRouteAfterFrame(navFlow, () => {
            navPerf.navigationCalled(navFlow);
            navPerf.routeCallStart(navFlow, { target: lockKey });
            // Prefer navigate so the studio tab stack reuses the WebView shell
            // and only swaps routeKey / native sub-screens.
            router.navigate(nextHref as any);
            navPerf.routeCallEnd(navFlow, { target: lockKey });
          });
          return true;
        }, { force: false });
        if (!locked) {
          navPerf.mark?.('navigation_ignored_duplicate', lockKey);
        }
        return;
      }

      if (item.key === 'profile') {
        handleProfilePress();
        return;
      }

      if (item.key === 'bag') {
        cancelPendingRouteFrame();
        bagFlow?.openMyBag();
        navPerf.bagSheetOpened();
        return;
      }

      const nextRoute = item.targetRoute ?? getNativeIslandRoute(item.key, isBrand);
      if (nextRoute) {
        const normNext = String(nextRoute).replace('/(tabs)', '');
        const normCurrent = String(pathname).replace('/(tabs)', '');
        if (normNext === normCurrent && item.key !== 'bag') {
          navPerf.mark?.('navigation_same_target_ignored', String(nextRoute));
          return;
        }
        const navFlow = item.navFlow ?? getIslandNavFlow(item, isBrand, canOpenProfileMenu);
        const tabRouteName = getIslandTabRouteName(item.key, isBrand);
        // Always seed the nav-perf context so every event in this flow carries
        // source/target/pathname (Phase 2: "ensure setContext is always passed").
        navPerf.setContext(pathname, String(nextRoute), pathname);
        // Phase 2: use the central lock to dedupe rapid island taps. The action
        // returns a truthy sentinel so a successful dispatch is distinguishable
        // from a deduped tap (which returns undefined) — without it the duplicate
        // marker would fire on every successful navigation.
        const locked = withNavigationLock(nextRoute as Href, () => {
          scheduleRouteAfterFrame(navFlow, () => {
            navPerf.navigationCalled(navFlow);
            navPerf.routeCallStart(navFlow, { target: nextRoute });
            if (tabRouteName) {
              jumpToIslandTab(tabRouteName, nextRoute);
              navPerf.routeCallEnd(navFlow, { target: nextRoute });
              return;
            }

            router.navigate(nextRoute as any);
            navPerf.routeCallEnd(navFlow, { target: nextRoute });
          });
          return true;
        }, { force: false });
        if (!locked) {
          navPerf.mark?.('navigation_ignored_duplicate', String(nextRoute));
        }
      }
    },
    [
      bagFlow,
      cancelPendingRouteFrame,
      canOpenProfileMenu,
      handleProfilePress,
      inStudioIsland,
      isBrand,
      jumpToIslandTab,
      pathname,
      scheduleRouteAfterFrame,
      studioRouteKeyParam,
    ],
  );

  useEffect(() => {
    if (!optimisticActiveKey) return;
    const resolved = inStudioIsland
      ? mapPathnameToStudioIslandKey(pathname, studioRouteKeyParam)
      : mapPathnameToIslandKey(pathname);
    if (resolved === optimisticActiveKey) {
      clearSelectionState();
    }
  }, [clearSelectionState, inStudioIsland, optimisticActiveKey, pathname, studioRouteKeyParam]);

  useEffect(() => {
    if (optimisticActiveKey === NATIVE_ISLAND_KEYS.bag && bagFlow?.isMyBagOpen === false) {
      clearSelectionState();
    }
  }, [bagFlow?.isMyBagOpen, clearSelectionState, optimisticActiveKey]);

  useEffect(() => {
    setNotificationCountReady(false);
    void refreshUnreadNotificationCount();
  }, [refreshUnreadNotificationCount, user?.id]);

  useEffect(() => {
    setMessageCountReady(false);
    void refreshUnreadMessageCount();
  }, [refreshUnreadMessageCount, user?.id]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (Date.now() - lastNotificationRefreshAttemptAtRef.current < WIEZ_COUNT_STALE_TIME_MS) {
          return;
        }
        void refreshUnreadNotificationCount();
      }
    });

    return () => subscription.remove();
  }, [refreshUnreadNotificationCount, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (Date.now() - lastMessageRefreshAttemptAtRef.current < WIEZ_COUNT_STALE_TIME_MS) {
          return;
        }
        void refreshUnreadMessageCount();
      }
    });

    return () => subscription.remove();
  }, [refreshUnreadMessageCount, status]);

  useNotificationRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
  });

  useMessagingRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isRootTabPath) {
        return false;
      }

      const now = Date.now();
      if (now - lastBackPressAtRef.current < 1800) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressAtRef.current = now;
      toast.info('Press back again to exit');
      return true;
    });

    return () => subscription.remove();
  }, [isRootTabPath, toast]);

  return (
    <>
      <Tabs
        // Render no default tab bar; the floating island owns the visible UI and
        // uses this hidden tabbar's navigation object for direct JUMP_TO/PRELOAD
        // actions.
        tabBar={renderHiddenTabBar}
        screenOptions={{
          headerShown: false,
          lazy: true,
          tabBarStyle: {
            display: 'none',
          },
          sceneStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Runway',
          }}
        />

        <Tabs.Screen
          name="discover"
          options={{
            title: 'Market',
          }}
        />

        <Tabs.Screen
          name="create"
          options={{
            title: '',
            href: null,
          }}
        />

        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Messages',
          }}
        />

        <Tabs.Screen
          name="me"
          options={{
            title: canOpenProfileMenu ? 'Profile' : 'Sign In',
          }}
        />

        <Tabs.Screen
          name="two"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="me-edit"
          options={{
            href: null,
          }}
        />

        {/* Catalogue is a first-class, persistent top-level destination but is
            navigated to programmatically via the island (brand "Profile"), so it
            is hidden from the tab bar with href: null. Living inside (tabs) gives
            it tab-level lifetime while keeping the public /catalog URL (the
            (tabs) route group is omitted from the path). */}
        <Tabs.Screen
          name="catalog"
          options={{
            href: null,
          }}
        />

        {/* Studio follows the Catalogue pattern: it lives inside (tabs) so it
            keeps the floating island (its own island bar used to vanish the
            moment Studio opened) and gets tab-level lifetime, so returning to
            Store does not re-run the handoff and reload the whole web bundle.
            The /studio URL is unchanged — route groups are omitted from the
            path — and it stays out of the visible bar via href: null. */}
        <Tabs.Screen
          name="studio"
          options={{
            href: null,
          }}
        />
      </Tabs>

      {/* The island resolves the ambient scheme on every route. It used to be
          forced dark over the Runway, whose stage was black in both themes;
          the stage is themed now, so a themed island matches it. */}
      {hideIslandForFocusedFlow ? null : (
        <NativeIslandBottomNav
          items={islandItems}
          onSelect={handleSelect}
          onPressIn={markOptimisticActive}
        />
      )}
    </>
  );
}
