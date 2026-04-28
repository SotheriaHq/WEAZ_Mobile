import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
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

const TAB_BAR_HEIGHT = 64;
const TAB_BAR_RADIUS = TAB_BAR_HEIGHT / 2;
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
  const chipStyle = [
    styles.tabChip,
    focused
      ? {
          backgroundColor: theme.colors.primary,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.26,
          shadowRadius: 14,
          elevation: 8,
        }
      : styles.tabChipInactive,
  ];
  return (
    <View style={styles.tabIconWrap}>
      <View style={styles.tabGlyphWrap}>
        <View style={chipStyle}>
          <View style={styles.tabGlyphStack}>
            <View style={styles.tabEmojiWrap}>
              <Text style={[styles.tabEmoji, { fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.72 }]}>
                {emoji}
              </Text>
            </View>
            <View style={styles.tabLabelWrap}>
              <AppText
                variant="captionBold"
                tone={focused ? 'inverse' : 'secondary'}
                numberOfLines={1}
                style={focused ? styles.tabLabelActive : styles.tabLabelInactive}
              >
                {label}
              </AppText>
            </View>
          </View>
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
  const tabBarBottomOffset = Math.max(insets.bottom, 10);
  const tabBarSideOffset = isBrand ? 20 : 28;
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
                style={StyleSheet.absoluteFillObject}
              />
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  styles.tabBarGlassFill,
                  {
                    backgroundColor:
                      scheme === 'dark' ? 'rgba(11, 15, 23, 0.88)' : 'rgba(255, 255, 255, 0.9)',
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
            maxWidth: isBrand ? 360 : 420,
            alignSelf: 'center',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: scheme === 'dark' ? 0.24 : 0.12,
            shadowRadius: 18,
            height: TAB_BAR_HEIGHT,
            paddingTop: 0,
            paddingBottom: 0,
            paddingHorizontal: isBrand ? 6 : 10,
            overflow: 'visible',
            borderRadius: TAB_BAR_RADIUS,
            zIndex: 100,
          },
          tabBarItemStyle: {
            flex: 1,
            minWidth: isBrand ? 60 : 70,
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
  tabIconWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  tabChip: {
    width: 'auto',
    maxWidth: '100%',
    minWidth: 60,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  tabChipInactive: {
    backgroundColor: 'transparent',
  },
  tabEmoji: {
    lineHeight: 20,
    textAlign: 'center',
  },
  tabGlyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minWidth: 58,
  },
  tabGlyphStack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  tabEmojiWrap: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabelInactive: {
    opacity: 0.9,
    textAlign: 'center',
    flexShrink: 0,
  },
  tabLabelActive: {
    opacity: 1,
    textAlign: 'center',
    flexShrink: 0,
  },
  tabLabelWrap: {
    minHeight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
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
