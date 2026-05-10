import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, useWindowDimensions } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getNativeIslandLayout,
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
import { navDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { applyAndroidSystemBarsPolicy } from '@/src/system/AndroidSystemBars';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

function mapPathnameToIslandKey(pathname: string): string {
  if (pathname === '/catalog' || pathname.startsWith('/catalog/')) return 'profile';
  if (pathname === '/discover') return 'market';
  if (pathname === '/store') return 'store';
  if (pathname === '/inbox') return 'inbox';
  if (pathname === '/me' || pathname === '/me-edit') return 'profile';
  return 'designs';
}

export default function TabLayout() {
  const { scheme, theme } = useTheme();
  const { status, token, user } = useAuth();
  const toast = useToast();
  const bagFlow = useBagFlow();
  const { count: bagCount, refreshGlobalBagCount } = useBagCount();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const unreadNotificationCount = useUnreadNotificationCount();
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileTabPressAtRef = useRef(0);
  const lastBackPressAtRef = useRef(0);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<string | null>(null);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const profileNavLabel = canOpenProfileMenu ? 'Me' : 'Sign In';
  const profileNavEmoji = canOpenProfileMenu ? '👤' : '🔐';
  const { bottomOffset: islandBottomOffset, islandWidth } = getNativeIslandLayout(
    windowWidth,
    insets.bottom,
  );
  const isRootTabPath =
    pathname === '/' ||
    pathname === '/discover' ||
    pathname === '/store' ||
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

  const clearProfileTabTimer = useCallback(() => {
    if (profileTabTimerRef.current) {
      clearTimeout(profileTabTimerRef.current);
      profileTabTimerRef.current = null;
    }
  }, []);

  const navigateToProfile = useCallback(() => {
    setProfileMenuVisible(false);
    clearProfileTabTimer();
    lastProfileTabPressAtRef.current = 0;
    setOptimisticActiveKey('profile');
    router.push((isBrand ? '/catalog' : '/(tabs)/me') as any);
  }, [clearProfileTabTimer, isBrand]);

  const handleProfilePress = useCallback(
    () => {
      if (!canOpenProfileMenu) {
        router.replace({ pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as any);
        return;
      }

      const now = Date.now();
      const isSecondTap =
        lastProfileTabPressAtRef.current > 0 &&
        now - lastProfileTabPressAtRef.current <= PROFILE_TAB_DOUBLE_TAP_WINDOW_MS;

      if (isSecondTap) {
        navigateToProfile();
        return;
      }

      lastProfileTabPressAtRef.current = now;
      clearProfileTabTimer();
      profileTabTimerRef.current = setTimeout(() => {
        setProfileMenuVisible(true);
        profileTabTimerRef.current = null;
        lastProfileTabPressAtRef.current = 0;
      }, PROFILE_TAB_DOUBLE_TAP_WINDOW_MS);
    },
    [canOpenProfileMenu, clearProfileTabTimer, navigateToProfile],
  );

  const clearSelectionState = useCallback(() => {
    setOptimisticActiveKey(null);
  }, []);

  const markOptimisticActive = useCallback((item: NativeIslandNavItem) => {
    if (!item.disabled && item.key !== 'profile') {
      setOptimisticActiveKey(item.key);
    }
  }, []);

  const items = useMemo<NativeIslandNavItem[]>(
    () => [
      { key: 'designs', label: 'Designs', emoji: '🎨', active: displayedActiveKey === 'designs' },
      { key: 'market', label: 'Market', emoji: '🧭', active: displayedActiveKey === 'market' },
      ...(isBrand ? [{ key: 'store', label: 'Store', emoji: '🛍️', active: displayedActiveKey === 'store' }] : []),
      { key: 'inbox', label: 'Msgs', emoji: '✉️', active: displayedActiveKey === 'inbox' },
      {
        key: 'profile',
        label: profileNavLabel,
        emoji: profileNavEmoji,
        active: displayedActiveKey === 'profile',
        badge: canOpenProfileMenu && notificationCountReady ? unreadNotificationCount : undefined,
      },
    ],
    [displayedActiveKey, canOpenProfileMenu, isBrand, notificationCountReady, profileNavEmoji, profileNavLabel, unreadNotificationCount],
  );

  const islandItems = useMemo<NativeIslandNavItem[]>(() => {
    const bagItem: NativeIslandNavItem = {
      key: 'bag',
      label: 'Bag',
      emoji: '🧺',
      active: displayedActiveKey === 'bag',
      badge: bagCount.combinedCount,
    };
    const inboxIndex = items.findIndex((item) => item.key === 'inbox');
    if (inboxIndex < 0) return [...items, bagItem];
    return [
      ...items.slice(0, inboxIndex),
      bagItem,
      ...items.slice(inboxIndex),
    ];
  }, [bagCount.combinedCount, displayedActiveKey, items]);

  useEffect(() => {
    const unsubscribe = subscribeToNativeIslandCollapse(() => {
      setIsIslandExpanded(false);
    });
    return unsubscribe;
  }, []);

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
    setIsIslandExpanded(false);
  }, [pathname]);

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
      if (item.key === 'profile') {
        setIsIslandExpanded(false);
        handleProfilePress();
        return;
      }

      setIsIslandExpanded(false);
      setOptimisticActiveKey(item.key);

      if (item.key === 'bag') {
        bagFlow?.openMyBag();
        void refreshGlobalBagCount();
        return;
      }

      setProfileMenuVisible(false);
      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;

      if (item.key === 'designs') {
        router.replace('/' as any);
      } else if (item.key === 'market') {
        router.replace('/(tabs)/discover' as any);
      } else if (item.key === 'store') {
        router.replace('/(tabs)/store' as any);
      } else if (item.key === 'inbox') {
        router.replace('/(tabs)/inbox' as any);
      }
    },
    [bagFlow, clearProfileTabTimer, handleProfilePress, refreshGlobalBagCount],
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
    return () => {
      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;
    };
  }, [clearProfileTabTimer]);

  useEffect(() => {
    setNotificationCountReady(false);
    void refreshUnreadNotificationCount();
  }, [refreshUnreadNotificationCount, user?.id]);

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
    if (profileMenuVisible) {
      void refreshUnreadNotificationCount();
    }
    applyAndroidSystemBarsPolicy(scheme, profileMenuVisible ? 'profile-dropup-open' : 'profile-dropup-closed');
  }, [profileMenuVisible, refreshUnreadNotificationCount, scheme]);

  useNotificationRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (profileMenuVisible) {
        setProfileMenuVisible(false);
        clearProfileTabTimer();
        lastProfileTabPressAtRef.current = 0;
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
  }, [clearProfileTabTimer, isRootTabPath, profileMenuVisible, toast]);

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
            title: 'Designs',
          }}
        />

        <Tabs.Screen
          name="discover"
          options={{
            title: 'Market',
          }}
        />

        <Tabs.Screen
          name="store"
          options={{
            title: 'Store',
            href: isBrand ? undefined : null,
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
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          clearSelectionState();
        }}
        onOpenProfile={navigateToProfile}
        onOpenNotifications={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          clearSelectionState();
          router.push('/notifications' as any);
        }}
        onOpenStudio={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          clearSelectionState();
          router.push('/studio' as any);
        }}
        onOpenSettings={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          clearSelectionState();
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
