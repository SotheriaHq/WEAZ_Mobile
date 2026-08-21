import React, { useEffect, useMemo, useState } from 'react';
import { formatMoneyRange } from '@/src/utils/money';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

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
  onPress?: (collection: CollectionDto) => void;
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
  /** Status the surrounding list is already filtered to; matching cards drop the chip. */
  impliedStatus?: string | null;
  isOwner?: boolean;
  cardWidth?: number;
  onClientRetry?: (collection: CollectionDto) => void;
  onClientDismiss?: (collection: CollectionDto) => void;
}

/**
 * These were US DOLLARS.
 *
 * `Intl.NumberFormat('en-US', { currency: 'USD' })` rendered every catalog card
 * price as `$40,000` — on a Naira storefront, on the first thing a shopper
 * sees. WIEZ trades in Naira; the shared formatter owns the symbol so no screen
 * can pick its own currency by accident again.
 */
const priceRange = (minPrice?: number | null, maxPrice?: number | null) => {
  const positive = (value?: number | null) =>
    typeof value === 'number' && value > 0 ? value : null;
  return formatMoneyRange(positive(minPrice), positive(maxPrice)) ?? 'Price on request';
};

const compactCount = (value?: number | null): string => {
  const count = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.max(0, count));
};

export const CollectionCardSkeleton = ({ width = 180 }: { width?: number }) => {
  const imageHeight = Math.round(width * 1.58);

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
  impliedStatus = null,
  isOwner = false,
  cardWidth,
  onClientRetry,
  onClientDismiss,
}: CollectionCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;

  const width = Math.round(cardWidth ?? (screenWidth - tokens.spacing.lg * 2 - tokens.spacing.md) / 2);
  const imageHeight = Math.round(width * 1.58);
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

  /**
   * True when the surrounding list is ALREADY filtered to this card's status —
   * the Drafts tab, the In Review tab, and so on. The chip then says nothing
   * the heading has not, so it is dropped and the artwork gets the corner back.
   */
  const statusIsImplied =
    Boolean(impliedStatus) &&
    String(impliedStatus).toUpperCase() ===
      (isDraft && !backendStatus ? 'DRAFT' : backendStatus || 'DRAFT');

  const isMinimalCard = isDraft || Boolean(reviewStatusLabel);

  const isClientPublishing = collection.clientStatus === 'publishing';
  const disabled = isClientPublishing;
  const clientProgress =
    typeof collection.clientProgress === 'number' && Number.isFinite(collection.clientProgress)
      ? Math.min(1, Math.max(0, collection.clientProgress))
      : null;
  const clientProgressPercent = clientProgress == null ? null : Math.round(clientProgress * 100);
  const cookingDots = useLoadingDots(isClientPublishing);
  const clientFailureReason =
    collection.clientFailureReason || collection.clientStatusMessage || collection.description || 'Something went wrong. Please try again.';

  const animate = React.useCallback(
    (next: number) => {
      Animated.spring(scale, {
        toValue: next,
        friction: 8,
        useNativeDriver: true,
        isInteraction: false,
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
          // Explicit height guarantees the card can never collapse into a thin
          // line. Elevation lives here (NOT combined with overflow:hidden) — on
          // Android, elevation + overflow:hidden on the same view drops child
          // layers, which is what made draft cards render as gray slivers. The
          // rounded clipping is delegated to the inner cardClip view below.
          height: imageHeight,
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.82 : 1,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={[styles.cardClip, { backgroundColor: theme.colors.surface }]}>
      <Pressable
        onPress={collection.clientStatus || !onPress ? undefined : () => onPress(collection)}
        onPressIn={disabled ? undefined : () => animate(0.98)}
        onPressOut={disabled ? undefined : () => animate(1)}
        style={styles.pressable}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Open ${copy.badgeLabel.toLowerCase()} ${displayTitle}`}
      >
        <View style={[styles.coverFrame, { height: imageHeight, backgroundColor: theme.colors.surfaceAlt }]}>
          {showImage ? (
            <>
              {/* Fixed-aspect catalog thumbnail: fill the frame edge-to-edge (cover) so
              it never letterboxes into top/bottom strips. This matches the Shop tab
              product cards, keeping Content and Shop shells visually aligned. Large
              aspect-aware (contain) treatment is reserved for immersive viewers, not
              small grid cards (see AspectAwareMedia README "When Not To Use"). */}
              <StableImage
                uri={coverUri}
                resizeMode="cover"
                containerStyle={[styles.coverImage, { width, height: imageHeight }]}
                imageStyle={[styles.coverImage, { width, height: imageHeight }]}
                onError={() => setImageFailed(true)}
                fallback={<ImageFallback title={displayTitle} />}
              />
            </>
          ) : (
            <ImageFallback title={displayTitle} />
          )}

          {collection.clientStatus ? (
            <View pointerEvents="none" style={[styles.clientStatusScrim, { backgroundColor: theme.colors.backdropStrong }]} />
          ) : null}

          {/*
            No type badge on the face.

            "Design" / "Collection" labelled every card in a grid where all the
            cards are the same type — it told the viewer nothing they could act
            on and spent the top-left corner, the most valuable spot on the
            image, saying it. `copy.badgeLabel` is still used for the
            accessibility label, where naming the type IS useful.
          */}
          {!isMinimalCard ? (
            <NewDropBadge
              itemId={collection.id}
              createdAt={collection.createdAt}
              sourceScreen="profile-catalog"
              compact
              style={styles.newDropBadge}
            />
          ) : null}

          {/*
            Save and Share live in the content view, not on the card.

            A grid tile's job is to make you want to open it. Hanging two
            secondary actions over the artwork asked for a decision the viewer
            has no basis for yet — they have not seen the design properly — and
            put two more tap targets in the way of the one that matters. Both
            actions still exist, one level in, where the content is actually on
            screen to judge.

            `onSave`/`onShare` remain in the props so callers do not all have to
            change at once; they are simply not rendered here.
          */}

          {isOwner && !collection.clientStatus ? (
            <Pressable
              onPress={() => setMenuVisible((current) => !current)}
              style={[styles.menuButton, { backgroundColor: 'transparent' }]}
              hitSlop={tokens.spacing.sm}
              accessibilityRole="button"
              accessibilityLabel={copy.ownerActionsLabel}
            >
              {/* Emoji marker per Rule 5. `textShadow*` is legal on AppText —
                  only typography and colour are forbidden overrides — and the
                  shadow is what keeps the glyph legible over any cover image. */}
              <AppText variant="title" tone="inverse" style={styles.menuGlyph}>
                ⋯
              </AppText>
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
                <View style={styles.clientStatusBlock}>
                  {isClientPublishing ? (
                    <View style={styles.clientCookingRow}>
                      <CircularProgress
                        progress={clientProgress ?? 0.01}
                        size={42}
                        color={theme.colors.primary}
                        trackColor={tokens.tintLight(0.28)}
                      />
                      <View style={styles.clientCookingCopy}>
                        <AppText variant="badgeLabel" tone="primary" numberOfLines={1}>
                          design cooking{cookingDots}
                        </AppText>
                        <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                          {clientProgressPercent == null ? 'Starting upload' : `${clientProgressPercent}%`}
                        </AppText>
                        {collection.clientStatusMessage ? (
                          <AppText variant="caption" tone="inverse" numberOfLines={1}>
                            {collection.clientStatusMessage}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.statusPill, { backgroundColor: 'transparent' }]}>
                        <AppText variant="badgeLabel" tone="danger" numberOfLines={1}>
                          {isDraft ? 'DRAFT SAVE FAILED' : 'PUBLISH FAILED'}
                        </AppText>
                      </View>
                      <AppText variant="caption" tone="inverse" numberOfLines={2}>
                        {clientFailureReason}
                      </AppText>
                      <View style={styles.clientActionRow}>
                        {onClientRetry ? (
                          <Pressable
                            onPress={() => onClientRetry(collection)}
                            style={({ pressed }) => [styles.clientActionButton, pressed ? styles.clientActionPressed : null]}
                            accessibilityRole="button"
                            accessibilityLabel={`Retry or edit ${displayTitle}`}
                          >
                            <AppText variant="captionBold" tone="inverse">Retry / Edit</AppText>
                          </Pressable>
                        ) : null}
                        {onClientDismiss ? (
                          <Pressable
                            onPress={() => onClientDismiss(collection)}
                            style={({ pressed }) => [styles.clientActionButton, pressed ? styles.clientActionPressed : null]}
                            accessibilityRole="button"
                            accessibilityLabel={`Dismiss failed upload ${displayTitle}`}
                          >
                            <AppText variant="captionBold" tone="inverse">Dismiss</AppText>
                          </Pressable>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>
              ) : isDraft && !statusIsImplied ? (
                // Suppressed on the Drafts tab: the heading has already said it,
                // so the chip only restates where the user is standing.
                <View style={[styles.statusPill, { backgroundColor: 'transparent' }]}>
                  <AppText variant="badgeLabel" tone="primary" numberOfLines={1}>
                    DRAFT
                  </AppText>
                </View>
              ) : isOwner && reviewStatusLabel && !statusIsImplied ? (
                <Pressable
                  onPress={needsReviewDecision ? () => setReviewDecisionOpen(true) : undefined}
                  style={[styles.statusPill, { backgroundColor: 'transparent' }]}
                  accessibilityRole={needsReviewDecision ? 'button' : undefined}
                  accessibilityLabel={needsReviewDecision ? `View ${reviewStatusLabel} feedback` : reviewStatusLabel}
                >
                  <AppText
                    variant="badgeLabel"
                    tone={backendStatus === 'CHANGES_REQUESTED' ? 'primary' : backendStatus === 'REJECTED' ? 'danger' : 'primary'}
                    numberOfLines={1}
                  >
                    {reviewStatusLabel.toUpperCase()}
                  </AppText>
                </Pressable>
              ) : null}

              <AppText variant="smallBold" tone="inverse" numberOfLines={2}>
                {displayTitle}
              </AppText>
              {/*
                No brand name here. Every card in this grid belongs to the brand
                whose catalog the viewer is already inside, so repeating it once
                per tile is noise in the one place where space is tightest.
              */}
              {/*
                Price leads, angle count trails.

                Price is the decision; the angle count is reassurance about how
                much of the garment you get to inspect. Reading order should
                match that, and it puts the count in the bottom-right corner
                where it reads as a quiet stamp rather than a headline.
              */}
              {!isMinimalCard ? (
                <View style={styles.cardMetaRow}>
                  <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                    {priceLabel}
                  </AppText>
                  <AppText variant="captionBold" tone="inverse" numberOfLines={1} style={styles.priceText}>
                    {pieceCount} {countLabel}
                  </AppText>
                </View>
              ) : null}
              {!isMinimalCard ? (
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
              ) : null}
            </View>
          </LinearGradient>
        </View>
      </Pressable>
      </View>
    </Animated.View>
    <ContentReviewDecisionSheet
      open={reviewDecisionOpen}
      onClose={() => setReviewDecisionOpen(false)}
      submissionId={collection.submissionId}
      status={backendStatus}
      title={displayTitle}
      onEdit={onEdit ? () => onEdit(collection.id) : onPress ? () => onPress(collection) : undefined}
    />
    </>
  );
});

function useLoadingDots(active: boolean) {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (!active) {
      setCount(1);
      return;
    }
    const timer = setInterval(() => {
      setCount((current) => (current >= 3 ? 1 : current + 1));
    }, 450);
    return () => clearInterval(timer);
  }, [active]);

  return '.'.repeat(count);
}

function CircularProgress({
  progress,
  size,
  color,
  trackColor,
}: {
  progress: number;
  size: number;
  color: string;
  trackColor: string;
}) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.max(0.01, Math.min(1, progress));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="transparent"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - safeProgress)}
        rotation="-90"
        originX={size / 2}
        originY={size / 2}
      />
    </Svg>
  );
}

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
    overflow: 'visible',
    shadowColor: tokens.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: tokens.elevation.lg.elevation,
    borderRadius: tokens.radius.lg,
  },
  cardClip: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
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
  clientStatusScrim: {
    ...StyleSheet.absoluteFill,
    opacity: 0.58,
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
  menuGlyph: {
    textShadowColor: tokens.scrim(0.5),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    backgroundColor: tokens.tintLight(0.12),
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
  clientStatusBlock: {
    gap: tokens.spacing.xs,
  },
  clientCookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  clientCookingCopy: {
    flex: 1,
    gap: 2,
  },
  clientActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  clientActionButton: {
    minHeight: 28,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.tintLight(0.45),
    paddingHorizontal: tokens.spacing.sm,
    justifyContent: 'center',
    backgroundColor: tokens.tintLight(0.14),
  },
  clientActionPressed: {
    opacity: 0.72,
  },
  clientProgressTrack: {
    height: 4,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    backgroundColor: tokens.tintLight(0.28),
  },
  clientProgressFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
});

export default CollectionCard;
