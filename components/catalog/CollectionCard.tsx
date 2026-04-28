import React, { useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import type { CollectionDto } from '@/src/api/BrandApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens, GLASS } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

interface CollectionCardProps {
  collection: CollectionDto;
  onPress?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onShare?: (id: string) => void;
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

const formatCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};

const priceRange = (minPrice?: number | null, maxPrice?: number | null) => {
  const min = formatPrice(minPrice);
  const max = formatPrice(maxPrice);
  if (min && max) return `${min} - ${max}`;
  if (min) return `${min}+`;
  if (max) return `Up to ${max}`;
  return 'Price on request';
};

export const CollectionCardSkeleton = ({ width = 180 }: { width?: number }) => {
  const imageHeight = Math.round(width * 0.86);

  return (
    <View style={[styles.card, { width }]}>
      <Skeleton width={width} height={imageHeight} borderRadius={tokens.radius.lg} />
      <View style={styles.skeletonBody}>
        <Skeleton width="70%" height={14} borderRadius={tokens.radius.sm} />
        <Skeleton width="45%" height={12} borderRadius={tokens.radius.sm} />
        <Skeleton width="52%" height={32} borderRadius={tokens.radius.md} />
      </View>
    </View>
  );
};

export const CollectionCard = React.memo(function CollectionCard({
  collection,
  onPress,
  onEdit,
  onDelete,
  onLike,
  onComment,
  onShare,
  showActions = true,
  isDraft = false,
  isOwner = false,
  cardWidth,
}: CollectionCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;

  const width = Math.round(cardWidth ?? (screenWidth - tokens.spacing.lg * 2 - tokens.spacing.md) / 2);
  const imageHeight = Math.round(width * 0.88);
  const coverUri = useResolvedImageUri({
    src: collection.coverImage,
    fileId: collection.coverFileId,
  });
  const brandLogoUri = useResolvedImageUri({
    src: collection.brandLogo,
    fileId: collection.brandLogoFileId,
  });

  const displayTitle = collection.title?.trim() || 'Untitled collection';
  const brandName = collection.brandName?.trim() || 'Brand';
  const handle = collection.username ? `@${collection.username}` : null;
  const pieceCount = collection.itemCount || collection.postsCount || 0;
  const priceLabel = useMemo(
    () => priceRange(collection.saleMinPrice ?? collection.minPrice, collection.saleMaxPrice ?? collection.maxPrice),
    [collection.maxPrice, collection.minPrice, collection.saleMaxPrice, collection.saleMinPrice],
  );

  const disabled = collection.clientStatus === 'publishing';

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
    <Animated.View
      style={[
        styles.card,
        {
          width,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => animate(0.98)}
        onPressOut={() => animate(1)}
        style={styles.pressable}
      >
        <View style={[styles.coverFrame, { height: imageHeight, backgroundColor: theme.colors.surfaceAlt }]}>
          {showImage ? (
            <StableImage
              uri={coverUri}
              resizeMode="cover"
              containerStyle={[styles.coverImage, { width, height: imageHeight }]}
              imageStyle={[styles.coverImage, { width, height: imageHeight }]}
              onError={() => setImageFailed(true)}
              fallback={<ImageFallback title={displayTitle} />}
            />
          ) : (
            <ImageFallback title={displayTitle} />
          )}

          {collection.isAvailableInStore ? (
            <View style={[styles.storeBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
              <AppText variant="caption" tone="primary">
                Store
              </AppText>
            </View>
          ) : null}

          {showActions && !isDraft ? (
            <View style={styles.actionRail}>
              <RailButton label={formatCount(collection.likesCount ?? 0)} emoji="🧵" onPress={() => onLike?.(collection.id)} />
              <RailButton label={formatCount(collection.commentsCount ?? 0)} emoji="💬" onPress={() => onComment?.(collection.id)} />
              <RailButton emoji="↗" onPress={() => onShare?.(collection.id)} />
            </View>
          ) : null}

          {isOwner ? (
            <Pressable
              onPress={() => setMenuVisible((current) => !current)}
              style={[styles.menuButton, { backgroundColor: theme.colors.surfaceOverlay }]}
              hitSlop={tokens.spacing.sm}
              accessibilityRole="button"
              accessibilityLabel="Collection actions"
            >
              <AppText variant="caption">⋯</AppText>
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
                  <AppText variant="caption">Edit</AppText>
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
                  <AppText variant="caption" tone="danger">
                    Delete
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.brandRow}>
            {brandLogoUri ? (
              <StableImage
                uri={brandLogoUri}
                resizeMode="cover"
                containerStyle={styles.avatar}
                imageStyle={styles.avatar}
                fallback={<AvatarFallback label={brandName} />}
              />
            ) : (
              <AvatarFallback label={brandName} />
            )}
            <View style={styles.brandText}>
              <AppText variant="caption" numberOfLines={1}>
                {brandName}
              </AppText>
              {handle ? (
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {handle}
                </AppText>
              ) : null}
            </View>
          </View>

          <AppText variant="title" numberOfLines={2}>
            {displayTitle}
          </AppText>
          <AppText variant="caption" tone="muted">
            {pieceCount} piece{pieceCount === 1 ? '' : 's'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {priceLabel}
          </AppText>

          {collection.clientStatus ? (
            <View style={[styles.statusPill, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="caption" tone={collection.clientStatus === 'publish-failed' ? 'danger' : 'primary'}>
                {collection.clientStatusMessage || (collection.clientStatus === 'publish-failed' ? 'Publish failed' : 'Publishing')}
              </AppText>
            </View>
          ) : null}

          {isDraft ? (
            <Button title="Continue" variant="outline" size="sm" onPress={onPress} />
          ) : (
            <Button title="View" variant="outline" size="sm" onPress={onPress} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

function ImageFallback({ title }: { title: string }) {
  const { scheme } = useTheme();
  const isDark = scheme === 'dark';
  return (
    <LinearGradient
      colors={isDark ? ['#1e1e24', '#111'] : ['#f3f4f6', '#e5e7eb']}
      style={styles.imageFallback}
    >
      <AppText style={{ fontSize: 28, marginBottom: 8 }}>🖼️</AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1}>
        {title.trim() ? 'Image unavailable' : 'No image'}
      </AppText>
    </LinearGradient>
  );
}

function AvatarFallback({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
      <AppText variant="caption" tone="inverse">
        {label.trim().charAt(0).toUpperCase() || 'B'}
      </AppText>
    </View>
  );
}

function RailButton({ emoji, label, onPress }: { emoji: string; label?: string; onPress?: () => void }) {
  const { scheme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.railButton, { backgroundColor: scheme === 'dark' ? GLASS.dark.bg : GLASS.light.bg }]}
      hitSlop={tokens.spacing.xs}
    >
      <BlurView
        intensity={scheme === 'dark' ? GLASS.dark.blur : GLASS.light.blur}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <AppText variant="caption">{emoji}</AppText>
        {label ? (
          <AppText variant="caption" tone="muted">
            {label}
          </AppText>
        ) : null}
      </View>
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionRail: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    gap: tokens.spacing.xs,
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
  menuButton: {
    position: 'absolute',
    top: tokens.spacing.sm,
    right: tokens.spacing.sm,
    width: 36,
    height: 36,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    top: 48,
    right: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minWidth: 96,
  },
  menuItem: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  body: {
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    alignSelf: 'flex-start',
  },
  skeletonBody: {
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
});

export default CollectionCard;
