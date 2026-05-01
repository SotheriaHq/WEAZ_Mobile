import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getNativeIslandLayout,
  NativeIslandTabIcon,
  NATIVE_ISLAND_NAV,
} from '@/components/navigation/NativeIslandBottomNav';
import { ProfileMenuDropup } from '@/components/navigation/ProfileMenuDropup';
import { useAuth } from '@/src/auth/AuthContext';
import { NotificationsApi } from '@/src/api/NotificationsApi';
import { GLASS } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  resetUnreadNotificationCount,
  replaceUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';

const TAB_BAR_HEIGHT = NATIVE_ISLAND_NAV.height;
const TAB_BAR_RADIUS = NATIVE_ISLAND_NAV.radius;
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
  const active = theme.colors.primary;
  const inactive = theme.colors.textMuted;
  const glass = scheme === 'dark' ? GLASS.dark : GLASS.light;
  const { bottomOffset: tabBarBottomOffset, sideOffset: tabBarSideOffset } = getNativeIslandLayout(
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

  const refreshUnreadNotificationCount = useCallback(async () => {
    if (status !== 'authenticated') {
      resetUnreadNotificationCount();
      setNotificationCountReady(false);
      return;
    }

    try {
      const { count } = await NotificationsApi.getUnreadCount();
      replaceUnreadNotificationCount(count);
      setNotificationCountReady(true);
    } catch {
      resetUnreadNotificationCount();
      setNotificationCountReady(false);
    }
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

  const handleProfileTabPress = useCallback(
    (event: { preventDefault: () => void }) => {
      if (!canOpenProfileMenu) {
        return;
      }

      event.preventDefault();

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
          tabBarShowLabel: false,
          tabBarActiveTintColor: active,
          tabBarInactiveTintColor: inactive,
          tabBarBackground: () => (
            <View style={styles.tabBarBg}>
              <BlurView
                tint={scheme === 'dark' ? 'dark' : 'light'}
                intensity={glass.blur}
                style={StyleSheet.absoluteFillObject}
              />
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  styles.tabBarGlassFill,
                  {
                    backgroundColor: glass.bgStrong,
                    borderColor: theme.colors.border,
                    borderRadius: TAB_BAR_RADIUS,
                  },
                ]}
              />
            </View>
          ),
          tabBarStyle: {
            position: 'absolute',
            left: tabBarSideOffset,
            right: tabBarSideOffset,
            bottom: tabBarBottomOffset,
            alignSelf: 'center',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 10,
            shadowColor: theme.colors.bg,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: scheme === 'dark' ? 0.24 : 0.12,
            shadowRadius: 18,
            height: TAB_BAR_HEIGHT,
            paddingTop: 0,
            paddingBottom: 0,
            paddingHorizontal: 4,
            overflow: 'visible',
            borderRadius: TAB_BAR_RADIUS,
            zIndex: 100,
          },
          tabBarItemStyle: {
            flex: 1,
            paddingHorizontal: 0,
            paddingVertical: 0,
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Designs',
            tabBarIcon: ({ focused }) => (
              <NativeIslandTabIcon label="Designs" emoji="🎨" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="discover"
          options={{
            title: 'Market',
            tabBarIcon: ({ focused }) => (
              <NativeIslandTabIcon label="Market" emoji="🧭" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="store"
          options={{
            title: 'Store',
            href: isBrand ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <NativeIslandTabIcon label="Store" emoji="🛍️" focused={focused} />
            ),
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
            title: 'Inbox',
            tabBarIcon: ({ focused }) => (
              <NativeIslandTabIcon label="Inbox" emoji="✉️" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="me"
          listeners={{
            tabPress: handleProfileTabPress,
          }}
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => (
              <NativeIslandTabIcon
                label="Profile"
                emoji="👤"
                focused={focused || profileMenuVisible}
                badge={notificationCountReady ? unreadNotificationCount : undefined}
              />
            ),
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
        bottomOffset={TAB_BAR_HEIGHT + tabBarBottomOffset + 4}
        user={user}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabBarBg: {
    flex: 1,
    borderRadius: TAB_BAR_RADIUS,
    overflow: 'hidden',
  },
  tabBarGlassFill: {
    borderRadius: TAB_BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
