import React, { memo } from 'react';
import { BAG_IT_LABEL, CUSTOM_ORDER_EMOJI } from '@/src/constants/bagging';
import { BagPulseIcon } from '@/components/ui/BagPulseIcon';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
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
  /**
   * Custom-order item — shown as a scissors mark, not the words "Custom quote".
   *
   * Passed explicitly rather than sniffed out of `priceLabel`, because the
   * label is display copy and can change; whether an item takes custom orders
   * is a fact about the item.
   */
  customOrder?: boolean;
  mediaSrc?: string | null;
  mediaFileId?: string | null;
  typeLabel?: string | null;
  unavailable?: boolean;
  favorite?: boolean;
  favoriteBusy?: boolean;
  favoriteAccessibilityLabel?: string;
  actionLabel?: string;
  actionBusy?: boolean;
  actionDisabled?: boolean;
  topRightSlot?: React.ReactNode;
  metaLabel?: string | null;
  newDropItemId?: string;
  newDropCreatedAt?: string | null;
  analyticsSourceScreen?: string;
  feedPosition?: number;
  allowSignedFallback?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  /** Phase 5: fired on press-in to warm the destination before navigation. */
  onPressIn?: () => void;
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
  priceLabel,
  customOrder = false,
  mediaSrc,
  mediaFileId,
  unavailable = false,
  favorite = false,
  favoriteBusy = false,
  favoriteAccessibilityLabel,
  actionLabel,
  actionBusy = false,
  actionDisabled = false,
  topRightSlot,
  newDropItemId,
  newDropCreatedAt,
  analyticsSourceScreen = 'market',
  feedPosition,
  allowSignedFallback = true,
  style,
  onPress,
  onPressIn,
  onFavoritePress,
  onActionPress,
}: UnifiedProductCardProps) {
  const { theme, scheme } = useTheme();
  const resolvedUri = useResolvedImageUri({
    src: mediaSrc,
    fileId: mediaFileId,
    enabled: Boolean(mediaSrc || mediaFileId),
    allowSignedFallback,
  });
  const cardHeight = height ?? Math.round(width * 1.58);
  const canPressAction = Boolean(onActionPress) && !actionBusy && !actionDisabled && !unavailable;
  const displayPrice = priceLabel?.trim() || 'Price on request';
  const isBagAction = actionLabel === BAG_IT_LABEL;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
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

      {newDropItemId ? (
        <NewDropBadge
          itemId={newDropItemId}
          createdAt={newDropCreatedAt}
          sourceScreen={analyticsSourceScreen}
          feedPosition={feedPosition}
          compact
          style={styles.newDropBadge}
        />
      ) : null}

      {/*
        The price used to be a floating chip pinned over the artwork here, and
        the custom-order state was folded into it as the words "Custom quote" —
        which, in a chip that narrow, rendered as "Custo...". Both are card COPY
        and belong in the copy panel with the title, where there is room for
        them and only one text surface on the card. See `metaRow` below.
      */}
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
          accessibilityLabel={favoriteAccessibilityLabel ?? (favorite ? 'Remove from favorites' : 'Add to favorites')}
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

      <BlurView
        tint={scheme === 'dark' ? 'dark' : 'light'}
        intensity={theme.colors.glassBlur as number}
        style={[styles.copyOverlay, { maxHeight: Math.round(cardHeight * 0.2) }]}
      >
        {/*
          A gradient, so the panel has no top edge to see.

          This was a flat `backdropStrong` fill inside an inset, rounded box —
          a visible dark rectangle pasted onto the photograph, with its own
          corners and its own hard boundary. Ramping from transparent into the
          same strong scrim means the panel emerges out of the image instead of
          sitting on it, and the text still lands on the opaque end where it is
          legible over anything.
        */}
        <LinearGradient
          pointerEvents="none"
          colors={[tokens.scrim(0), tokens.scrim(0.45), theme.colors.backdropStrong]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.copyStack}>
          <View style={styles.titleBlock}>
            <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
              {title}
            </AppText>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.metaBlock}>
              {customOrder ? (
                <AppText
                  variant="captionBold"
                  tone="inverse"
                  style={styles.customMark}
                  accessibilityLabel="Custom order available"
                >
                  {CUSTOM_ORDER_EMOJI}
                </AppText>
              ) : null}
              <AppText
                variant="captionBold"
                tone="inverse"
                numberOfLines={1}
                style={styles.priceText}
              >
                {displayPrice}
              </AppText>
            </View>
            {actionLabel ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onActionPress?.();
                }}
                disabled={!canPressAction}
                hitSlop={tokens.spacing.sm}
                style={({ pressed }) => [
                  isBagAction ? styles.bagAction : styles.actionButton,
                  isBagAction
                    ? null
                    : {
                        backgroundColor: canPressAction
                          ? theme.colors.primary
                          : theme.colors.controlSurfaceActive,
                        borderColor: canPressAction ? theme.colors.primary : theme.colors.glassBorder,
                        opacity: canPressAction ? 1 : 0.72,
                      },
                  pressed && canPressAction && styles.inlinePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                {/*
                  The bag MARK, not the words "Bag It".

                  A card is mostly photograph; the two words competed with the
                  title and the price for the little text room there is, and
                  they say nothing the shopping-bag glyph does not. Any other
                  action ("Out", "View") keeps its word, because those have no
                  established mark. The full label stays on
                  `accessibilityLabel`, so nothing is lost to a screen reader.
                */}
                {actionBusy && !isBagAction ? (
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                ) : isBagAction ? (
                  /*
                    The mark and its heartbeat, with nothing behind it.

                    This was the bag glyph on a solid purple pill — a filled
                    button dropped onto the photograph, which is the loudest
                    element on a card whose subject is the garment. `bare` keeps
                    the pulse (that is what says the control is live) and drops
                    the plate. Busy state rides the same icon rather than
                    swapping in a spinner, so the glyph never disappears
                    mid-tap.
                  */
                  <BagPulseIcon
                    status={
                      actionBusy ? 'bagging' : canPressAction ? 'not_bagged' : 'disabled'
                    }
                    context="multi_card"
                    surface="bare"
                    size={30}
                  />
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
    ...StyleSheet.absoluteFill,
  },
  mediaShade: {
    ...StyleSheet.absoluteFill,
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  newDropBadge: {
    position: 'absolute',
    left: tokens.spacing.sm,
    top: tokens.spacing.sm,
    maxWidth: '18%',
    opacity: 0.9,
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
  /**
   * Full-bleed. The card's own rounding clips it, so the panel needs none.
   *
   * It used to be inset on three sides with its own radius, which read as a
   * floating chip laid over the artwork — two sets of rounded corners, one
   * inside the other, and a strip of untouched photo between them. Taking it to
   * the edges lets the media fill the card and leaves the gradient above as the
   * only thing separating text from image.
   */
  copyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  copyStack: {
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
    gap: tokens.spacing.xs,
  },
  titleBlock: {
    minWidth: 0,
  },
  actionRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  metaBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  customMark: {
    textShadowColor: tokens.scrim(0.9),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  priceText: {
    flexShrink: 1,
    minWidth: 0,
  },
  bagAction: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    minWidth: 50,
    height: 26,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  inlinePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
});

export default UnifiedProductCard;
