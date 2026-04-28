import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ProfileMenuDropup } from '@/components/navigation/ProfileMenuDropup';
import { useAuth } from '@/src/auth/AuthContext';
import { NotificationsApi } from '@/src/api/NotificationsApi';
import { GLASS, LAYOUT, tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  resetUnreadNotificationCount,
  replaceUnreadNotificationCount,
  useNotificationRealtimeChannel,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';

const TAB_BAR_HEIGHT = LAYOUT.TAB_BAR_HEIGHT;
const PROFILE_TAB_DOUBLE_TAP_WINDOW_MS = 260;

function TabIcon({
  label,
  emoji,
  focused,
  badge,
}: {
  label: string;
  emoji: string;
  focused: boolean;
  badge?: number;
}) {
  const { theme } = useTheme();
  const chipStyle = focused ? [styles.tabChip, { backgroundColor: theme.colors.primarySoft }] : styles.tabChip;
  return (
    <View style={styles.tabIconWrap}>
      <View style={styles.tabGlyphWrap}>
        <View style={chipStyle}>
          <Text style={[styles.tabEmoji, { fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }]}>
            {emoji}
          </Text>
          <AppText
            variant={focused ? 'captionBold' : 'captionRegular'}
            tone={focused ? 'primary' : 'muted'}
            style={focused ? styles.tabLabelActive : styles.tabLabelInactive}
          >
            {label}
          </AppText>
        </View>
        {typeof badge === 'number' && badge > 0 ? (
          <View style={styles.badgeWrap} pointerEvents="none">
            <View style={[styles.badge, { backgroundColor: theme.colors.badgeRed }]}>
              <AppText variant="captionBold" tone="inverse">
                {badge > 99 ? '99+' : badge}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { scheme, theme, setMode } = useTheme();
  const { status, token, user } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const inboxBadgeCount = useUnreadNotificationCount();
  const profileTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileTabPressAtRef = useRef(0);
  const lastBackPressAtRef = useRef(0);

  const isBrand = user?.type === 'BRAND';
  const canOpenProfileMenu = status === 'authenticated';
  const active = theme.colors.primary;
  const inactive = theme.colors.textMuted;
  const glass = scheme === 'dark' ? GLASS.dark : GLASS.light;
  const isRootTabPath =
    pathname === '/' ||
    pathname === '/discover' ||
    pathname === '/store' ||
    pathname === '/inbox' ||
    pathname === '/me' ||
    pathname === '/(tabs)';

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
    if (status !== 'authenticated') {
      resetUnreadNotificationCount();
      return;
    }

    void NotificationsApi.getUnreadCount()
      .then(({ count }) => {
        replaceUnreadNotificationCount(count);
      })
      .catch(() => {
        replaceUnreadNotificationCount(0);
      });
  }, [status, user?.id]);

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
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundColor: glass.bg,
                    borderRadius: 28,
                    overflow: 'hidden',
                  },
                ]}
              />
            </View>
          ),
          tabBarStyle: {
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: tokens.spacing.sm,
            paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
            overflow: 'hidden',
            borderRadius: 28,
            zIndex: 100,
          },
          tabBarItemStyle: {
            flex: 1,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Designs',
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Designs" emoji="🎨" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="discover"
          options={{
            title: 'Market',
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Market" emoji="🧭" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="store"
          options={{
            title: 'Store',
            href: isBrand ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Store" emoji="🛍️" focused={focused} />
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
              <TabIcon label="Inbox" emoji="✉️" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="me"
          listeners={{
            tabPress: handleProfileTabPress,
          }}
          options={{
            title: 'You',
            tabBarIcon: ({ focused }) => (
              <TabIcon label="You" emoji="👤" focused={focused || profileMenuVisible} badge={inboxBadgeCount} />
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
        onToggleTheme={() => {
          setMode(scheme === 'dark' ? 'light' : 'dark');
        }}
        scheme={scheme}
        theme={theme}
        bottomOffset={TAB_BAR_HEIGHT + insets.bottom + 4}
        user={user}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabBarBg: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 54,
  },
  tabChip: {
    minWidth: 54,
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabEmoji: {
    lineHeight: 24,
  },
  tabGlyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 28,
  },
  tabLabelInactive: {
    opacity: 0.6,
  },
  tabLabelActive: {
    opacity: 1,
  },
  badgeWrap: {
    position: 'absolute',
    top: -6,
    right: -12,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
  },
});
