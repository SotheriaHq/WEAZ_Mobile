import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getNativeIslandLayout,
  NativeIslandBottomNav,
  NATIVE_ISLAND_NAV,
  type NativeIslandNavItem,
} from '@/components/navigation/NativeIslandBottomNav';
import { ProfileMenuDropup } from '@/components/navigation/ProfileMenuDropup';
import { useAuth } from '@/src/auth/AuthContext';
import {
  refreshUnreadNotificationCount as refreshSharedUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';
import { useTheme } from '@/src/theme/ThemeProvider';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

export function CatalogIslandBottomNav() {
  const { scheme, theme } = useTheme();
  const { status, token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const unreadNotificationCount = useUnreadNotificationCount();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<string | null>(null);
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileTabPressAtRef = useRef(0);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const { bottomOffset } = getNativeIslandLayout(windowWidth, insets.bottom);

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

  const handleProfilePress = useCallback(() => {
    setOptimisticActiveKey('profile');

    if (!canOpenProfileMenu) {
      router.push('/(tabs)/me' as any);
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
  }, [canOpenProfileMenu, clearProfileTabTimer, navigateToProfile]);

  const clearSelectionState = useCallback(() => {
    setOptimisticActiveKey(null);
  }, []);

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
    return () => {
      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;
    };
  }, [clearProfileTabTimer]);

  useNotificationRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
  });

  const items = useMemo<NativeIslandNavItem[]>(
    () => [
      { key: 'designs', label: 'Designs', emoji: '🎨', active: optimisticActiveKey === 'designs' },
      { key: 'market', label: 'Market', emoji: '🧭', active: optimisticActiveKey === 'market' },
      ...(isBrand ? [{ key: 'store', label: 'Store', emoji: '🛍️', active: optimisticActiveKey === 'store' }] : []),
      { key: 'inbox', label: 'Messages', emoji: '✉️', active: optimisticActiveKey === 'inbox' },
      {
        key: 'profile',
        label: 'Profile',
        emoji: '👤',
        active: optimisticActiveKey === 'profile' || optimisticActiveKey == null,
        badge: notificationCountReady ? unreadNotificationCount : undefined,
      },
    ],
    [isBrand, notificationCountReady, optimisticActiveKey, unreadNotificationCount],
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
        router.push('/' as any);
      } else if (item.key === 'market') {
        router.push('/(tabs)/discover' as any);
      } else if (item.key === 'store') {
        router.push('/(tabs)/store' as any);
      } else if (item.key === 'inbox') {
        router.push('/(tabs)/inbox' as any);
      }
    },
    [clearProfileTabTimer, handleProfilePress],
  );

  return (
    <>
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
        bottomOffset={NATIVE_ISLAND_NAV.height + bottomOffset + 4}
        user={user}
      />
    </>
  );
}

export default CatalogIslandBottomNav;
