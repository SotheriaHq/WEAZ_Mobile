import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { BrandBadgeRail, ProfileBadge, type ProfileBadgeModel } from '@/components/catalog/ProfileBadge';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type BrandHeaderStat = {
  label: string;
  value: string;
};

export type BrandProfileHeaderProps = {
  brandName: string;
  username?: string;
  location?: string | null;
  description?: string | null;
  tags?: string[];
  stats?: BrandHeaderStat[];
  badges?: ProfileBadgeModel[];
  avatarUrl?: string;
  avatarFileId?: string | null;
  bannerUrl?: string;
  bannerFileId?: string | null;
  isOwner?: boolean;
  isLoading?: boolean;
  isPatched?: boolean;
  patchLoading?: boolean;
  avatarLoading?: boolean;
  bannerLoading?: boolean;
  onPatch?: () => void;
  onMessage?: () => void;
  onEditProfile?: () => void;
  onCreate?: () => void;
  onShare?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  onViewAvatar?: () => void;
  onEditAvatar?: () => void;
  onEditBanner?: () => void;
};

function compactInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'T';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'T';
  const second = parts.length > 1 ? parts[1]?.[0] : '';
  return `${first}${second}`.toUpperCase();
}

function normalizeTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function HeaderIconButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();

  if (!onPress) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerIconButton,
        {
          backgroundColor: theme.colors.glassSurfaceStrong,
          borderColor: theme.colors.glassBorder,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <AppText variant="subtitle" tone="default" style={styles.headerIconText}>
        {value}
      </AppText>
    </Pressable>
  );
}

function BannerHeader({
  brandName,
  bannerUrl,
  bannerFileId,
  bannerLoading,
  isOwner,
  onBack,
  onSearch,
  onShare,
  onEditBanner,
}: Pick<
  BrandProfileHeaderProps,
  | 'brandName'
  | 'bannerUrl'
  | 'bannerFileId'
  | 'bannerLoading'
  | 'isOwner'
  | 'onBack'
  | 'onSearch'
  | 'onShare'
  | 'onEditBanner'
>) {
  const { theme } = useTheme();
  const resolvedBanner = useResolvedImageUri({ src: bannerUrl, fileId: bannerFileId ?? undefined });

  return (
    <View style={[styles.bannerWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
      {resolvedBanner ? (
        <StableImage
          uri={resolvedBanner}
          containerStyle={styles.bannerImage}
          imageStyle={styles.bannerImage}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={[theme.colors.surfaceAlt, theme.colors.primarySoft, theme.colors.surface] as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bannerImage}
        />
      )}

      <View style={[styles.bannerShade, { backgroundColor: theme.colors.backdrop }]} />

      <View style={styles.bannerControls}>
        <HeaderIconButton label="Go back" value={'\u2039'} onPress={onBack} />
        <View style={styles.bannerRightControls}>
          <HeaderIconButton label="Search" value={'\u2315'} onPress={onSearch} />
          <HeaderIconButton label="Share brand" value={'\u22ef'} onPress={onShare} />
        </View>
      </View>

      {isOwner && onEditBanner ? (
        <View style={styles.editBannerWrap}>
          <Button
            title={bannerLoading ? 'Saving...' : 'Edit banner'}
            size="xs"
            variant="outline"
            loading={bannerLoading}
            onPress={onEditBanner}
            disabled={bannerLoading}
            style={styles.editBannerButton}
          />
        </View>
      ) : null}
    </View>
  );
}

function OverlayAvatar({
  brandName,
  avatarUrl,
  avatarFileId,
  avatarLoading,
  isOwner,
  onViewAvatar,
  onEditAvatar,
}: Pick<
  BrandProfileHeaderProps,
  | 'brandName'
  | 'avatarUrl'
  | 'avatarFileId'
  | 'avatarLoading'
  | 'isOwner'
  | 'onViewAvatar'
  | 'onEditAvatar'
>) {
  const { theme } = useTheme();
  const resolvedAvatar = useResolvedImageUri({ src: avatarUrl, fileId: avatarFileId ?? undefined });
  const initials = useMemo(() => compactInitials(brandName), [brandName]);
  const avatarAction = onViewAvatar || (isOwner ? onEditAvatar : undefined);

  return (
    <Pressable
      onPress={avatarAction}
      disabled={!avatarAction}
      style={({ pressed }) => [
        styles.avatarFrame,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.surface,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      accessibilityRole={avatarAction ? 'button' : undefined}
      accessibilityLabel={isOwner ? 'View or edit brand logo' : 'View brand logo'}
    >
      {resolvedAvatar ? (
        <StableImage
          uri={resolvedAvatar}
          containerStyle={styles.avatarImage}
          imageStyle={styles.avatarImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primarySoft }]}>
          <AppText variant="title" tone="primary" numberOfLines={1}>
            {initials}
          </AppText>
        </View>
      )}

      {avatarLoading ? (
        <View style={[styles.avatarLoading, { backgroundColor: theme.colors.overlay }]}>
          <Skeleton width={42} height={12} borderRadius={tokens.radius.sm} />
        </View>
      ) : null}

      {isOwner && onEditAvatar ? (
        <Pressable
          onPress={onEditAvatar}
          style={[styles.avatarEditBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Edit brand logo"
        >
          <AppText variant="captionBold" tone="inverse">
            Edit
          </AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function BrandStatsRow({ stats }: { stats: BrandHeaderStat[] }) {
  const { theme } = useTheme();
  if (stats.length === 0) return null;

  return (
    <View style={styles.statsRow}>
      {stats.map((stat, index) => (
        <React.Fragment key={`${stat.label}-${index}`}>
          {index > 0 ? <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} /> : null}
          <View style={styles.statItem}>
            <AppText variant="bodyBold" numberOfLines={1}>
              {stat.value}
            </AppText>
            <AppText variant="captionBold" tone="muted" numberOfLines={1}>
              {stat.label.toUpperCase()}
            </AppText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function BrandTextTags({ tags }: { tags: string[] }) {
  const visibleTags = useMemo(() => {
    const cleaned = tags.map(normalizeTag).filter((tag): tag is string => Boolean(tag));
    const visible = cleaned.slice(0, 3);
    const extra = Math.max(0, cleaned.length - visible.length);
    return extra > 0 ? [...visible, `+${extra}`] : visible;
  }, [tags]);

  if (visibleTags.length === 0) return null;

  return (
    <View style={styles.textTagsRow}>
      {visibleTags.map((tag) => (
        <AppText key={tag} variant="captionBold" tone="primary" numberOfLines={1} style={styles.textTag}>
          {tag}
        </AppText>
      ))}
    </View>
  );
}

function SideBrandMetaBlock({
  brandName,
  location,
  stats,
  tags,
  badges,
}: {
  brandName: string;
  location?: string | null;
  stats: BrandHeaderStat[];
  tags: string[];
  badges: ProfileBadgeModel[];
}) {
  const { scheme, theme } = useTheme();
  const primaryBadge = badges.find((badge) =>
    badge.variant === 'brand_verified' ||
    badge.variant === 'store_verified' ||
    badge.variant === 'user_verified' ||
    badge.variant === 'pending_verification'
  ) ?? null;
  const secondaryBadges = primaryBadge
    ? badges.filter((badge) => badge.variant !== primaryBadge.variant)
    : badges;

  return (
    <View
      style={[
        styles.metaBlock,
        {
          backgroundColor: theme.colors.glassSurfaceStrong,
          borderColor: theme.colors.glassBorder,
        },
      ]}
    >
      <BlurView
        intensity={theme.colors.glassBlur}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.brandNameRow}>
        <AppText variant="title" numberOfLines={1} style={styles.brandNameText}>
          {brandName}
        </AppText>
        {primaryBadge ? <ProfileBadge badge={primaryBadge} compact /> : null}
      </View>

      {location ? (
        <AppText variant="small" tone="muted" numberOfLines={1} style={styles.locationText}>
          📍 {location}
        </AppText>
      ) : null}

      <BrandBadgeRail badges={secondaryBadges} />
      <BrandStatsRow stats={stats} />
      <BrandTextTags tags={tags} />
    </View>
  );
}

function BrandDescription({ description }: { description?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const copy = description?.trim();

  useEffect(() => {
    setExpanded(false);
    setCanExpand(false);
  }, [copy]);

  if (!copy) return null;

  return (
    <View style={styles.descriptionWrap}>
      <AppText
        variant="bodyRegular"
        tone="secondary"
        numberOfLines={expanded ? undefined : 2}
        onTextLayout={(event) => {
          if (!expanded && event.nativeEvent.lines.length > 2) {
            setCanExpand(true);
          }
        }}
      >
        {copy}
      </AppText>
      {canExpand && !expanded ? (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" accessibilityLabel="Show full brand description">
          <AppText variant="bodyBold" tone="primary">
            See more
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function BrandProfileActions({
  isOwner,
  isPatched,
  patchLoading,
  onPatch,
  onMessage,
  onEditProfile,
  onCreate,
  onShare,
}: Pick<
  BrandProfileHeaderProps,
  'isOwner' | 'isPatched' | 'patchLoading' | 'onPatch' | 'onMessage' | 'onEditProfile' | 'onCreate' | 'onShare'
>) {
  const { theme } = useTheme();

  if (isOwner) {
    return (
      <View style={styles.actionRow}>
        <View style={styles.primaryActionSlot}>
          <Button
            title="Edit Profile"
            size="md"
            variant="primary"
            onPress={onEditProfile}
            disabled={!onEditProfile}
            fullWidth
            style={styles.actionButton}
          />
        </View>
        <View style={styles.secondaryActionSlot}>
          <Button title="Share" size="md" variant="outline" onPress={onShare} disabled={!onShare} fullWidth style={styles.actionButton} />
        </View>
        {onCreate ? (
          <Pressable
            onPress={onCreate}
            style={({ pressed }) => [
              styles.squareAction,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create catalog content"
          >
            <AppText variant="title" tone="primary">
              +
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.actionRow}>
      <View style={styles.primaryActionSlot}>
        <Button
          title={isPatched ? 'Following' : 'Follow'}
          size="md"
          variant={isPatched ? 'outline' : 'primary'}
          onPress={onPatch}
          disabled={!onPatch || patchLoading}
          loading={patchLoading}
          fullWidth
          style={styles.actionButton}
        />
      </View>
      {onMessage ? (
        <View style={styles.secondaryActionSlot}>
          <Button title="Message" size="md" variant="outline" onPress={onMessage} fullWidth style={styles.actionButton} />
        </View>
      ) : null}
      <View style={styles.secondaryActionSlot}>
        <Button title="Share" size="md" variant="outline" onPress={onShare} disabled={!onShare} fullWidth style={styles.actionButton} />
      </View>
    </View>
  );
}

export function BrandProfileHeaderSkeleton() {
  const { theme } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <Skeleton width="100%" height={200} borderRadius={0} />
      <View style={styles.identityRow}>
        <Skeleton width={116} height={116} borderRadius={tokens.radius.xl} />
        <View style={styles.skeletonMeta}>
          <Skeleton width="74%" height={26} borderRadius={tokens.radius.sm} />
          <Skeleton width="62%" height={14} borderRadius={tokens.radius.sm} />
          <View style={styles.skeletonStats}>
            <Skeleton width={48} height={28} borderRadius={tokens.radius.sm} />
            <Skeleton width={58} height={28} borderRadius={tokens.radius.sm} />
            <Skeleton width={44} height={28} borderRadius={tokens.radius.sm} />
          </View>
        </View>
      </View>
      <View style={styles.descriptionWrap}>
        <SkeletonText lines={2} lineHeight={16} spacing={tokens.spacing.sm} lastLineWidth="72%" />
      </View>
    </View>
  );
}

export function BrandProfileHeader({
  brandName,
  username,
  location,
  description,
  tags = [],
  stats = [],
  badges = [],
  avatarUrl,
  avatarFileId,
  bannerUrl,
  bannerFileId,
  isOwner = false,
  isLoading = false,
  isPatched = false,
  patchLoading = false,
  avatarLoading = false,
  bannerLoading = false,
  onPatch,
  onMessage,
  onEditProfile,
  onCreate,
  onShare,
  onBack,
  onSearch,
  onViewAvatar,
  onEditAvatar,
  onEditBanner,
}: BrandProfileHeaderProps) {
  const { theme } = useTheme();
  const effectiveName = brandName || username || 'Threadly Brand';

  if (isLoading) {
    return <BrandProfileHeaderSkeleton />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <BannerHeader
        brandName={effectiveName}
        bannerUrl={bannerUrl}
        bannerFileId={bannerFileId}
        bannerLoading={bannerLoading}
        isOwner={isOwner}
        onBack={onBack}
        onSearch={onSearch}
        onShare={onShare}
        onEditBanner={onEditBanner}
      />

      <View style={styles.identityRow}>
        <OverlayAvatar
          brandName={effectiveName}
          avatarUrl={avatarUrl}
          avatarFileId={avatarFileId}
          avatarLoading={avatarLoading}
          isOwner={isOwner}
          onViewAvatar={onViewAvatar}
          onEditAvatar={onEditAvatar}
        />
        <SideBrandMetaBlock
          brandName={effectiveName}
          location={location}
          stats={stats}
          tags={tags}
          badges={badges}
        />
      </View>

      <BrandDescription description={description} />

      <BrandProfileActions
        isOwner={isOwner}
        isPatched={isPatched}
        patchLoading={patchLoading}
        onPatch={onPatch}
        onMessage={onMessage}
        onEditProfile={onEditProfile}
        onCreate={onCreate}
        onShare={onShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: tokens.spacing.lg,
  },
  bannerWrap: {
    height: 204,
    overflow: 'hidden',
    borderBottomLeftRadius: tokens.radius.xl,
    borderBottomRightRadius: tokens.radius.xl,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerShade: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerControls: {
    position: 'absolute',
    top: tokens.spacing.lg,
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    textAlign: 'center',
  },
  editBannerWrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: tokens.spacing.lg,
  },
  editBannerButton: {
    borderRadius: tokens.radius.full,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: -46,
  },
  avatarFrame: {
    width: 116,
    height: 116,
    borderRadius: tokens.radius.xl,
    borderWidth: 4,
    overflow: 'visible',
    ...tokens.elevation.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.xl - 4,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.xl - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: tokens.radius.xl - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -tokens.spacing.xs,
    bottom: -tokens.spacing.xs,
    minHeight: 28,
    minWidth: 48,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  metaBlock: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minWidth: 0,
  },
  brandNameText: {
    flexShrink: 1,
  },
  locationText: {
    maxWidth: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    flexWrap: 'nowrap',
  },
  statItem: {
    minWidth: 42,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  textTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  textTag: {
    flexShrink: 1,
  },
  descriptionWrap: {
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.lg,
  },
  primaryActionSlot: {
    flex: 1,
    minWidth: 0,
  },
  secondaryActionSlot: {
    width: 104,
  },
  actionButton: {
    borderRadius: tokens.radius.md,
  },
  squareAction: {
    width: 52,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonMeta: {
    flex: 1,
    gap: tokens.spacing.md,
  },
  skeletonStats: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
});

export default BrandProfileHeader;
