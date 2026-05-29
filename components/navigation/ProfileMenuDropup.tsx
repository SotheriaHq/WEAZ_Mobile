import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import ThreadlyLogoLoader from '@/components/ui/ThreadlyLogoLoader';
import { brandApi } from '@/src/api/BrandApi';
import { ProfileApi } from '@/src/api/ProfileApi';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { getActiveBrandId, hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { profileMenuAvatarDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { tokens, type AppTheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ResolvedTheme } from '@/src/types/theme';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';

type ProfileMenuDropupProps = {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenStudio?: () => void;
  onOpenSettings?: () => void;
  scheme: ResolvedTheme;
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
  onOpenSettings,
  theme,
  bottomOffset,
  user,
}: ProfileMenuDropupProps) {
  const { signOut, updateUser } = useAuth();
  const { theme: liveTheme } = useTheme();
  const { height, width } = useWindowDimensions();
  const activeTheme = liveTheme ?? theme;
  const [mounted, setMounted] = React.useState(visible);
  const translateY = React.useRef(new Animated.Value(18)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const avatarHydrationKeyRef = React.useRef<string | null>(null);

  const displayName = getDisplayName(user);
  const handle = user?.username ? `@${user.username}` : null;
  const hasBrandWorkspace = hasActiveBrandMembership(user);
  const avatar = resolveProfileImageSource(user);
  const hasAvatarSource = Boolean(avatar.src || avatar.fileId);
  const { uri: avatarUri, loading: avatarLoading } = useResolvedImageAsset({
    src: avatar.src,
    fileId: avatar.fileId,
    enabled: mounted && hasAvatarSource,
  });
  const initials = getAvatarFallback(displayName, user?.username);
  const availableMenuHeight = Math.max(0, height - bottomOffset - tokens.spacing.sm);
  const menuMaxHeight = Math.min(360, availableMenuHeight);
  const availableMenuWidth = Math.max(0, width - tokens.spacing.md * 2);
  const menuWidth = Math.min(Math.max(196, Math.round(width * 0.46)), Math.min(236, availableMenuWidth));

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
    if (!__DEV__) return;
    let host: string | null = null;
    const candidate = avatarUri ?? avatar.src ?? null;
    if (candidate) {
      try {
        host = new URL(candidate).hostname;
      } catch {
        host = null;
      }
    }
    profileMenuAvatarDevLog('summary', {
      hasSrc: Boolean(avatar.src),
      hasFileId: Boolean(avatar.fileId),
      host,
      resolved: Boolean(avatarUri),
    });
  }, [avatar.fileId, avatar.src, avatarUri]);

  React.useEffect(() => {
    if (!visible || !user?.id || hasAvatarSource) return;

    const hydrationKey = `${user.id}:${getActiveBrandId(user) ?? 'buyer'}`;
    if (avatarHydrationKeyRef.current === hydrationKey) return;
    avatarHydrationKeyRef.current = hydrationKey;

    let cancelled = false;
    void (async () => {
      try {
        if (hasBrandWorkspace) {
          const brandId = getActiveBrandId(user) ?? user.id;
          const profile = await brandApi.getProfileById(brandId);
          const resolved = resolveProfileImageSource(profile as any);
          if (!cancelled && (resolved.src || resolved.fileId)) {
            updateUser({
              profileImage: resolved.src,
              profileImageId: resolved.fileId,
              profileImageFile:
                (profile as any)?.profileImageFile ??
                (profile as any)?.logoImageMeta ??
                { id: resolved.fileId, url: resolved.src, s3Url: resolved.src },
            });
          }
          return;
        }

        const profile = await ProfileApi.getMe();
        const resolved = resolveProfileImageSource(profile as any);
        if (!cancelled && (resolved.src || resolved.fileId)) {
          updateUser({
            firstName: profile?.firstName,
            lastName: profile?.lastName,
            username: profile?.username,
            profileImage: resolved.src,
            profileImageId: resolved.fileId,
            profileImageFile:
              profile?.profileImageFile ??
              { id: resolved.fileId, url: resolved.src, s3Url: resolved.src },
          });
        }
      } catch (error) {
        if (__DEV__) {
          profileMenuAvatarDevLog('hydrate-failed', {
            userId: user.id,
            hasBrandWorkspace,
            message: error instanceof Error ? error.message : 'unknown',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAvatarSource, hasBrandWorkspace, updateUser, user, visible]);

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
      void signOut().finally(() => {
        router.replace('/(auth)/login' as any);
      });
    });
  }, [onClose, runCloseAnimation, signOut]);

  const handleOpenSettings = React.useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    runCloseAnimation(() => {
      onClose();
      router.push('/settings' as any);
    });
  }, [onClose, onOpenSettings, runCloseAnimation]);

  if (!mounted) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
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
              backgroundColor: activeTheme.colors.surface,
            },
          ]}
        >
          <ScrollView
            scrollEnabled={true}
            nestedScrollEnabled={true}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.menuContent}
            style={{ maxHeight: menuMaxHeight }}
          >
              <Pressable
                onPress={onOpenProfile}
                accessibilityRole="button"
                accessibilityLabel={`Open profile for ${displayName}`}
                style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
              >
                <View style={[styles.avatar, { backgroundColor: activeTheme.colors.primarySoft }]}> 
                  {avatarUri ? (
                    <StableImage uri={avatarUri} containerStyle={styles.avatarImage} imageStyle={styles.avatarImage} />
                  ) : hasAvatarSource && avatarLoading ? (
                    <ThreadlyLogoLoader size={22} />
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
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <View style={styles.iconSlot}>
                  <AppText variant="captionBold">??</AppText>
                </View>
                <View style={styles.textWrap}>
                  <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                    Notifications
                  </AppText>
                </View>
              </Pressable>

              {hasBrandWorkspace && onOpenStudio ? (
                <Pressable
                  onPress={onOpenStudio}
                  accessibilityRole="button"
                  accessibilityLabel="Open studio"
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                >
                  <View style={styles.iconSlot}>
                    <AppText variant="captionBold">??</AppText>
                  </View>
                  <View style={styles.textWrap}>
                    <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                      Studio
                    </AppText>
                  </View>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleOpenSettings}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <View style={styles.iconSlot}>
                  <AppText variant="captionBold">??</AppText>
                </View>
                <View style={styles.textWrap}>
                  <AppText variant="bodyBold" numberOfLines={1} ellipsizeMode="tail">
                    Settings
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                style={({ pressed }) => [styles.item, styles.signOutItem, pressed && styles.pressed]}
              >
                <View style={styles.iconSlot}>
                  <AppText variant="captionBold">??</AppText>
                </View>
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
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 250,
    elevation: 250,
  },
  backdrop: {
    backgroundColor: 'transparent',
  },
  wrap: {
    position: 'absolute',
    right: tokens.spacing.sm,
    alignItems: 'flex-end',
  },
  menu: {
    minWidth: 196,
    maxWidth: 236,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
  menuContent: {
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 8,
    minHeight: 52,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  nameText: {
    flex: 1,
    flexShrink: 1,
  },
  handleText: {
    flexShrink: 1,
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
  iconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 8,
    minHeight: 48,
  },
  signOutItem: {
    marginTop: tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.78,
  },
});
