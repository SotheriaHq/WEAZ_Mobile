import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ProfilePhotoViewState } from '@/src/types/profilePhoto';

interface ProfileHeaderProps {
  brandName: string;
  username?: string | null;
  location?: string | null;
  description?: string | null;
  tags?: string[];
  avatarUrl?: string | null;
  avatarFileId?: string;
  profilePhotoViewState?: ProfilePhotoViewState | null;
  bannerUrl?: string | null;
  bannerFileId?: string;
  isOwner?: boolean;
  isLoading?: boolean;
  avatarLoading?: boolean;
  bannerLoading?: boolean;
  isPatched?: boolean;
  patchLoading?: boolean;
  onPatch?: () => void;
  onMessage?: () => void;
  onViewAvatar?: () => void;
  onEditAvatar?: () => void;
  onEditBanner?: () => void;
  onEditProfile?: () => void;
  onShare?: () => void;
  onBack?: () => void;
}

const PROFILE_LAYOUT = {
  bannerMinHeight: 136,
  bannerMaxHeight: 176,
  bannerWidthRatio: 0.42,
  avatarSize: 84,
  avatarInnerRadius: tokens.radius.md,
  avatarOuterRadius: tokens.radius.lg,
  avatarBorderWidth: 3,
  editBadgeSize: 28,
  heroControlSize: 44,
  qrSize: 48,
  overlayLift: tokens.spacing.xl,
  descriptionPreviewLength: 150,
};

type ProfileActionItem = {
  key: string;
  title: string;
  variant: ButtonVariant;
  onPress: () => void;
  loading?: boolean;
};

const ProfileHeaderSkeleton = () => {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const bannerHeight = getBannerHeight(width);

  return (
    <View style={styles.container}>
      <Skeleton width={width} height={bannerHeight} borderRadius={0} />
      <View style={[styles.contentShell, styles.contentShellRaised, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.identityRow}>
          <View style={[styles.avatarWrapper, { borderColor: theme.colors.bg }]}>
            <SkeletonAvatar size={PROFILE_LAYOUT.avatarSize} />
          </View>
          <View style={styles.identityCopy}>
            <Skeleton width="70%" height={tokens.typography.subtitle.lineHeight} borderRadius={tokens.radius.sm} />
            <Skeleton width="46%" height={tokens.typography.caption.lineHeight} borderRadius={tokens.radius.sm} />
            <Skeleton width="62%" height={tokens.typography.caption.lineHeight} borderRadius={tokens.radius.sm} />
          </View>
        </View>
        <View style={styles.actionRow}>
          <View style={styles.actionSlot}>
            <Skeleton width="100%" height={tokens.button.md.height} borderRadius={tokens.radius.lg} />
          </View>
          <View style={styles.actionSlot}>
            <Skeleton width="100%" height={tokens.button.md.height} borderRadius={tokens.radius.lg} />
          </View>
        </View>
      </View>
    </View>
  );
};

const BannerFallback = ({ isOwner, onEditBanner }: { isOwner: boolean; onEditBanner?: () => void }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.bannerFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
      {isOwner ? (
        <Pressable
          onPress={onEditBanner}
          style={({ pressed }) => [
            styles.bannerFallbackButton,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            pressed ? styles.pressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Edit banner"
        >
          <AppText variant="captionBold" tone="secondary">
            Edit banner
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
};

const AvatarFallback = ({ initials }: { initials: string }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primary }]}>
      <AppText variant="title" tone="inverse">
        {initials}
      </AppText>
    </View>
  );
};

function getBannerHeight(width: number) {
  return Math.round(
    Math.min(
      PROFILE_LAYOUT.bannerMaxHeight,
      Math.max(PROFILE_LAYOUT.bannerMinHeight, width * PROFILE_LAYOUT.bannerWidthRatio),
    ),
  );
}

function ProfileHero({
  bannerHeight,
  bannerLoading,
  isOwner,
  onBack,
  onEditBanner,
  pulseAnim,
  showBannerImage,
  bannerUri,
  onBannerError,
}: {
  bannerHeight: number;
  bannerLoading: boolean;
  isOwner: boolean;
  onBack?: () => void;
  onEditBanner?: () => void;
  pulseAnim: Animated.Value;
  showBannerImage: boolean;
  bannerUri?: string | null;
  onBannerError: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.bannerContainer, { height: bannerHeight }]}>
      {showBannerImage && bannerUri ? (
        <Animated.View style={[styles.flexFill, { opacity: bannerLoading ? pulseAnim : 1 }]}>
          <StableImage
            uri={bannerUri}
            containerStyle={styles.bannerImage}
            imageStyle={styles.bannerImage}
            onError={onBannerError}
            fallback={<BannerFallback isOwner={isOwner} onEditBanner={onEditBanner} />}
          />
        </Animated.View>
      ) : (
        <BannerFallback isOwner={isOwner} onEditBanner={onEditBanner} />
      )}

      <View style={styles.topLeftNavContainer}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.heroControl,
              { backgroundColor: theme.colors.glassSurfaceStrong },
              pressed ? styles.pressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <AppText variant="subtitle" tone="inverse">
              {'<'}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.qrContainer}>
        <View style={[styles.qrBox, { backgroundColor: theme.colors.glassSurfaceStrong }]}>
          <AppText variant="captionBold" tone="inverse">
            QR
          </AppText>
        </View>
      </View>
    </View>
  );
}

function ProfileAvatar({
  displayName,
  handleAvatarPress,
  isOwner,
  onEditAvatar,
  pulseAnim,
  showAvatarImage,
  avatarUri,
  avatarLoading,
  profilePhotoViewState,
  onAvatarError,
}: {
  displayName: string;
  handleAvatarPress?: () => void;
  isOwner: boolean;
  onEditAvatar?: () => void;
  pulseAnim: Animated.Value;
  showAvatarImage: boolean;
  avatarUri?: string | null;
  avatarLoading: boolean;
  profilePhotoViewState?: ProfilePhotoViewState | null;
  onAvatarError: () => void;
}) {
  const { theme } = useTheme();
  const initials = displayName.trim().charAt(0).toUpperCase() || 'T';
  const hasVersion = Boolean(profilePhotoViewState?.profilePhotoUpdatedAt);
  const ringColor =
    showAvatarImage && hasVersion
      ? profilePhotoViewState?.hasUnviewedUpdate
        ? theme.colors.primary
        : theme.colors.border
      : theme.colors.bg;
  const ringShadow = showAvatarImage && hasVersion && profilePhotoViewState?.hasUnviewedUpdate
    ? {
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      }
    : null;

  return (
    <Pressable
      onPress={handleAvatarPress}
      onLongPress={isOwner ? onEditAvatar : undefined}
      delayLongPress={220}
      disabled={!handleAvatarPress}
      style={({ pressed }) => [
        styles.avatarWrapper,
        { borderColor: ringColor },
        ringShadow,
        pressed ? styles.pressedScale : null,
      ]}
      accessibilityRole={handleAvatarPress ? 'button' : undefined}
      accessibilityLabel="View profile photo"
    >
      <Animated.View style={[styles.flexFill, { opacity: avatarLoading ? pulseAnim : 1 }]}>
        {showAvatarImage && avatarUri ? (
          <StableImage
            uri={avatarUri}
            containerStyle={styles.avatarImage}
            imageStyle={styles.avatarImage}
            onError={onAvatarError}
            fallback={<AvatarFallback initials={initials} />}
          />
        ) : (
          <AvatarFallback initials={initials} />
        )}
      </Animated.View>

      {isOwner ? (
        <View style={[styles.avatarEditBadge, { backgroundColor: theme.colors.primary }]}>
          <AppText variant="captionBold" tone="inverse">
            Edit
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function ProfileIdentityRow({
  displayName,
  username,
  location,
  children,
}: {
  displayName: string;
  username?: string | null;
  location?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.identityRow}>
      {children}
      <View style={styles.identityCopy}>
        <AppText variant="title" numberOfLines={2}>
          {displayName}
        </AppText>
        {username ? (
          <AppText variant="captionBold" tone="muted" numberOfLines={1}>
            @{username}
          </AppText>
        ) : null}
        {location ? (
          <View style={styles.locationRow}>
            <AppText variant="captionBold" tone="muted">
              Pin
            </AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={2} style={styles.locationText}>
              {location}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ProfileActionRow({
  isOwner,
  isPatched,
  patchLoading,
  onPatch,
  onMessage,
  onEditProfile,
  onShare,
}: {
  isOwner: boolean;
  isPatched: boolean;
  patchLoading: boolean;
  onPatch?: () => void;
  onMessage?: () => void;
  onEditProfile?: () => void;
  onShare?: () => void;
}) {
  const actions = useMemo<ProfileActionItem[]>(() => {
    if (isOwner) {
      const ownerActions: ProfileActionItem[] = [];
      if (onEditProfile) {
        ownerActions.push({ key: 'edit', title: 'Edit Profile', variant: 'primary', onPress: onEditProfile });
      }
      if (onShare) {
        ownerActions.push({ key: 'share', title: 'Share', variant: 'outline', onPress: onShare });
      }
      return ownerActions;
    }

    const visitorActions: ProfileActionItem[] = [];
    if (onPatch) {
      visitorActions.push({
        key: 'patch',
        title: isPatched ? 'Patched' : 'Patch',
        variant: isPatched ? 'outline' : 'primary',
        onPress: onPatch,
        loading: patchLoading,
      });
    }
    if (onMessage) {
      visitorActions.push({ key: 'message', title: 'Message', variant: 'secondary', onPress: onMessage });
    }
    if (onShare) {
      visitorActions.push({ key: 'share', title: 'Share', variant: 'outline', onPress: onShare });
    }
    return visitorActions;
  }, [isOwner, isPatched, onEditProfile, onMessage, onPatch, onShare, patchLoading]);

  if (actions.length === 0) return null;

  return (
    <View style={styles.actionRow}>
      {actions.map((action) => (
        <View key={action.key} style={styles.actionSlot}>
          <Button
            title={action.title}
            variant={action.variant}
            size="md"
            fullWidth
            onPress={action.onPress}
            loading={action.loading}
          />
        </View>
      ))}
    </View>
  );
}

function ProfileTagRail({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tagsScroll}
      contentContainerStyle={styles.tagsContainer}
    >
      {tags.map((tag) => (
        <Chip key={tag} label={`#${tag}`} selected={false} variant="profile" />
      ))}
    </ScrollView>
  );
}

function ProfileAbout({
  description,
  descriptionExpanded,
  isOwner,
  onEditProfile,
  onToggleDescription,
}: {
  description: string;
  descriptionExpanded: boolean;
  isOwner: boolean;
  onEditProfile?: () => void;
  onToggleDescription: () => void;
}) {
  const canToggle = description.length > PROFILE_LAYOUT.descriptionPreviewLength;

  if (description) {
    return (
      <View style={styles.descriptionWrap}>
        <AppText variant="bodyRegular" numberOfLines={!descriptionExpanded && canToggle ? 3 : undefined}>
          {description}
        </AppText>
        {canToggle ? (
          <Pressable onPress={onToggleDescription} accessibilityRole="button">
            <AppText variant="captionBold" tone="primary">
              {descriptionExpanded ? 'See less' : 'See more'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!isOwner) return null;

  return (
    <Pressable onPress={onEditProfile} style={styles.descriptionWrap} accessibilityRole="button">
      <AppText variant="captionBold" tone="primary">
        Add a description
      </AppText>
    </Pressable>
  );
}

export const ProfileHeader = React.memo(function ProfileHeader({
  brandName,
  username,
  location,
  description,
  tags = [],
  avatarUrl,
  avatarFileId,
  bannerUrl,
  bannerFileId,
  isOwner = false,
  isLoading = false,
  avatarLoading = false,
  bannerLoading = false,
  profilePhotoViewState,
  isPatched = false,
  patchLoading = false,
  onPatch,
  onMessage,
  onViewAvatar,
  onEditAvatar,
  onEditBanner,
  onEditProfile,
  onShare,
  onBack,
}: ProfileHeaderProps) {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const [bannerFailed, setBannerFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const resolvedAvatarUrl = useResolvedImageUri({ src: avatarUrl, fileId: avatarFileId });
  const resolvedBannerUrl = useResolvedImageUri({ src: bannerUrl, fileId: bannerFileId });
  const displayName = brandName.trim() || 'Your Brand';
  const trimmedDescription = (description ?? '').trim();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [trimmedDescription]);

  useEffect(() => {
    if (!avatarLoading && !bannerLoading) return undefined;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [avatarLoading, bannerLoading, pulseAnim]);

  if (isLoading) {
    return <ProfileHeaderSkeleton />;
  }

  const bannerHeight = getBannerHeight(width);
  const handleAvatarPress = onViewAvatar;
  const bannerUri = resolvedBannerUrl ?? bannerUrl;
  const avatarUri = resolvedAvatarUrl ?? avatarUrl;
  const showBannerImage = Boolean(bannerUri && !bannerFailed);
  const showAvatarImage = Boolean(avatarUri && !avatarFailed);

  return (
    <View style={styles.container}>
      <ProfileHero
        bannerHeight={bannerHeight}
        bannerLoading={bannerLoading}
        isOwner={isOwner}
        onBack={onBack}
        onEditBanner={onEditBanner}
        pulseAnim={pulseAnim}
        showBannerImage={showBannerImage}
        bannerUri={bannerUri}
        onBannerError={() => setBannerFailed(true)}
      />

      <View style={[styles.contentShell, styles.contentShellRaised, { backgroundColor: theme.colors.bg }]}>
        <ProfileIdentityRow displayName={displayName} username={username} location={location}>
          <ProfileAvatar
            displayName={displayName}
            handleAvatarPress={handleAvatarPress}
            isOwner={isOwner}
            onEditAvatar={onEditAvatar}
            pulseAnim={pulseAnim}
            showAvatarImage={showAvatarImage}
            avatarUri={avatarUri}
            avatarLoading={avatarLoading}
            profilePhotoViewState={profilePhotoViewState}
            onAvatarError={() => setAvatarFailed(true)}
          />
        </ProfileIdentityRow>

        <ProfileActionRow
          isOwner={isOwner}
          isPatched={isPatched}
          patchLoading={patchLoading}
          onPatch={onPatch}
          onMessage={onMessage}
          onEditProfile={onEditProfile}
          onShare={onShare}
        />

        <ProfileTagRail tags={tags} />

        <ProfileAbout
          description={trimmedDescription}
          descriptionExpanded={descriptionExpanded}
          isOwner={isOwner}
          onEditProfile={onEditProfile}
          onToggleDescription={() => setDescriptionExpanded((value) => !value)}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  flexFill: {
    flex: 1,
  },
  bannerContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerFallbackButton: {
    minHeight: tokens.button.sm.height,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLeftNavContainer: {
    position: 'absolute',
    top: tokens.spacing.md,
    left: tokens.spacing.md,
  },
  heroControl: {
    width: PROFILE_LAYOUT.heroControlSize,
    height: PROFILE_LAYOUT.heroControlSize,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrContainer: {
    position: 'absolute',
    top: tokens.spacing.md,
    right: tokens.spacing.md,
  },
  qrBox: {
    width: PROFILE_LAYOUT.qrSize,
    height: PROFILE_LAYOUT.qrSize,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  contentShell: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.md,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
  },
  contentShellRaised: {
    marginTop: -PROFILE_LAYOUT.overlayLift,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.md,
  },
  avatarWrapper: {
    width: PROFILE_LAYOUT.avatarSize,
    height: PROFILE_LAYOUT.avatarSize,
    borderRadius: PROFILE_LAYOUT.avatarOuterRadius,
    borderWidth: PROFILE_LAYOUT.avatarBorderWidth,
    overflow: 'hidden',
    ...tokens.elevation.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: PROFILE_LAYOUT.avatarInnerRadius,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: PROFILE_LAYOUT.avatarInnerRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: tokens.spacing.xs,
    bottom: tokens.spacing.xs,
    minWidth: PROFILE_LAYOUT.editBadgeSize,
    height: PROFILE_LAYOUT.editBadgeSize,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
    paddingBottom: tokens.spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.xs,
  },
  locationText: {
    flex: 1,
    minWidth: 0,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionSlot: {
    flex: 1,
    minWidth: 0,
  },
  tagsScroll: {
    marginHorizontal: -tokens.spacing.lg,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xs,
  },
  descriptionWrap: {
    gap: tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.82,
  },
  pressedScale: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});

export default ProfileHeader;
