import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';

import {
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
import {
  refreshUnreadMessageCount as refreshSharedUnreadMessageCount,
  useMessagingRealtimeChannel,
  useUnreadMessageCount,
} from '@/src/realtime/messaging';
import { useTheme } from '@/src/theme/ThemeProvider';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useScreenChrome } from '@/src/system/ScreenChrome';

const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;
const NAV_EMOJI = {
  designs: String.fromCodePoint(0x1F9F5),
  market: String.fromCodePoint(0x1F6CD),
  inbox: String.fromCodePoint(0x2709, 0xFE0F),
  profile: String.fromCodePoint(0x1F464),
} as const;

function mapPathnameToIslandKey(pathname: string): string {
  if (pathname === '/catalog' || pathname.startsWith('/catalog/')) return 'profile';
  if (pathname === '/discover') return 'market';
  if (pathname === '/inbox') return 'inbox';
  if (pathname === '/me' || pathname === '/me-edit') return 'profile';
  return 'designs';
}

export function CatalogIslandBottomNav() {
  const { scheme, theme } = useTheme();
  const { status, token, user } = useAuth();
  const pathname = usePathname();
  const { islandLayout } = useScreenChrome();
  const unreadNotificationCount = useUnreadNotificationCount();
  const unreadMessageCount = useUnreadMessageCount();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const [notificationCountReady, setNotificationCountReady] = useState(false);
  const [messageCountReady, setMessageCountReady] = useState(false);
  const [optimisticActiveKey, setOptimisticActiveKey] = useState<string | null>(null);
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileTabPressAtRef = useRef(0);

  const isBrand = hasActiveBrandMembership(user);
  const canOpenProfileMenu = status === 'authenticated';
  const { bottomOffset } = islandLayout;
  const activeIslandKey = useMemo(() => {
    if (profileMenuVisible) return 'profile';
    return mapPathnameToIslandKey(pathname);
  }, [pathname, profileMenuVisible]);
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

  const markOptimisticActive = useCallback((item: NativeIslandNavItem) => {
    if (!item.disabled) {
      setOptimisticActiveKey(item.key);
    }
  }, []);

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
    return () => {
      clearProfileTabTimer();
      lastProfileTabPressAtRef.current = 0;
    };
  }, [clearProfileTabTimer]);

  useEffect(() => {
    if (optimisticActiveKey && mapPathnameToIslandKey(pathname) === optimisticActiveKey) {
      clearSelectionState();
    }
  }, [clearSelectionState, optimisticActiveKey, pathname]);

  useEffect(() => {
    setIsIslandExpanded(false);
  }, [pathname]);

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

  const items = useMemo<NativeIslandNavItem[]>(
    () => [
      { key: 'designs', label: 'Runway', emoji: NAV_EMOJI.designs, active: displayedActiveKey === 'designs' },
      { key: 'market', label: 'Market', emoji: NAV_EMOJI.market, active: displayedActiveKey === 'market' },
      {
        key: 'inbox',
        label: 'Messages',
        emoji: NAV_EMOJI.inbox,
        active: displayedActiveKey === 'inbox',
        badge: messageCountReady ? unreadMessageCount : undefined,
      },
      {
        key: 'profile',
        label: 'Profile',
        emoji: '👤',
        active: displayedActiveKey === 'profile',
        badge: notificationCountReady ? unreadNotificationCount : undefined,
      },
    ],
    [displayedActiveKey, messageCountReady, notificationCountReady, unreadMessageCount, unreadNotificationCount],
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
      } else if (item.key === 'inbox') {
        router.replace('/(tabs)/inbox' as any);
      }
    },
    [clearProfileTabTimer, handleProfilePress],
  );

  return (
    <>
      <NativeIslandBottomNav
        items={items}
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
        scheme={scheme}
        theme={theme}
        bottomOffset={NATIVE_ISLAND_NAV.height + bottomOffset + 4}
        user={user}
      />
    </>
  );
}

export default CatalogIslandBottomNav;
