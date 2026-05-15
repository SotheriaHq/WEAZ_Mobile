import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type UnifiedProductCardProps = {
  width: number;
  height?: number;
  title: string;
  brandName?: string | null;
  priceLabel?: string | null;
  mediaSrc?: string | null;
  mediaFileId?: string | null;
  typeLabel?: string | null;
  unavailable?: boolean;
  favorite?: boolean;
  favoriteBusy?: boolean;
  actionLabel?: string;
  actionBusy?: boolean;
  actionDisabled?: boolean;
  topRightSlot?: React.ReactNode;
  metaLabel?: string | null;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onFavoritePress?: () => void;
  onActionPress?: () => void;
};

const IMAGE_FALLBACK_ICON = String.fromCodePoint(0x1f5bc, 0xfe0f);
const FAVORITE_ICON = String.fromCodePoint(0x2764, 0xfe0f);
const FAVORITE_EMPTY_ICON = String.fromCodePoint(0x1f90d);

export const UnifiedProductCard = memo(function UnifiedProductCard({
  width,
  height,
  title,
  brandName,
  priceLabel,
  mediaSrc,
  mediaFileId,
  typeLabel,
  unavailable = false,
  favorite = false,
  favoriteBusy = false,
  actionLabel,
  actionBusy = false,
  actionDisabled = false,
  topRightSlot,
  metaLabel,
  style,
  onPress,
  onFavoritePress,
  onActionPress,
}: UnifiedProductCardProps) {
  const { theme, scheme } = useTheme();
  const resolvedUri = useResolvedImageUri({
    src: mediaSrc,
    fileId: mediaFileId,
    enabled: Boolean(mediaSrc || mediaFileId),
  });
  const cardHeight = height ?? Math.round(width * 1.58);
  const canPressAction = Boolean(onActionPress) && !actionBusy && !actionDisabled && !unavailable;
  const displayBrand = brandName?.trim() || metaLabel?.trim() || 'Threadly brand';
  const displayPrice = priceLabel?.trim() || 'Price on request';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          height: cardHeight,
          borderColor: theme.colors.glassBorder,
          backgroundColor: theme.colors.surfaceAlt,
        },
        pressed && styles.cardPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      {resolvedUri ? (
        <StableImage
          uri={resolvedUri}
          resizeMode="cover"
          containerStyle={styles.media}
          imageStyle={styles.media}
          fadeDuration={140}
        />
      ) : (
        <LinearGradient
          colors={[theme.colors.surfaceAlt, theme.colors.surface, theme.colors.surfaceAlt]}
          style={styles.fallback}
        >
          <AppText variant="title" tone="muted">
            {IMAGE_FALLBACK_ICON}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            Image unavailable
          </AppText>
        </LinearGradient>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.backdrop, theme.colors.backdropStrong]}
        style={styles.mediaShade}
      />

      {typeLabel ? (
        <View style={[styles.typeBadge, { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder }]}>
          <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
            {typeLabel}
          </AppText>
        </View>
      ) : null}

      {topRightSlot ? (
        <View style={styles.topRightSlot}>{topRightSlot}</View>
      ) : onFavoritePress ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onFavoritePress();
          }}
          disabled={favoriteBusy}
          hitSlop={tokens.spacing.sm}
          style={({ pressed }) => [
            styles.favoriteButton,
            { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder },
            pressed && styles.inlinePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {favoriteBusy ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <AppText variant="captionBold" tone="inverse">
              {favorite ? FAVORITE_ICON : FAVORITE_EMPTY_ICON}
            </AppText>
          )}
        </Pressable>
      ) : null}

      <BlurView tint={scheme === 'dark' ? 'dark' : 'light'} intensity={theme.colors.glassBlur as number} style={styles.copyOverlay}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.backdropStrong }]} />
        <View style={styles.copyStack}>
          <View style={styles.titleBlock}>
            <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="caption" tone="inverse" numberOfLines={1}>
              {displayBrand}
            </AppText>
          </View>

          <View style={styles.actionRow}>
            <AppText variant="captionBold" tone="primary" numberOfLines={1} style={styles.priceText}>
              {displayPrice}
            </AppText>
            {actionLabel ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onActionPress?.();
                }}
                disabled={!canPressAction}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: canPressAction ? theme.colors.primary : theme.colors.controlSurfaceActive,
                    borderColor: canPressAction ? theme.colors.primary : theme.colors.glassBorder,
                    opacity: canPressAction ? 1 : 0.72,
                  },
                  pressed && canPressAction && styles.inlinePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                {actionBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                ) : (
                  <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                    {actionLabel}
                  </AppText>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </BlurView>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaShade: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  typeBadge: {
    position: 'absolute',
    left: tokens.spacing.sm,
    top: tokens.spacing.sm,
    minHeight: 28,
    maxWidth: '62%',
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRightSlot: {
    position: 'absolute',
    right: tokens.spacing.sm,
    top: tokens.spacing.sm,
  },
  favoriteButton: {
    position: 'absolute',
    right: tokens.spacing.sm,
    top: tokens.spacing.sm,
    width: 38,
    height: 38,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyOverlay: {
    position: 'absolute',
    left: tokens.spacing.sm,
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  copyStack: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  titleBlock: {
    minWidth: 0,
  },
  actionRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  priceText: {
    flex: 1,
    minWidth: 0,
  },
  actionButton: {
    minWidth: 50,
    height: 34,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  inlinePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
});

export default UnifiedProductCard;
