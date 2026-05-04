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
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  refreshUnreadNotificationCount as refreshSharedUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

export default function TabLayout() {
  const { scheme, theme, setMode } = useTheme();
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

  const isBrand = user?.type === 'BRAND';
  const canOpenProfileMenu = status === 'authenticated';
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
    if (profileMenuVisible || pathname === '/me' || pathname === '/me-edit') {
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
  }, [pathname, profileMenuVisible]);

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
    router.push((isBrand ? '/catalog' : '/(tabs)/me') as any);
  }, [clearProfileTabTimer, isBrand]);

  const handleProfilePress = useCallback(
    () => {
      if (!canOpenProfileMenu) {
        router.replace('/(tabs)/me' as any);
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

  const items = useMemo<NativeIslandNavItem[]>(
    () => [
      { key: 'designs', label: 'Designs', emoji: '🎨', active: activeIslandKey === 'designs' },
      { key: 'market', label: 'Market', emoji: '🧭', active: activeIslandKey === 'market' },
      ...(isBrand ? [{ key: 'store', label: 'Store', emoji: '🛍️', active: activeIslandKey === 'store' }] : []),
      { key: 'inbox', label: 'Messages', emoji: '✉️', active: activeIslandKey === 'inbox' },
      {
        key: 'profile',
        label: 'Profile',
        emoji: '👤',
        active: activeIslandKey === 'profile',
        badge: notificationCountReady ? unreadNotificationCount : undefined,
      },
    ],
    [activeIslandKey, isBrand, notificationCountReady, unreadNotificationCount],
  );

  const handleSelect = useCallback(
    (item: NativeIslandNavItem) => {
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
            title: 'Profile',
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

      <NativeIslandBottomNav items={items} onSelect={handleSelect} />

      <ProfileMenuDropup
        visible={profileMenuVisible}
        onClose={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
        }}
        onOpenProfile={navigateToProfile}
        onOpenNotifications={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          router.push('/notifications' as any);
        }}
        onOpenStudio={() => {
          setProfileMenuVisible(false);
          clearProfileTabTimer();
          lastProfileTabPressAtRef.current = 0;
          router.push('/studio' as any);
        }}
        onToggleTheme={() => {
          setMode(scheme === 'dark' ? 'light' : 'dark');
        }}
        scheme={scheme}
        theme={theme}
        bottomOffset={NATIVE_ISLAND_NAV.height + islandBottomOffset + 4}
        user={user}
      />
    </>
  );
}
