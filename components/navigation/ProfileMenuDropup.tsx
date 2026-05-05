import React from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens, type AppTheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';

type ProfileMenuDropupProps = {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenStudio?: () => void;
  onToggleTheme: () => void;
  scheme: 'light' | 'dark';
  theme: AppTheme;
  bottomOffset: number;
  user: AuthUser | null;
};

function getDisplayName(user: AuthUser | null) {
  if (!user) return 'Your profile';

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const name =
    (user.type === 'BRAND' ? user.brandFullName?.trim() : fullName) ||
    (user.type === 'BRAND' ? fullName : user.brandFullName?.trim()) ||
    user.username?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'Profile';

  return name;
}

export function ProfileMenuDropup({
  visible,
  onClose,
  onOpenProfile,
  onOpenNotifications,
  onOpenStudio,
  onToggleTheme,
  scheme,
  theme,
  bottomOffset,
  user,
}: ProfileMenuDropupProps) {
  const { signOut } = useAuth();
  const { scheme: liveScheme, theme: liveTheme } = useTheme();
  const { height, width } = useWindowDimensions();
  const activeScheme = liveScheme ?? scheme;
  const activeTheme = liveTheme ?? theme;
  const isDark = activeScheme === 'dark';
  const themeEmoji = isDark ? '☀️' : '🌙';
  const [mounted, setMounted] = React.useState(visible);
  const translateY = React.useRef(new Animated.Value(18)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  const displayName = getDisplayName(user);
  const handle = user?.username ? `@${user.username}` : null;
  const avatar = resolveProfileImageSource(user);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: mounted });
  const initials = getAvatarFallback(displayName, user?.username);
  const availableMenuHeight = Math.max(264, height - bottomOffset - tokens.spacing.xl);
  const menuHeight = Math.min(availableMenuHeight, 340);
  const availableMenuWidth = Math.max(220, width - tokens.spacing.md * 2);
  const menuWidth = Math.min(Math.max(220, Math.round(width * 0.7)), Math.min(300, availableMenuWidth));

  const runCloseAnimation = React.useCallback(
    (onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 18,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          onDone?.();
        }
      });
    },
    [opacity, translateY],
  );

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(18);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (mounted) {
      runCloseAnimation();
    }
  }, [mounted, opacity, runCloseAnimation, translateY, visible]);

  const handleClose = React.useCallback(() => {
    runCloseAnimation(onClose);
  }, [onClose, runCloseAnimation]);

  const handleSignOut = React.useCallback(() => {
    runCloseAnimation(() => {
      onClose();
      void signOut();
    });
  }, [onClose, runCloseAnimation, signOut]);

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        </Pressable>

        <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.menu,
              {
                borderColor: activeTheme.colors.border,
                width: menuWidth,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <BlurView
              tint={isDark ? 'dark' : 'light'}
              intensity={38}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.72)',
                },
              ]}
            />
            <ScrollView
              scrollEnabled={true}
              nestedScrollEnabled={true}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.menuContent}
              style={{ height: menuHeight, maxHeight: availableMenuHeight }}
            >
              <Pressable
                onPress={onOpenProfile}
                accessibilityRole="button"
                accessibilityLabel={`Open profile for ${displayName}`}
                style={({ pressed }) => [styles.identity, { borderBottomColor: activeTheme.colors.border }, pressed && styles.pressed]}
              >
                <View style={[styles.avatar, { backgroundColor: activeTheme.colors.primarySoft }]}> 
                  {avatarUri ? (
                    <StableImage uri={avatarUri} containerStyle={styles.avatarImage} imageStyle={styles.avatarImage} />
                  ) : (
                    <AppText variant="subtitle" tone="primary">
                      {initials}
                    </AppText>
                  )}
                </View>
                <View style={styles.textWrap}>
                  <View style={styles.nameRow}>
                    <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail" style={styles.nameText}>
                      {displayName}
                    </AppText>
                    <Pressable
                      onPress={onToggleTheme}
                      style={({ pressed }) => [styles.themeButton, pressed && styles.pressed]}
                      accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    >
                      <AppText variant="subtitle">{themeEmoji}</AppText>
                    </Pressable>
                  </View>
                  {handle ? (
                    <AppText variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="tail" style={styles.handleText}>
                      {handle}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>

              <Pressable
                onPress={onOpenNotifications}
                accessibilityRole="button"
                accessibilityLabel="Open notifications"
                style={({ pressed }) => [styles.item, { borderBottomColor: activeTheme.colors.border }, pressed && styles.pressed]}
              >
                <AppText variant="subtitle">🔔</AppText>
                <View style={styles.textWrap}>
                  <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                    Notifications
                  </AppText>
                </View>
              </Pressable>

              {user?.type === 'BRAND' && onOpenStudio ? (
                <Pressable
                  onPress={onOpenStudio}
                  accessibilityRole="button"
                  accessibilityLabel="Open studio"
                  style={({ pressed }) => [styles.item, { borderBottomColor: activeTheme.colors.border }, pressed && styles.pressed]}
                >
                  <AppText variant="subtitle">🧵</AppText>
                  <View style={styles.textWrap}>
                    <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                      Studio
                    </AppText>
                  </View>
                </Pressable>
              ) : null}

              <Pressable
                onPress={onOpenProfile}
                accessibilityRole="button"
                accessibilityLabel="View full profile"
                style={({ pressed }) => [styles.item, { borderBottomColor: activeTheme.colors.border }, pressed && styles.pressed]}
              >
                <AppText variant="subtitle">👤</AppText>
                <View style={styles.textWrap}>
                  <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                    View full profile
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                style={({ pressed }) => [styles.item, { borderTopColor: activeTheme.colors.border }, styles.signOutItem, pressed && styles.pressed]}
              >
                <AppText variant="subtitle">🚪</AppText>
                <View style={styles.textWrap}>
                  <AppText variant="bodyBold" tone="danger" numberOfLines={1} ellipsizeMode="tail">
                    Sign Out
                  </AppText>
                </View>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  wrap: {
    position: 'absolute',
    right: tokens.spacing.sm,
    alignItems: 'flex-end',
  },
  menu: {
    minWidth: 220,
    maxWidth: 300,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 14,
  },
  menuContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    minHeight: 64,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameText: {
    flex: 1,
    flexShrink: 1,
  },
  handleText: {
    flexShrink: 1,
  },
  themeButton: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    minHeight: 48,
  },
  signOutItem: {
    borderTopWidth: 1,
    borderBottomWidth: 0,
  },
  pressed: {
    opacity: 0.78,
  },
});
