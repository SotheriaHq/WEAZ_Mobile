import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';

import {
  NativeIslandBottomNav,
  type NativeIslandNavItem,
} from '@/components/navigation/NativeIslandBottomNav';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
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
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { THREADLY_COUNT_STALE_TIME_MS } from '@/src/query/queryClient';
import {
  NATIVE_ISLAND_ICONS,
  NATIVE_ISLAND_KEYS,
  buildNativeIslandItems,
  getNativeIslandRoute,
  mapPathnameToIslandKey,
  type NativeIslandKey,
} from '@/src/navigation/nativeIslandConfig';

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
  const { status, token, user } = useAuth();
  const toast = useToast();
  const bagFlow = useBagFlow();
  const { count: bagCount } = useBagCount();
  const pathname = usePathname();
  const { windowWidth, islandLayout } = useScreenChrome();
  const unreadNotificationCount = useUnreadNotificationCount();
  const unreadMessageCount = useUnreadMessageCount();
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const [messageCountReady, setMessageCountReady] = useState(false);
  const lastBackPressAtRef = useRef(0);
  const lastNotificationRefreshAttemptAtRef = useRef(0);
  const lastMessageRefreshAttemptAtRef = useRef(0);
  const pendingRouteFrameRef = useRef<number | null>(null);
  const pendingRouteTokenRef = useRef(0);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<NativeIslandKey | null>(null);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const profileNavLabel = canOpenProfileMenu ? 'Me' : 'Sign In';
  const profileNavEmoji = canOpenProfileMenu ? NATIVE_ISLAND_ICONS.profile : NATIVE_ISLAND_ICONS.signIn;
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
    return mapPathnameToIslandKey(pathname);
  }, [pathname]);
  const displayedActiveKey = bagFlow?.isMyBagOpen
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

  const scheduleRouteAfterFrame = useCallback((navFlow: string, run: () => void) => {
    // SINGLE frame yield (was two nested rAFs). The island's active indicator is
    // now driven by local state in NativeIslandBottomNav and paints on the same
    // press, so it no longer needs the route call held back two frames to look
    // instant. One frame is still enough to let the pressed/active feedback
    // commit before router.navigate runs (which on a cold first-visit can block
    // the JS thread), but it halves the dead time between the active indicator
    // and the actual route call — which, combined with detachInactiveScreens,
    // is what closes the "old screen still visible" gap.
    const token = pendingRouteTokenRef.current + 1;
    pendingRouteTokenRef.current = token;
    cancelPendingRouteFrame();
    pendingRouteFrameRef.current = requestAnimationFrame(() => {
      pendingRouteFrameRef.current = null;
      if (pendingRouteTokenRef.current !== token) return;
      navPerf.frameYieldBeforeRoute(navFlow);
      run();
    });
  }, [cancelPendingRouteFrame]);

  useEffect(() => cancelPendingRouteFrame, [cancelPendingRouteFrame]);

  const navigateToProfile = useCallback(() => {
    setOptimisticActiveKey(NATIVE_ISLAND_KEYS.profile);
    // navigate (not push) so an already-mounted Catalogue/Me instance is reused
    // instead of mounting a fresh copy on every visit.
    const navFlow = isBrand ? 'tabs→catalog' : 'tabs→me';
    scheduleRouteAfterFrame(navFlow, () => {
      navPerf.navigationCalled(navFlow);
      router.navigate((isBrand ? '/catalog' : '/(tabs)/me') as any);
    });
  }, [isBrand, scheduleRouteAfterFrame]);

  const handleProfilePress = useCallback(
    () => {
      if (!canOpenProfileMenu) {
        const navFlow = 'tabs→login';
        scheduleRouteAfterFrame(navFlow, () => {
          navPerf.navigationCalled(navFlow);
          router.replace({ pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as any);
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
    setOptimisticActiveKey(item.key as NativeIslandKey);
  }, []);

  const islandItems = useMemo<NativeIslandNavItem[]>(
    () =>
      buildNativeIslandItems({
        activeKey: displayedActiveKey,
        isBrand,
        profileLabel: profileNavLabel,
        profileIcon: profileNavEmoji,
        profileAvatarUri: profileNavAvatarUri,
        profileBadge: canOpenProfileMenu && notificationCountReady ? unreadNotificationCount : undefined,
        inboxBadge: canOpenProfileMenu && messageCountReady ? unreadMessageCount : undefined,
        bagBadge: bagCount.combinedCount,
      }).map((item) => ({
        ...item,
        navFlow: getIslandNavFlow(item, isBrand, canOpenProfileMenu),
        targetRoute: getNativeIslandRoute(item.key, isBrand),
      })),
    [
      bagCount.combinedCount,
      canOpenProfileMenu,
      displayedActiveKey,
      isBrand,
      messageCountReady,
      notificationCountReady,
      profileNavAvatarUri,
      profileNavEmoji,
      profileNavLabel,
      unreadMessageCount,
      unreadNotificationCount,
    ],
  );

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
    navPerf.pathChanged(pathname);
  }, [pathname]);

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
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
        const navFlow = item.navFlow ?? getIslandNavFlow(item, isBrand, canOpenProfileMenu);
        scheduleRouteAfterFrame(navFlow, () => {
          navPerf.navigationCalled(navFlow);
          // navigate (not replace) so switching between island tabs reuses the
          // existing tab screens instead of remounting them and refetching.
          router.navigate(nextRoute as any);
        });
      }
    },
    [bagFlow, cancelPendingRouteFrame, canOpenProfileMenu, handleProfilePress, isBrand, scheduleRouteAfterFrame],
  );

  useEffect(() => {
    if (optimisticActiveKey && mapPathnameToIslandKey(pathname) === optimisticActiveKey) {
      clearSelectionState();
    }
  }, [clearSelectionState, optimisticActiveKey, pathname]);

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
        if (Date.now() - lastNotificationRefreshAttemptAtRef.current < THREADLY_COUNT_STALE_TIME_MS) {
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
        if (Date.now() - lastMessageRefreshAttemptAtRef.current < THREADLY_COUNT_STALE_TIME_MS) {
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
        // detachInactiveScreens={false} is the core "instant screen response"
        // lever. By default React Navigation sets it true on native, which
        // DETACHES every inactive tab from the native view hierarchy AND freezes
        // its React tree (react-freeze). Switching tabs then has to re-attach +
        // unfreeze + repaint the destination — that is the visible gap where the
        // island active indicator has already flipped but the OLD screen is still
        // on screen while the target paints late. Keeping inactive tabs attached
        // and live (after their first lazy mount) makes a tab switch an instant
        // z-order swap of an already-painted surface — the behaviour users expect
        // from WhatsApp/Instagram. The set is bounded (Runway, Market, Messages,
        // Me/Profile, Catalogue), lists inside stay virtualized, and heavy data
        // refresh stays gated behind useFocusEffect so background tabs do not
        // refetch. This is NOT a server-data cache and does not touch
        // screenWarmState.
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          // Keep the destination's React tree live while blurred so a re-focus is
          // a pure visibility swap with no unfreeze render. Pairs with
          // detachInactiveScreens={false} above.
          freezeOnBlur: false,
          tabBarStyle: {
            display: 'none',
          },
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
      </Tabs>

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
