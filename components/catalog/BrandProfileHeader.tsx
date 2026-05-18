import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
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

const BRAND_DESCRIPTION_PREVIEW_LINES = 2;
const BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH = 120;

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
  createAnchorRef?: React.RefObject<View | null>;
  onCreateAnchorLayout?: () => void;
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
  disabled = false,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  if (!onPress) return null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.headerIconButton,
        {
          backgroundColor: theme.colors.glassSurfaceStrong,
          borderColor: theme.colors.glassBorder,
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
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
  const { scheme, theme } = useTheme();
  const resolvedBanner = useResolvedImageUri({ src: bannerUrl, fileId: bannerFileId ?? undefined });

  return (
    <View style={[styles.bannerWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={[styles.bannerImage, bannerLoading ? styles.uploadPreviewDim : null]}>
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
      </View>

      <View style={[styles.bannerShade, { backgroundColor: theme.colors.backdrop }]} />
      {bannerLoading ? (
        <View style={styles.bannerLoadingOverlay} pointerEvents="none">
          <BlurView
            intensity={18}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.loadingPill, { backgroundColor: theme.colors.glassSurfaceStrong }]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <AppText variant="captionBold" tone="default">
              Uploading
            </AppText>
          </View>
        </View>
      ) : null}

      <View style={styles.bannerControls}>
        <HeaderIconButton label="Go back" value="👈" onPress={onBack} />
        <View style={styles.bannerRightControls}>
          {isOwner ? (
            <HeaderIconButton
              label="Edit banner"
              value={bannerLoading ? '…' : '✎'}
              onPress={onEditBanner}
              disabled={bannerLoading}
            />
          ) : (
            <HeaderIconButton label="Search" value="🔍" onPress={onSearch} />
          )}
          <HeaderIconButton label="Share brand" value="⋯" onPress={onShare} />
        </View>
      </View>
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
      <View style={[styles.avatarImage, avatarLoading ? styles.uploadPreviewDim : null]}>
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
      </View>

      {avatarLoading ? (
        <View style={[styles.avatarLoading, { backgroundColor: theme.colors.overlay }]} pointerEvents="none">
          <BlurView
            intensity={16}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : null}

      {isOwner && onEditAvatar ? (
        <Pressable
          onPress={onEditAvatar}
          style={[styles.avatarEditBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Edit brand logo"
        >
          <AppText variant="subtitle" tone="inverse">
            ✎
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
            <AppText
              variant="smallBold"
              tone="secondary"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={styles.statValue}
            >
              {stat.value}
            </AppText>
            <AppText
              variant="captionBold"
              tone="muted"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={styles.statLabel}
            >
              {stat.label.toUpperCase()}
            </AppText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function BrandTextTags({ tags }: { tags: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const cleanedTags = useMemo(
    () => tags.map(normalizeTag).filter((tag): tag is string => Boolean(tag)),
    [tags],
  );
  const extraCount = Math.max(0, cleanedTags.length - 3);
  const visibleTags = expanded ? cleanedTags : cleanedTags.slice(0, 3);

  useEffect(() => {
    setExpanded(false);
  }, [cleanedTags.join('|')]);

  if (cleanedTags.length === 0) return null;

  return (
    <View style={styles.textTagsRow}>
      {visibleTags.map((tag) => (
        <AppText key={tag} variant="captionBold" tone="primary" numberOfLines={1} style={styles.textTag}>
          {tag}
        </AppText>
      ))}
      {!expanded && extraCount > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${extraCount} more brand tags`}
          style={({ pressed }) => [styles.textTagControl, pressed ? styles.pressedControl : null]}
        >
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            +{extraCount}
          </AppText>
        </Pressable>
      ) : null}
      {expanded && extraCount > 0 ? (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Collapse brand tags"
          style={({ pressed }) => [styles.textTagControl, pressed ? styles.pressedControl : null]}
        >
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            See less
          </AppText>
        </Pressable>
      ) : null}
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
  const normalizedBrandName = brandName.trim();
  const brandWordCount = normalizedBrandName.split(/\s+/).filter(Boolean).length;
  const brandNameLines = brandWordCount > 5 || normalizedBrandName.length > 28 ? 2 : 1;
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
    <View style={styles.metaBlock}>
      <View
        style={[
          styles.brandNamePill,
          {
            backgroundColor: theme.colors.glassSurfaceSoft,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
        <BlurView
          intensity={Math.max(18, Math.round(theme.colors.glassBlur * 0.72))}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.brandNameRow}>
          <AppText
            variant="title"
            numberOfLines={brandNameLines}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={brandNameLines === 1 ? 0.7 : 0.82}
            style={styles.brandNameText}
          >
            {brandName}
          </AppText>
          {primaryBadge ? <ProfileBadge badge={primaryBadge} compact /> : null}
        </View>
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
    setCanExpand((copy?.length ?? 0) > BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH);
  }, [copy]);

  if (!copy) return null;

  const handleMeasuredTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const hasHiddenLines = event.nativeEvent.lines.length > BRAND_DESCRIPTION_PREVIEW_LINES;
    const hasLongCopy = copy.length > BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH;
    const nextCanExpand = hasHiddenLines || hasLongCopy;
    setCanExpand((current) => (current === nextCanExpand ? current : nextCanExpand));
  };

  return (
    <View style={styles.descriptionWrap}>
      <AppText
        variant="bodyRegular"
        tone="secondary"
        numberOfLines={expanded ? undefined : BRAND_DESCRIPTION_PREVIEW_LINES}
      >
        {copy}
      </AppText>
      <AppText
        variant="bodyRegular"
        tone="secondary"
        style={styles.descriptionMeasureText}
        onTextLayout={handleMeasuredTextLayout}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
      {canExpand && expanded ? (
        <Pressable onPress={() => setExpanded(false)} accessibilityRole="button" accessibilityLabel="Collapse brand description">
          <AppText variant="bodyBold" tone="primary">
            See less
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
  createAnchorRef,
  onCreateAnchorLayout,
  onShare,
}: Pick<
  BrandProfileHeaderProps,
  | 'isOwner'
  | 'isPatched'
  | 'patchLoading'
  | 'onPatch'
  | 'onMessage'
  | 'onEditProfile'
  | 'onCreate'
  | 'createAnchorRef'
  | 'onCreateAnchorLayout'
  | 'onShare'
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
          <View ref={createAnchorRef} onLayout={onCreateAnchorLayout} collapsable={false}>
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
          </View>
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
  createAnchorRef,
  onCreateAnchorLayout,
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
        createAnchorRef={createAnchorRef}
        onCreateAnchorLayout={onCreateAnchorLayout}
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
  uploadPreviewDim: {
    opacity: 0.56,
  },
  bannerShade: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: -54,
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
    width: 34,
    height: 34,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBlock: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.xs,
  },
  brandNamePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    minWidth: 0,
  },
  brandNameText: {
    minWidth: 0,
    flexShrink: 1,
  },
  locationText: {
    maxWidth: '100%',
    marginTop: -tokens.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    flexWrap: 'nowrap',
  },
  statItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  statValue: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  statLabel: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
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
  textTagControl: {
    flexShrink: 0,
  },
  pressedControl: {
    opacity: 0.72,
  },
  descriptionWrap: {
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  descriptionMeasureText: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    top: 0,
    opacity: 0,
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
