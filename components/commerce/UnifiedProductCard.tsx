import React, { memo, useState } from 'react';
import { BAG_IT_LABEL, CUSTOM_ORDER_EMOJI } from '@/src/constants/bagging';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { MediaScrim } from '@/components/ui/MediaScrim';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { BagItButton } from '@/components/commerce/BagItButton';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { CLIP_EMOJI, clipAccessibilityLabel } from '@/src/constants/clipping';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MuseLoader } from '@/components/ui/MuseLoader';

/**
 * The card's photo frame: width × 1.58 unless a caller passes its own height.
 *
 * This is the frame the card has always had. The copy strip is ATTACHED
 * beneath it — the photograph is never shrunk to make room for text.
 */
export const PRODUCT_TILE_MEDIA_RATIO = 1.58;

/**
 * Height of the compact copy strip under the photo: one title line, then the
 * price row with the compact Bag It. Placeholders use it so a loading card is
 * the same size as the card that replaces it.
 */
export const PRODUCT_CARD_BODY_HEIGHT =
  tokens.spacing.xs +
  tokens.typography.smallBold.lineHeight +
  tokens.spacing.xs +
  tokens.button.xs.height +
  tokens.spacing.sm;

type UnifiedProductCardProps = {
  width: number;
  /** Photo height — the card's original frame. Defaults to width × 1.58. */
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
  /**
   * `BAG_IT_LABEL` renders the shared Bag It button; any other label renders a
   * plain button with that word. With no label the card offers "View", so every
   * card in a row has the same action row and the same height.
   */
  actionLabel?: string;
  actionBusy?: boolean;
  actionDisabled?: boolean;
  /** Bag state shown on the Bag It mark (bagged before, in the bag now…). */
  bagStatus?: BagPulseStatus;
  bagMode?: 'standard' | 'custom';
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
/*
  A clip, not a heart — and ONE clip, not two glyphs.

  ❤️/🤍 says "like", and two hearts that differ only in COLOUR is the
  weakest possible way to show a state change: over a photograph the tint is
  swallowed, and anyone who cannot separate red from white sees no change at
  all.

  The first answer was a second SHAPE (a bookmark for "kept"), which does read
  in greyscale but reads as a different control: the silhouette the eye tracks
  moved on every press. So the shape is now fixed and the DISC behind it
  carries the state — filled in the brand colour when clipped, glass when not.
  A filled disc survives a photograph and greyscale for the same reason a
  different shape did, without changing what the button looks like it does.
  See `src/constants/clipping.ts`.
*/
const FAVORITE_ICON = CLIP_EMOJI;
const FAVORITE_GLASS_SIZE = { width: 38, height: 38 } as const;

/**
 * The one product card in the app.
 *
 * Laid out like a video feed card and like Studio's store grid: the photograph
 * owns the top of the card edge to edge, and everything you read sits under
 * it on the card surface. The image used to carry the title, price and bag on
 * a blurred, darkened panel across its lower fifth, with a scrim above it —
 * every product was shown through a grey wash. Moving the copy off the photo
 * is what lets the picture stay at full colour; only a light band at the very
 * top remains, to keep the corner controls legible.
 */
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
  bagStatus,
  bagMode = 'standard',
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
  const { theme } = useTheme();
  const resolvedUri = useResolvedImageUri({
    src: mediaSrc,
    fileId: mediaFileId,
    enabled: Boolean(mediaSrc || mediaFileId),
    allowSignedFallback,
  });
  // Same rule as CollectionCard: a source that is still resolving or decoding
  // shows a skeleton; "Image unavailable" is only for no source or a real error.
  // Paint/failure are keyed by URI, so a recycled cell that receives a new
  // product never shows the previous product's loaded or failed state.
  const hasMediaSource = Boolean(mediaSrc || mediaFileId);
  const [paintedUri, setPaintedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const mediaFailed = Boolean(resolvedUri) && failedUri === resolvedUri;
  const mediaPainted = Boolean(resolvedUri) && paintedUri === resolvedUri;
  const showMediaSkeleton = hasMediaSource && !mediaFailed && !mediaPainted;
  const mediaHeight = height ?? Math.round(width * PRODUCT_TILE_MEDIA_RATIO);
  const canPressAction = Boolean(onActionPress) && !actionBusy && !actionDisabled && !unavailable;
  const displayPrice = priceLabel?.trim() || 'Price on request';
  const isBagAction = actionLabel === BAG_IT_LABEL;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.card,
        { width, backgroundColor: theme.colors.surfaceAlt },
        pressed && styles.cardPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View style={[styles.media, { height: mediaHeight, backgroundColor: theme.colors.surface }]}>
        {showMediaSkeleton ? (
          <Skeleton width="100%" height="100%" borderRadius={0} style={StyleSheet.absoluteFill} />
        ) : null}
        {resolvedUri && !mediaFailed ? (
          <StableImage
            uri={resolvedUri}
            resizeMode="cover"
            containerStyle={StyleSheet.absoluteFill}
            imageStyle={StyleSheet.absoluteFill}
            fadeDuration={0}
            onLoad={() => setPaintedUri(resolvedUri)}
            onError={() => setFailedUri(resolvedUri)}
          />
        ) : showMediaSkeleton ? null : (
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

        {/* The top band only, and lightly: it protects the New Drop badge and
            the clip control. The rest of the photograph is untouched. */}
        {newDropItemId || topRightSlot || onFavoritePress ? (
          <MediaScrim edges={['top']} reach={0.22} strength="light" />
        ) : null}

        {newDropItemId ? (
          <NewDropBadge
            itemId={newDropItemId}
            createdAt={newDropCreatedAt}
            sourceScreen={analyticsSourceScreen}
            feedPosition={feedPosition}
            style={styles.newDropBadge}
          />
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
              favorite
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: 'transparent', borderWidth: 0 },
              pressed && styles.inlinePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={favoriteAccessibilityLabel ?? clipAccessibilityLabel(favorite)}
          >
            {!favorite ? (
              <WiezLiquidGlass
                mode="lightweight"
                intensity="prominent"
                tintMode="dark"
                tintAlpha={tokens.liquidGlass.fallbackTint.mediaPill}
                borderRadius={tokens.radius.md}
                initialSize={FAVORITE_GLASS_SIZE}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {favoriteBusy ? (
              <MuseLoader size={20} />
            ) : (
              <AppText variant="captionBold" tone="inverse">
                {FAVORITE_ICON}
              </AppText>
            )}
          </Pressable>
        ) : null}
      </View>

      {/* The copy strip, attached under the photograph: the title, then the
          price with the compact Bag It at the end of the same row. */}
      <View style={styles.body}>
        <AppText variant="smallBold" numberOfLines={1}>
          {title}
        </AppText>
        <View style={styles.priceRow}>
          <View style={styles.priceText}>
            <AppText variant="moneySmall" tone="primary" numberOfLines={1}>
              {displayPrice}
            </AppText>
          </View>
          {customOrder ? (
            <AppText variant="captionBold" accessibilityLabel="Custom order available">
              {CUSTOM_ORDER_EMOJI}
            </AppText>
          ) : null}
          {isBagAction ? (
            <BagItButton
              onPress={canPressAction ? onActionPress : undefined}
              busy={actionBusy}
              disabled={!canPressAction && !actionBusy}
              status={bagStatus}
              mode={bagMode}
              accessibilityLabel={actionLabel}
            />
          ) : actionLabel ? (
            <Button
              title={actionLabel}
              size="xs"
              variant="ghost"
              disabled={!canPressAction}
              loading={actionBusy}
              onPress={onActionPress}
              accessibilityLabel={actionLabel}
              style={[styles.compactAction, { backgroundColor: theme.colors.primarySoft }]}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  media: {
    width: '100%',
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
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
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
    paddingBottom: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  compactAction: {
    alignSelf: 'flex-end',
    minWidth: 0,
    // Fixed, like Bag It's pill: a min-height-only Button grows with an
    // unbounded parent (the Catalogue pager loop, BagItButton.tsx).
    height: tokens.button.xs.height,
    borderWidth: 0,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
  },
  titleBlock: {
    // Two lines of `smallBold` (lineHeight 19).
    minHeight: tokens.typography.smallBold.lineHeight * 2,
    minWidth: 0,
  },
  priceRow: {
    minHeight: tokens.button.xs.height,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  priceText: {
    flex: 1,
    minWidth: 0,
  },
  actionRow: {
    paddingTop: tokens.spacing.xs,
  },
  inlinePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
});

export default UnifiedProductCard;
