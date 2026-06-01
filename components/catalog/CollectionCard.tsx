import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import type { CollectionDto } from '@/src/api/BrandApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { getCatalogCardCopy, resolveCatalogCardBranch } from '@/src/features/catalog/catalogCardBranch';
import { getContentStatusLabel } from '@/src/features/design-editor/designCreationRules';
import { ContentReviewDecisionSheet } from './ContentReviewDecisionSheet';

export interface CollectionCardProps {
  collection: CollectionDto;
  cardKind?: 'design' | 'collection';
  onPress?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onShare?: (id: string) => void;
  onSave?: (collection: CollectionDto) => void;
  isSaved?: boolean;
  saveBusy?: boolean;
  showActions?: boolean;
  isDraft?: boolean;
  isOwner?: boolean;
  cardWidth?: number;
}

const formatPrice = (price?: number | null): string | null => {
  if (typeof price !== 'number' || price <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

const priceRange = (minPrice?: number | null, maxPrice?: number | null) => {
  const min = formatPrice(minPrice);
  const max = formatPrice(maxPrice);
  if (min && max) return `${min} - ${max}`;
  if (min) return `${min}+`;
  if (max) return `Up to ${max}`;
  return 'Price on request';
};

const compactCount = (value?: number | null): string => {
  const count = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.max(0, count));
};

export const CollectionCardSkeleton = ({ width = 180 }: { width?: number }) => {
  const imageHeight = Math.round(width * 1.14);

  return (
    <View style={[styles.card, { width }]}>
      <Skeleton width={width} height={imageHeight} borderRadius={tokens.radius.lg} />
    </View>
  );
};

export const CollectionCard = React.memo(function CollectionCard({
  collection,
  cardKind,
  onPress,
  onEdit,
  onDelete,
  onLike,
  onComment,
  onShare,
  onSave,
  isSaved = false,
  saveBusy = false,
  showActions = true,
  isDraft = false,
  isOwner = false,
  cardWidth,
}: CollectionCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;

  const width = Math.round(cardWidth ?? (screenWidth - tokens.spacing.lg * 2 - tokens.spacing.md) / 2);
  const imageHeight = Math.round(width * 1.32);
  const allowPrivateMediaFallback =
    isOwner ||
    isDraft ||
    collection.visibility === 'PRIVATE' ||
    collection.status === 'DRAFT';
  const coverUri = useResolvedImageUri({
    src: collection.coverImage,
    fileId: collection.coverFileId,
    allowSignedFallback: allowPrivateMediaFallback,
  });

  const inferredBranch = resolveCatalogCardBranch(collection, collection.isAvailableInStore ? 'COLLECTION' : 'DESIGN');
  const cardBranch = cardKind ?? (inferredBranch === 'collection' ? 'collection' : 'design');
  const copy = getCatalogCardCopy(cardBranch);
  const displayTitle = collection.title?.trim() || copy.titleFallback;
  const brandName = collection.brandName?.trim() || 'Brand';
  const pieceCount = collection.itemCount || collection.postsCount || 0;
  const countLabel = pieceCount === 1 ? copy.countSingular : copy.countPlural;
  const priceLabel = useMemo(
    () => priceRange(collection.saleMinPrice ?? collection.minPrice, collection.saleMaxPrice ?? collection.maxPrice),
    [collection.maxPrice, collection.minPrice, collection.saleMaxPrice, collection.saleMinPrice],
  );
  const likeCountLabel = compactCount(collection.likesCount);
  const commentCountLabel = compactCount(collection.commentsCount);
  const threadCountLabel = compactCount(collection.postsCount);
  const backendStatus = String(collection.publicationStatus ?? collection.status ?? '').toUpperCase();
  const reviewStatusLabel =
    backendStatus === 'IN_REVIEW' ||
    backendStatus === 'CHANGES_REQUESTED' ||
    backendStatus === 'REJECTED' ||
    backendStatus === 'FAILED'
      ? getContentStatusLabel(backendStatus)
      : null;
  const needsReviewDecision =
    backendStatus === 'CHANGES_REQUESTED' || backendStatus === 'REJECTED';

  const disabled = Boolean(collection.clientStatus);

  const animate = React.useCallback(
    (next: number) => {
      Animated.spring(scale, {
        toValue: next,
        friction: 8,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const showImage = Boolean(coverUri && !imageFailed);

  return (
    <>
    <Animated.View
      testID={`catalog-card-${cardBranch}`}
      style={[
        styles.card,
        {
          width,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.82 : 1,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : () => animate(0.98)}
        onPressOut={disabled ? undefined : () => animate(1)}
        style={styles.pressable}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Open ${copy.badgeLabel.toLowerCase()} ${displayTitle}`}
      >
        <View style={[styles.coverFrame, { height: imageHeight, backgroundColor: theme.colors.surfaceAlt }]}>
          {showImage ? (
            <StableImage
              uri={coverUri}
              resizeMode="contain"
              aspectAware
              containerStyle={[styles.coverImage, { width, height: imageHeight }]}
              imageStyle={[styles.coverImage, { width, height: imageHeight }]}
              onError={() => setImageFailed(true)}
              fallback={<ImageFallback title={displayTitle} />}
            />
          ) : (
            <ImageFallback title={displayTitle} />
          )}

          <View style={[styles.storeBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
            <AppText variant="captionBold" tone="primary">
              {copy.badgeLabel}
            </AppText>
          </View>

          <NewDropBadge
            itemId={collection.id}
            createdAt={collection.createdAt}
            sourceScreen="profile-catalog"
            compact
            style={styles.newDropBadge}
          />

          {showActions && !isDraft ? (
            <View style={styles.actionRail}>
              {!isOwner && onSave ? (
                <RailButton
                  label={isSaved ? 'Saved' : 'Save'}
                  emoji={isSaved ? '♥' : '♡'}
                  busy={saveBusy}
                  onPress={() => onSave(collection)}
                />
              ) : null}
              {onShare ? <RailButton emoji="↗" onPress={() => onShare(collection.id)} /> : null}
            </View>
          ) : null}

          {isOwner && !collection.clientStatus ? (
            <Pressable
              onPress={() => setMenuVisible((current) => !current)}
              style={[styles.menuButton, { backgroundColor: theme.colors.surfaceOverlay }]}
              hitSlop={tokens.spacing.sm}
              accessibilityRole="button"
              accessibilityLabel={copy.ownerActionsLabel}
            >
              <AppText variant="captionBold">⋯</AppText>
            </Pressable>
          ) : null}

          {menuVisible ? (
            <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {onEdit ? (
                <Pressable
                  onPress={() => {
                    setMenuVisible(false);
                    onEdit(collection.id);
                  }}
                  style={styles.menuItem}
                >
                  <AppText variant="captionBold">{copy.editLabel}</AppText>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  onPress={() => {
                    setMenuVisible(false);
                    onDelete(collection.id);
                  }}
                  style={styles.menuItem}
                >
                  <AppText variant="captionBold" tone="danger">
                    {copy.deleteLabel}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <LinearGradient
            colors={['transparent', theme.colors.backdropStrong] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.metadataGradient}
          >
            <View style={styles.metadataPanel}>
              {collection.clientStatus ? (
                <View style={[styles.statusPill, { backgroundColor: theme.colors.glassSurfaceStrong }]}>
                  <AppText variant="captionBold" tone={collection.clientStatus === 'publish-failed' ? 'danger' : 'primary'} numberOfLines={1}>
                    {collection.clientStatusMessage || (collection.clientStatus === 'publish-failed' ? 'Publish failed' : 'Publishing')}
                  </AppText>
                </View>
              ) : isDraft ? (
                <View style={[styles.statusPill, { backgroundColor: theme.colors.glassSurfaceStrong }]}>
                  <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                    Draft
                  </AppText>
                </View>
              ) : isOwner && reviewStatusLabel ? (
                <Pressable
                  onPress={needsReviewDecision ? () => setReviewDecisionOpen(true) : undefined}
                  style={[styles.statusPill, { backgroundColor: theme.colors.glassSurfaceStrong }]}
                  accessibilityRole={needsReviewDecision ? 'button' : undefined}
                  accessibilityLabel={needsReviewDecision ? `View ${reviewStatusLabel} feedback` : reviewStatusLabel}
                >
                  <AppText
                    variant="captionBold"
                    tone={backendStatus === 'CHANGES_REQUESTED' ? 'primary' : backendStatus === 'REJECTED' ? 'danger' : 'muted'}
                    numberOfLines={1}
                  >
                    {reviewStatusLabel}
                  </AppText>
                </Pressable>
              ) : null}

              <AppText variant="smallBold" tone="inverse" numberOfLines={2}>
                {displayTitle}
              </AppText>
              <AppText variant="caption" tone="inverse" numberOfLines={1}>
                {brandName}
              </AppText>
              <View style={styles.cardMetaRow}>
                <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                  {pieceCount} {countLabel}
                </AppText>
                <AppText variant="captionBold" tone="inverse" numberOfLines={1} style={styles.priceText}>
                  {priceLabel}
                </AppText>
              </View>
              <View style={styles.socialStatsRow}>
                <SocialMetric emoji={'\u2665'} value={likeCountLabel} label="likes" onPress={onLike ? () => onLike(collection.id) : undefined} />
                <SocialMetric
                  emoji={'\uD83D\uDCAC'}
                  value={commentCountLabel}
                  label="comments"
                  onPress={onComment ? () => onComment(collection.id) : undefined}
                />
                <SocialMetric emoji={'\uD83E\uDDF5'} value={threadCountLabel} label="threads" />
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
    <ContentReviewDecisionSheet
      open={reviewDecisionOpen}
      onClose={() => setReviewDecisionOpen(false)}
      submissionId={collection.submissionId}
      status={backendStatus}
      title={displayTitle}
      onEdit={onEdit ? () => onEdit(collection.id) : onPress}
    />
    </>
  );
});

function ImageFallback({ title }: { title: string }) {
  const { theme } = useTheme();

  return (
    <LinearGradient
      colors={[theme.colors.surfaceAlt, theme.colors.surface] as [string, string]}
      style={styles.imageFallback}
    >
      <AppText variant="captionBold" tone="muted" numberOfLines={1}>
        {title.trim() ? 'Image unavailable' : 'No image'}
      </AppText>
    </LinearGradient>
  );
}

function RailButton({ emoji, label, busy = false, onPress }: { emoji: string; label?: string; busy?: boolean; onPress?: () => void }) {
  const { theme, scheme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.railButton, { backgroundColor: theme.colors.glassSurface }]}
      hitSlop={tokens.spacing.xs}
      accessibilityRole="button"
    >
      <BlurView
        intensity={theme.colors.glassBlur as number}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.railButtonContent}>
        {busy ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <AppText variant="caption">{emoji}</AppText>}
        {label ? (
          <AppText variant="captionBold" tone="secondary">
            {label}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function SocialMetric({ emoji, value, label, onPress }: { emoji: string; value: string; label: string; onPress?: () => void }) {
  const content = (
    <View style={styles.socialMetricContent}>
      <AppText variant="caption" tone="inverse">
        {emoji}
      </AppText>
      <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );

  if (!onPress) {
    return (
      <View style={styles.socialMetric} accessibilityLabel={`${value} ${label}`}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={styles.socialMetric}
      hitSlop={tokens.spacing.xs}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  pressable: {
    flex: 1,
  },
  coverFrame: {
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  imageFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  storeBadge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    minHeight: 28,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDropBadge: {
    position: 'absolute',
    top: 42,
    left: tokens.spacing.sm,
    maxWidth: '22%',
  },
  actionRail: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: 108,
    gap: tokens.spacing.xs,
    zIndex: 2,
  },
  railButton: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
    overflow: 'hidden',
  },
  railButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  menuButton: {
    position: 'absolute',
    top: tokens.spacing.sm,
    right: tokens.spacing.sm,
    width: 36,
    height: 36,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  menu: {
    position: 'absolute',
    top: 48,
    right: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minWidth: 96,
    zIndex: 5,
  },
  menuItem: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  metadataGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 118,
    justifyContent: 'flex-end',
    paddingTop: tokens.spacing.xl,
  },
  metadataPanel: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  priceText: {
    flexShrink: 1,
    textAlign: 'right',
  },
  socialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  socialMetric: {
    minHeight: 24,
    borderRadius: tokens.radius.full,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  socialMetricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    alignSelf: 'flex-start',
  },
});

export default CollectionCard;
