import React, { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { MarketContentItem } from '@/src/features/market/types';
import { getDesignDisplayPrice, getProductDisplayPrice, productStock } from '@/src/features/market/marketUtils';

type Props = {
  item: MarketContentItem;
  width: number;
  favorite: boolean;
  bagBusy: boolean;
  favoriteBusy: boolean;
  onOpen: (item: MarketContentItem) => void;
  onBag: (item: MarketContentItem) => void;
  onFavorite: (item: MarketContentItem) => void;
};

export const MarketProductCard = memo(function MarketProductCard({
  item,
  width,
  favorite,
  bagBusy,
  favoriteBusy,
  onOpen,
  onBag,
  onFavorite,
}: Props) {
  const { theme, scheme } = useTheme();
  const isProduct = item.kind === 'product';
  const product = isProduct ? item.product : null;
  const design = item.kind === 'design' ? item.design : null;
  const title = product?.name ?? design?.collectionTitle ?? 'Untitled';
  const brandName = product?.brandName ?? design?.brandName ?? design?.username ?? 'Threadly brand';
  const price = product ? getProductDisplayPrice(product) : design ? getDesignDisplayPrice(design) : 'Price on request';
  const stock = product ? productStock(product) : 0;
  const unavailable = product ? stock <= 0 && !product.customOrderEnabled : false;
  const imageSource = product?.coverImage ?? design?.media?.url ?? design?.media?.previewUrl ?? null;
  const imageFileId = product?.coverImageId ?? design?.media?.fileId ?? null;
  const imageUri = useResolvedImageUri({
    src: imageSource,
    fileId: imageFileId,
    enabled: Boolean(imageSource || imageFileId),
  });

  const badge = useMemo(() => {
    if (isProduct && unavailable) return 'Out';
    if (isProduct && product?.customOrderEnabled) return 'Custom';
    return design ? 'Design' : 'Product';
  }, [design, isProduct, product?.customOrderEnabled, unavailable]);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View style={[styles.mediaWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
        {imageUri ? (
          <StableImage uri={imageUri} containerStyle={styles.image} imageStyle={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.fallback}>
            <AppText variant="subtitle" tone="muted">Image</AppText>
          </View>
        )}

        <View style={styles.topActions}>
          <Pressable
            onPress={() => onFavorite(item)}
            disabled={favoriteBusy}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder },
              pressed && styles.iconPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {favoriteBusy ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <AppText variant="captionBold" tone={favorite ? 'primary' : 'secondary'}>
                {favorite ? '♥' : '♡'}
              </AppText>
            )}
          </Pressable>
        </View>

        <View style={[styles.badgeWrap, { backgroundColor: theme.colors.glassSurfaceStrong }]}>
          <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
            {badge}
          </AppText>
        </View>

        <BlurView tint={scheme === 'dark' ? 'dark' : 'light'} intensity={theme.colors.glassBlur as number} style={styles.copyOverlay}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.glassSurfaceStrong }]} />
          <View style={styles.copy}>
            <AppText variant="captionBold" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {brandName}
            </AppText>
            <View style={styles.footerRow}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1} style={styles.priceText}>
                {price}
              </AppText>
              <Pressable
                onPress={() => onBag(item)}
                disabled={bagBusy || unavailable}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.bagButton,
                  {
                    backgroundColor: unavailable ? theme.colors.controlSurfaceActive : theme.colors.primary,
                  },
                  pressed && !unavailable && styles.iconPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={isProduct ? 'Add product to bag' : 'Start design bag flow'}
              >
                {bagBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                ) : (
                  <AppText variant="captionBold" tone="inverse">
                    Bag
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 0.82,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActions: {
    position: 'absolute',
    top: tokens.spacing.xs,
    right: tokens.spacing.xs,
    zIndex: 5,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  badgeWrap: {
    position: 'absolute',
    top: tokens.spacing.xs,
    left: tokens.spacing.xs,
    minHeight: 24,
    paddingHorizontal: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyOverlay: {
    position: 'absolute',
    left: tokens.spacing.xs,
    right: tokens.spacing.xs,
    bottom: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  copy: {
    padding: tokens.spacing.sm,
    gap: 2,
  },
  footerRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  priceText: {
    flex: 1,
    minWidth: 0,
  },
  bagButton: {
    minWidth: 42,
    height: 32,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
});
