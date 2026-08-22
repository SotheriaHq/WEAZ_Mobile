import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { getProfileMenuWidth } from '@/components/ui/AppFloatingMenu';
import { IconButton } from '@/components/ui/IconButton';
import { StableImage } from '@/components/ui/StableImage';
import type { AuthUser } from '@/src/auth/AuthContext';
import { useAuth } from '@/src/auth/AuthContext';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { drillDownPush } from '@/src/utils/mobileNavigation';
import { canReadPayouts, getActiveBrandId, isBrandOwner } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';

/** Height of the Studio header, below the safe-area inset. */
const STUDIO_HEADER_HEIGHT = 68;

/**
 * The Studio's identity header — avatar, search, and the profile dropdown.
 *
 * This used to live inside `app/(tabs)/studio/webview.tsx` and therefore
 * existed on exactly one Studio screen. Studio is not one screen: Finance and
 * Staff are native, and a brand landing on either of them lost the avatar, the
 * profile menu, and every route that menu is the only way to reach. The header
 * is the Studio's chrome, so it belongs to the Studio rather than to the
 * WebView that happens to render most of it.
 */

function getDisplayName(user: AuthUser | null) {
  if (!user) return 'Profile';

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return (
    (user.type === 'BRAND' ? user.brandFullName?.trim() : fullName) ||
    (user.type === 'BRAND' ? fullName : user.brandFullName?.trim()) ||
    user.username?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'Profile'
  );
}

export function StudioHeaderActions({
  user,
  onSearchPress,
  onProfilePress,
}: {
  user: AuthUser | null;
  onSearchPress: () => void;
  onProfilePress: () => void;
}) {
  const { theme } = useTheme();
  const displayName = getDisplayName(user);
  const avatar = resolveProfileImageSource(user);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(user) });
  const initials = getAvatarFallback(displayName, user?.username);

  return (
    <View style={styles.headerActions}>
      <IconButton size={44} onPress={onSearchPress} variant="ghost" testID="studio-header-search">
        <AppText variant="subtitle" accessibilityLabel="Open search">
          🔎
        </AppText>
      </IconButton>
      <Pressable
        onPress={onProfilePress}
        accessibilityRole="button"
        accessibilityLabel="Open profile menu"
        style={({ pressed }) => [
          styles.headerAvatarButton,
          { backgroundColor: theme.colors.primarySoft },
          pressed ? styles.pressed : null,
        ]}
        testID="studio-header-profile"
      >
        <StableImage
          uri={avatarUri ?? undefined}
          containerStyle={styles.headerAvatarFill}
          imageStyle={styles.headerAvatarFill}
          fallback={
            <View style={[StyleSheet.absoluteFill, styles.avatarInitialsBg, { backgroundColor: theme.colors.primarySoft }]}>
              <AppText variant="captionBold" tone="primary">{initials}</AppText>
            </View>
          }
        />
      </Pressable>
    </View>
  );
}

type StudioMenuItem = {
  key: string;
  emoji: string;
  label: string;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

export function StudioProfileMenu({
  visible,
  user,
  topOffset: topOffsetProp,
  onClose,
  onOpenProfile,
  onOpenNotifications,
  onOpenOrders,
  onOpenFinance,
  onOpenStaff,
  onOpenHelp,
  onSignOut,
}: {
  visible: boolean;
  user: AuthUser | null;
  /** Defaults to sitting just under the Studio header. */
  topOffset?: number;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenOrders: () => void;
  onOpenFinance: () => void;
  onOpenStaff: () => void;
  onOpenHelp: () => void;
  onSignOut: () => void;
}) {
  const { scheme, theme } = useTheme();
  useAndroidOverlaySystemBars(visible, scheme, 'studio-profile-menu');
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /*
   * The header is a fixed 68pt below the safe area on every Studio screen, so
   * the menu can place itself rather than making each caller pass the same
   * number — which is the sort of duplication that quietly drifts apart.
   */
  const topOffset = topOffsetProp ?? insets.top + STUDIO_HEADER_HEIGHT;
  const displayName = getDisplayName(user);
  const handle = user?.username ? `@${user.username}` : null;
  const avatar = resolveProfileImageSource(user);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: visible && Boolean(user) });
  const initials = getAvatarFallback(displayName, user?.username);
  // Shared with the catalog header's profile menu so the two match. See
  // `getProfileMenuWidth`.
  const menuWidth = getProfileMenuWidth(width);
  const maxHeight = Math.max(260, height - topOffset - tokens.spacing.lg);
  const activeBrandId = getActiveBrandId(user);
  const owner = isBrandOwner(user, activeBrandId);
  const payoutsReadable = canReadPayouts(user, activeBrandId);

  const items: StudioMenuItem[] = [
    {
      key: 'profile',
      emoji: '👤',
      label: 'Profile',
      onPress: onOpenProfile,
    },
    {
      key: 'notifications',
      emoji: '🔔',
      label: 'Notifications',
      onPress: onOpenNotifications,
    },
    {
      key: 'orders',
      emoji: '📦',
      label: 'My Orders',
      onPress: onOpenOrders,
    },
    ...(payoutsReadable
      ? [
          {
            key: 'finance',
            emoji: '💰',
            label: 'Finance',
            onPress: onOpenFinance,
          },
        ]
      : []),
    ...(owner
      ? [
          {
            key: 'staff',
            emoji: '👥',
            label: 'Staff',
            onPress: onOpenStaff,
          },
        ]
      : []),
    {
      key: 'help',
      emoji: '🆘',
      label: 'Help',
      onPress: onOpenHelp,
    },
    {
      key: 'sign-out',
      emoji: '↩️',
      label: 'Sign out',
      tone: 'danger' as const,
      onPress: onSignOut,
    },
  ];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.menuBackdrop} />
        </Pressable>
        <View style={[styles.menuWrap, { top: topOffset, width: menuWidth }]} pointerEvents="box-none">
          <View style={[styles.menuPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.menuIdentity, { borderBottomColor: theme.colors.border }]}>
              <View style={[styles.menuAvatar, { backgroundColor: theme.colors.primarySoft }]}>
                <StableImage
                  uri={avatarUri ?? undefined}
                  containerStyle={styles.menuAvatarFill}
                  imageStyle={styles.menuAvatarFill}
                  fallback={
                    <View style={[StyleSheet.absoluteFill, styles.avatarInitialsBg]}>
                      <AppText variant="subtitle" tone="primary">{initials}</AppText>
                    </View>
                  }
                />
              </View>
              <View style={styles.menuIdentityText}>
                <AppText variant="bodyBold" numberOfLines={2} ellipsizeMode="tail">
                  {displayName}
                </AppText>
                {handle ? (
                  <AppText variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="tail">
                    {handle}
                  </AppText>
                ) : null}
              </View>
            </View>
            <ScrollView
              style={{ maxHeight }}
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.menuContent}
            >
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    item.onPress();
                    onClose();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.menuItem,
                    { borderBottomColor: theme.colors.border },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText variant="subtitle">{item.emoji}</AppText>
                  <View style={styles.menuItemText}>
                    <AppText
                      variant="bodyBold"
                      tone={item.tone === 'danger' ? 'danger' : 'default'}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.label}
                    </AppText>
                  </View>
                  {item.key !== 'sign-out' ? (
                    <AppText variant="subtitle" tone="muted">
                      ›
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}



/**
 * Everything a Studio screen needs to show the profile header, in one call.
 *
 * The destinations behind this menu are the same wherever it is opened from, so
 * they live here rather than being re-declared per screen — that duplication is
 * how Finance and Staff ended up with no menu at all. A screen that needs
 * different behaviour for one entry (the WebView keeps Staff in-place, to avoid
 * tearing down its warm session) overrides just that one.
 */
export function useStudioProfileMenu(overrides?: {
  onOpenStaff?: () => void;
  onOpenSearch?: () => void;
}) {
  const { user, signOut } = useAuth();
  const [visible, setVisible] = useState(false);

  const hasBrandWorkspace = Boolean(getActiveBrandId(user));

  const close = useCallback(() => setVisible(false), []);
  const open = useCallback(() => setVisible(true), []);

  const openProfile = useCallback(() => {
    setVisible(false);
    drillDownPush((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  const openNotifications = useCallback(() => {
    setVisible(false);
    drillDownPush('/notifications' as any);
  }, []);

  const openOrders = useCallback(() => {
    setVisible(false);
    drillDownPush('/orders' as any);
  }, []);

  const openFinance = useCallback(() => {
    setVisible(false);
    drillDownPush('/studio/finance' as any);
  }, []);

  const overrideStaff = overrides?.onOpenStaff;
  const openStaff = useCallback(() => {
    setVisible(false);
    if (overrideStaff) {
      overrideStaff();
      return;
    }
    drillDownPush({ pathname: '/studio', params: { routeKey: 'staff' } } as any);
  }, [overrideStaff]);

  const overrideSearch = overrides?.onOpenSearch;
  const openSearch = useCallback(() => {
    if (overrideSearch) {
      overrideSearch();
      return;
    }
    drillDownPush('/search' as any);
  }, [overrideSearch]);

  const openHelp = useCallback(() => {
    setVisible(false);
    drillDownPush('/settings/help' as any);
  }, []);

  const handleSignOut = useCallback(() => {
    setVisible(false);
    void signOut();
  }, [signOut]);

  return {
    user,
    visible,
    open,
    close,
    openSearch,
    openProfile,
    openNotifications,
    openOrders,
    openFinance,
    openStaff,
    openHelp,
    handleSignOut,
  };
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },

  headerAvatarButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  headerAvatarFill: {
    width: '100%',
    height: '100%',
  },

  avatarInitialsBg: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: {
    opacity: 0.78,
  },

  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: tokens.scrim(0.16),
  },

  menuWrap: {
    position: 'absolute',
    right: tokens.spacing.lg,
    alignItems: 'stretch',
  },

  menuPanel: {
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },

  menuIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
  },

  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  menuAvatarFill: {
    width: '100%',
    height: '100%',
  },

  menuIdentityText: {
    flex: 1,
    minWidth: 0,
  },

  menuContent: {
    paddingVertical: tokens.spacing.xs,
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  menuItemText: {
    flex: 1,
    minWidth: 0,
  },
});
