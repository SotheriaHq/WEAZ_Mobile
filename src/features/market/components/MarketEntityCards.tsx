import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { MediaScrim } from '@/components/ui/MediaScrim';
import { StableImage } from '@/components/ui/StableImage';
import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const PIECES_PILL_GLASS_SIZE = { width: 84, height: 26 } as const;

/**
 * Cards for everything on Market that is not a single product.
 *
 * Products always render as `UnifiedProductCard`. These cover the other
 * entities a section can hold, each in the shape that suits it — the way a
 * video feed mixes portrait shorts, landscape videos and channel marks on one
 * page. Variety by entity is deliberate: a run of identical rails makes every
 * section look like the last one, and the eye loses its place. The web app has
 * the same three cards in `fthreadly/src/components/market/MarketEntityCards.tsx`.
 */

export type CoverSource = { src?: string | null; fileId?: string | null };

/**
 * One cover image. Resolution goes through the shared, cached and de-duplicated
 * resolver, and a direct URL needs no request at all — so a collage of three
 * product photos costs nothing extra when those products are already on screen.
 */
const CoverImage = memo(function CoverImage({
  source,
  style,
}: {
  source: CoverSource;
  style: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const uri = useResolvedImageUri({
    src: source.src,
    fileId: source.fileId,
    enabled: Boolean(source.src || source.fileId),
  });

  return (
    <View style={[styles.cover, { backgroundColor: theme.colors.surface }, style]}>
      {uri ? (
        <StableImage
          uri={uri}
          resizeMode="cover"
          containerStyle={StyleSheet.absoluteFill}
          imageStyle={StyleSheet.absoluteFill}
          fadeDuration={0}
        />
      ) : null}
    </View>
  );
});

const hasCover = (source: CoverSource) => Boolean(source.src || source.fileId);

type CollectionShelfCardProps = {
  width: number;
  title: string;
  /** "Brand · 6 pieces" — whatever is known; empty parts are dropped by the caller. */
  facts?: string | null;
  priceLabel?: string | null;
  piecesLabel?: string | null;
  /** Cover photos of the collection's products, lead piece first. */
  covers: ReadonlyArray<CoverSource>;
  onPress: () => void;
};

/**
 * A collection as a wide card: a collage of its products' cover photos with
 * the title and facts underneath, like a playlist in a video feed. A
 * collection IS a group of pieces, so showing the pieces says what it is faster
 * than any label could.
 */
export const CollectionShelfCard = memo(function CollectionShelfCard({
  width,
  title,
  facts,
  priceLabel,
  piecesLabel,
  covers,
  onPress,
}: CollectionShelfCardProps) {
  const { theme } = useTheme();
  const height = Math.round((width * 9) / 16);
  const list = covers.filter(hasCover).slice(0, 3);
  const leadWidth = list.length > 1 ? Math.round(((width - 2) * 2) / 3) : width;
  const sideWidth = width - leadWidth - 2;
  const sideHeight = list.length > 2 ? Math.floor((height - 2) / 2) : height;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.shelfCard,
        { width, backgroundColor: theme.colors.surfaceAlt },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`View ${title} collection`}
    >
      <View style={[styles.collage, { height, backgroundColor: theme.colors.surface }]}>
        {list.length === 0 ? (
          <View style={styles.collagePlaceholder}>
            <AppText variant="title" tone="muted">{String.fromCodePoint(0x1f9f5)}</AppText>
          </View>
        ) : (
          <>
            <CoverImage source={list[0]} style={{ width: leadWidth, height }} />
            {list.length > 1 ? (
              <View style={[styles.collageSide, { width: sideWidth }]}>
                <CoverImage source={list[1]} style={{ width: sideWidth, height: sideHeight }} />
                {list.length > 2 ? (
                  <CoverImage source={list[2]} style={{ width: sideWidth, height: sideHeight }} />
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {piecesLabel ? (
          <WiezLiquidGlass
            mode="lightweight"
            intensity="prominent"
            tintMode="dark"
            tintAlpha={0.34}
            borderRadius={tokens.radius.full}
            initialSize={PIECES_PILL_GLASS_SIZE}
            pointerEvents="none"
            style={styles.piecesPill}
            contentStyle={styles.piecesPillContent}
          >
            <AppText variant="captionBold" tone="inverse">{piecesLabel}</AppText>
          </WiezLiquidGlass>
        ) : null}
      </View>
      <View style={styles.shelfBody}>
        <AppText variant="smallBold" numberOfLines={1}>{title}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>{facts || ' '}</AppText>
        {priceLabel ? (
          <AppText variant="moneySmall" tone="primary" numberOfLines={1}>{priceLabel}</AppText>
        ) : null}
      </View>
    </Pressable>
  );
});

/** A brand as a rounded-square mark with its name — never a circle. */
export const BrandTile = memo(function BrandTile({
  width,
  name,
  logo,
  piecesLabel,
  onPress,
}: {
  width: number;
  name: string;
  logo: CoverSource;
  piecesLabel?: string | null;
  onPress: () => void;
}) {
  const markSize = width - tokens.spacing.lg;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.brandTile, { width }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
    >
      <CoverImage source={logo} style={[styles.brandMark, { width: markSize, height: markSize }]} />
      <AppText variant="smallBold" numberOfLines={3} style={styles.centered}>{name}</AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1}>{piecesLabel || ' '}</AppText>
    </Pressable>
  );
});

/** A style or category as a short photo tile with its name on a band at the bottom. */
export const CategoryTile = memo(function CategoryTile({
  width,
  title,
  cover,
  onPress,
}: {
  width: number;
  title: string;
  cover: CoverSource;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const height = Math.round((width * 10) / 16);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.categoryTile, { width, height }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Shop ${title}`}
    >
      {hasCover(cover) ? (
        <>
          <CoverImage source={cover} style={StyleSheet.absoluteFill} />
          {/* A band under the label only — the rest of the photo stays clear. */}
          <MediaScrim edges={['bottom']} reach={0.55} strength="standard" />
          <View style={styles.categoryLabel}>
            <AppText variant="smallBold" tone="inverse" numberOfLines={2}>{title}</AppText>
          </View>
        </>
      ) : (
        /* No photo for this style yet: a tinted label tile, never an empty box. */
        <View style={[styles.categoryFallback, { backgroundColor: theme.colors.primarySoft }]}>
          <AppText variant="title">{String.fromCodePoint(0x1f3a8)}</AppText>
          <AppText variant="smallBold" numberOfLines={2}>{title}</AppText>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cover: {
    overflow: 'hidden',
  },
  shelfCard: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  collage: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  collageSide: {
    gap: 2,
  },
  collagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piecesPill: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    minHeight: 26,
    borderRadius: tokens.radius.full,
    borderWidth: 0,
  },
  piecesPillContent: {
    minHeight: 26,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelfBody: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  brandTile: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xs,
  },
  brandMark: {
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing.xs,
  },
  centered: {
    textAlign: 'center',
  },
  categoryTile: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  categoryFallback: {
    flex: 1,
    justifyContent: 'space-between',
    padding: tokens.spacing.md,
  },
  categoryLabel: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    bottom: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
});
