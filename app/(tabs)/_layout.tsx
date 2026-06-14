import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';

import {
  NativeIslandBottomNav,
  NATIVE_ISLAND_NAV,
  type NativeIslandNavItem,
} from '@/components/navigation/NativeIslandBottomNav';
import { ProfileMenuDropup } from '@/components/navigation/ProfileMenuDropup';
import { subscribeToNativeIslandCollapse } from '@/components/navigation/nativeIslandEvents';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { useBagFlow } from '@/src/features/bagging/BagFlowProvider';
import { useTheme } from '@/src/theme/ThemeProvider';
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
import { navDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { navPerf } from '@/src/utils/navPerf';
import { applyAndroidSystemBarsPolicy } from '@/src/system/AndroidSystemBars';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import {
  NATIVE_ISLAND_ICONS,
  NATIVE_ISLAND_KEYS,
  buildNativeIslandItems,
  getNativeIslandRoute,
  mapPathnameToIslandKey,
  type NativeIslandKey,
} from '@/src/navigation/nativeIslandConfig';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

export default function TabLayout() {
  const { scheme, theme } = useTheme();
  const { status, token, user } = useAuth();
  const toast = useToast();
  const bagFlow = useBagFlow();
  const { count: bagCount, refreshGlobalBagCount } = useBagCount();
  const pathname = usePathname();
  const { windowWidth, islandLayout } = useScreenChrome();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const unreadNotificationCount = useUnreadNotificationCount();
  const unreadMessageCount = useUnreadMessageCount();
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const [messageCountReady, setMessageCountReady] = useState(false);
  const lastBackPressAtRef = useRef(0);
  const lastProfileTabPressAtRef = useRef(0);
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<NativeIslandKey | null>(null);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const profileNavLabel = canOpenProfileMenu ? 'Me' : 'Sign In';
  const profileNavEmoji = canOpenProfileMenu ? NATIVE_ISLAND_ICONS.profile : NATIVE_ISLAND_ICONS.signIn;
  const { bottomOffset: islandBottomOffset, islandWidth } = islandLayout;
  const isRootTabPath =
    pathname === '/' ||
    pathname === '/discover' ||
    pathname === '/inbox' ||
    pathname === '/me' ||
    pathname === '/(tabs)';

  const activeIslandKey = useMemo(() => {
    return mapPathnameToIslandKey(pathname);
  }, [pathname]);
  const displayedActiveKey = optimisticActiveKey ?? activeIslandKey;

  const refreshUnreadNotificationCount = useCallback(async () => {
    const ready = await refreshSharedUnreadNotificationCount({
      authenticated: status === 'authenticated',
    });
    setNotificationCountReady(ready);
  }, [status]);

  const refreshUnreadMessageCount = useCallback(async () => {
    const ready = await refreshSharedUnreadMessageCount({
      authenticated: status === 'authenticated',
    });
    setMessageCountReady(ready);
  }, [status]);

  const clearProfileTabTimer = useCallback(() => {
    if (profileTabTimerRef.current) {
      clearTimeout(profileTabTimerRef.current);
      profileTabTimerRef.current = null;
    }
  }, []);

  const navigateToProfile = useCallback(() => {
    clearProfileTabTimer();
    lastProfileTabPressAtRef.current = 0;
    setProfileMenuVisible(false);
    setOptimisticActiveKey(NATIVE_ISLAND_KEYS.profile);
    router.push((isBrand ? '/catalog' : '/(tabs)/me') as any);
  }, [clearProfileTabTimer, isBrand]);

  const handleProfilePress = useCallback(
    () => {
      if (!canOpenProfileMenu) {
        clearProfileTabTimer();
        lastProfileTabPressAtRef.current = 0;
        router.replace({ pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as any);
        return;
      }

      const now = Date.now();
      const isDoubleTap = now - lastProfileTabPressAtRef.current <= PROFILE_TAB_DOUBLE_TAP_WINDOW_MS;
      clearProfileTabTimer();

      if (isDoubleTap) {
        navigateToProfile();
        return;
      }

      lastProfileTabPressAtRef.current = now;
      profileTabTimerRef.current = setTimeout(() => {
        profileTabTimerRef.current = null;
        lastProfileTabPressAtRef.current = 0;
        setProfileMenuVisible(true);
      }, PROFILE_TAB_DOUBLE_TAP_WINDOW_MS);
    },
    [canOpenProfileMenu, clearProfileTabTimer, navigateToProfile],
  );

  const clearSelectionState = useCallback(() => {
    setOptimisticActiveKey(null);
  }, []);

  const markOptimisticActive = useCallback((item: NativeIslandNavItem) => {
    if (!item.disabled && item.key !== NATIVE_ISLAND_KEYS.bag && item.key !== NATIVE_ISLAND_KEYS.profile) {
      setOptimisticActiveKey(item.key as NativeIslandKey);
    }
  }, []);

  const islandItems = useMemo<NativeIslandNavItem[]>(
    () =>
      buildNativeIslandItems({
        activeKey: displayedActiveKey,
        isBrand,
        profileLabel: profileNavLabel,
        profileIcon: profileNavEmoji,
        profileBadge: canOpenProfileMenu && notificationCountReady ? unreadNotificationCount : undefined,
        inboxBadge: canOpenProfileMenu && messageCountReady ? unreadMessageCount : undefined,
        bagBadge: bagCount.combinedCount,
      }),
    [
      bagCount.combinedCount,
      canOpenProfileMenu,
      displayedActiveKey,
      isBrand,
      messageCountReady,
      notificationCountReady,
      profileNavEmoji,
      profileNavLabel,
      unreadMessageCount,
      unreadNotificationCount,
    ],
  );

  useEffect(() => {
    const unsubscribe = subscribeToNativeIslandCollapse(() => {
      setIsIslandExpanded(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => clearProfileTabTimer();
  }, [clearProfileTabTimer]);

  useEffect(() => {
    navDevLog('island-layout', {
      pathname,
      itemCount: islandItems.length,
      keys: islandItems.map((item) => item.key),
      labels: islandItems.map((item) => item.label),
      activeKey: displayedActiveKey,
      compact: islandItems.length >= 6 || windowWidth < 380,
      collapsed: !isIslandExpanded,
      windowWidth,
      islandWidth,
    });
  }, [displayedActiveKey, isIslandExpanded, islandItems, islandWidth, pathname, windowWidth]);

  useEffect(() => {
    clearProfileTabTimer();
    lastProfileTabPressAtRef.current = 0;
    setIsIslandExpanded(false);
  }, [clearProfileTabTimer, pathname]);

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
      if (item.key === 'profile') {
        handleProfilePress();
        return;
      }

      if (item.key !== NATIVE_ISLAND_KEYS.bag) {
        setOptimisticActiveKey(item.key as NativeIslandKey);
      }

      if (item.key === 'bag') {
        clearProfileTabTimer();
        lastProfileTabPressAtRef.current = 0;
        setProfileMenuVisible(false);
        bagFlow?.openMyBag();
        void refreshGlobalBagCount();
        return;
      }

      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;
      setProfileMenuVisible(false);

      const nextRoute = getNativeIslandRoute(item.key, isBrand);
      if (nextRoute) {
        // Dev-only nav timing for the two primary tab feed switches.
        const navFlow =
          item.key === NATIVE_ISLAND_KEYS.market
            ? 'tabs→market'
            : item.key === NATIVE_ISLAND_KEYS.designs
              ? 'tabs→runway'
              : null;
        if (navFlow) {
          navPerf.tap(navFlow);
          navPerf.navigationCalled();
        }
        router.replace(nextRoute as any);
      }
    },
    [bagFlow, clearProfileTabTimer, handleProfilePress, isBrand, refreshGlobalBagCount],
  );

  useEffect(() => {
    if (optimisticActiveKey && mapPathnameToIslandKey(pathname) === optimisticActiveKey) {
      clearSelectionState();
    }
  }, [clearSelectionState, optimisticActiveKey, pathname]);

  useEffect(() => {
    if (!canOpenProfileMenu) {
      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;
      setProfileMenuVisible(false);
    }
  }, [canOpenProfileMenu, clearProfileTabTimer]);

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
        void refreshUnreadNotificationCount();
      }
    });

    return () => subscription.remove();
  }, [refreshUnreadNotificationCount, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshUnreadMessageCount();
      }
    });

    return () => subscription.remove();
  }, [refreshUnreadMessageCount, status]);

  useEffect(() => {
    if (profileMenuVisible) {
      void refreshUnreadNotificationCount();
    }
    void applyAndroidSystemBarsPolicy(scheme, profileMenuVisible ? 'profile-dropup-open' : 'profile-dropup-closed');
  }, [profileMenuVisible, refreshUnreadNotificationCount, scheme]);

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
      if (profileMenuVisible) {
        setProfileMenuVisible(false);
        return true;
      }

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
  }, [isRootTabPath, profileMenuVisible, toast]);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
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
      </Tabs>

      <NativeIslandBottomNav
        items={islandItems}
        onSelect={handleSelect}
        onPressIn={markOptimisticActive}
        collapsed={!isIslandExpanded}
        onCollapsedPress={() => setIsIslandExpanded(true)}
      />

      <ProfileMenuDropup
        visible={profileMenuVisible}
        onClose={() => {
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          setProfileMenuVisible(false);
          clearSelectionState();
        }}
        onOpenProfile={navigateToProfile}
        onOpenNotifications={() => {
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          setProfileMenuVisible(false);
          clearSelectionState();
          router.push('/notifications' as any);
        }}
        onOpenStudio={() => {
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          setProfileMenuVisible(false);
          clearSelectionState();
          router.push('/studio' as any);
        }}
        onOpenSettings={() => {
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          setProfileMenuVisible(false);
          clearSelectionState();
          navPerf.tap('profile→settings');
          navPerf.navigationCalled();
          router.push('/settings' as any);
        }}
        scheme={scheme}
        theme={theme}
        bottomOffset={NATIVE_ISLAND_NAV.height + islandBottomOffset + 4}
        user={user}
      />
    </>
  );
}
