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
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  refreshUnreadNotificationCount as refreshSharedUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

export default function TabLayout() {
  const { scheme, theme } = useTheme();
  const { status, token, user } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const unreadNotificationCount = useUnreadNotificationCount();
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileTabPressAtRef = useRef(0);
  const lastBackPressAtRef = useRef(0);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<string | null>(null);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const profileNavLabel = canOpenProfileMenu ? 'Profile' : 'Sign In';
  const profileNavEmoji = canOpenProfileMenu ? '👤' : '🔐';
  const { bottomOffset: islandBottomOffset } = getNativeIslandLayout(
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
    if (profileMenuVisible || (canOpenProfileMenu && (pathname === '/me' || pathname === '/me-edit'))) {
      return 'profile';
    }
    if (pathname === '/discover') {
      return 'market';
    }
    if (pathname === '/store') {
      return 'store';
    }
    if (pathname === '/inbox') {
      return 'inbox';
    }
    return 'designs';
  }, [canOpenProfileMenu, pathname, profileMenuVisible]);
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
      setOptimisticActiveKey('profile');

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

  const items = useMemo<NativeIslandNavItem[]>(
    () => [
      { key: 'designs', label: 'Designs', emoji: '🎨', active: displayedActiveKey === 'designs' },
      { key: 'market', label: 'Market', emoji: '🧭', active: displayedActiveKey === 'market' },
      ...(isBrand ? [{ key: 'store', label: 'Store', emoji: '🛍️', active: displayedActiveKey === 'store' }] : []),
      { key: 'inbox', label: 'Messages', emoji: '✉️', active: displayedActiveKey === 'inbox' },
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

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
      setOptimisticActiveKey(item.key);

      if (item.key === 'profile') {
        handleProfilePress();
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
    [clearProfileTabTimer, handleProfilePress],
  );

  useEffect(() => {
    clearSelectionState();
  }, [pathname, clearSelectionState]);

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
  }, [profileMenuVisible, refreshUnreadNotificationCount]);

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
        items={items}
        onSelect={handleSelect}
        onPressIn={(item) => {
          setOptimisticActiveKey(item.key);
        }}
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
        scheme={scheme}
        theme={theme}
        bottomOffset={NATIVE_ISLAND_NAV.height + islandBottomOffset + 4}
        user={user}
      />
    </>
  );
}
