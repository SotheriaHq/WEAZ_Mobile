import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { InlineNavLink } from '@/components/ui/InlineNavLink';
import { MediaScrim } from '@/components/ui/MediaScrim';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { StableImage } from '@/components/ui/StableImage';
import { brandApi, type CollectionDto } from '@/src/api/BrandApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { formatMoney } from '@/src/utils/money';

/**
 * A designer front.
 *
 * "New designers to watch" was a grid of brand tiles: one logo, one name, one
 * number. A shopper deciding whether to follow a designer they have never heard
 * of got a business card, and to see any actual work they had to leave the
 * section, look at a catalogue, and come back — which is why they did not come
 * back.
 *
 * So the row shows the WORK, with just enough of the designer beside it to know
 * whose work it is: the pieces run down the left where they can be swiped
 * through, and the right column carries the brand's identity plus the details
 * of whichever piece is currently showing. It takes the shape of the content
 * viewer (media one side, facts the other) without borrowing its chrome — this
 * is a card in a list, not a screen.
 *
 * Two routes out and both come back: a piece opens that piece, and the link at
 * the bottom opens the brand's catalogue, where the standard back control
 * returns here.
 */

const MEDIA_FLEX = 0.56;
const PIECE_LIMIT = 8;
const CARD_HEIGHT = 292;

export interface DesignerFrontBrand {
  id: string;
  name: string;
  handle?: string | null;
  logoUrl?: string | null;
  logoFileId?: string | null;
  /** From the section payload — shown before the pieces arrive. */
  pieceCount?: number | null;
  blurb?: string | null;
  /** The brand's own cover, used until its pieces load. */
  coverUrl?: string | null;
  coverFileId?: string | null;
}

interface DesignerFrontCardProps {
  brand: DesignerFrontBrand;
  width: number;
  onOpenDesign: (design: CollectionDto) => void;
  onOpenCatalogue: (brandId: string) => void;
}

const priceBand = (design: CollectionDto): string | null => {
  const min = design.saleMinPrice ?? design.minPrice;
  const max = design.saleMaxPrice ?? design.maxPrice;
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return null;
  if (typeof max === 'number' && Number.isFinite(max) && max > min) {
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }
  return formatMoney(min);
};

/**
 * One piece in the pager.
 *
 * Its own component because resolving a signed media URL is a hook, and a hook
 * cannot run inside a loop over the pieces.
 */
const DesignerPiece = memo(function DesignerPiece({
  design,
  width,
  onPress,
}: {
  design: CollectionDto;
  width: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const uri = useResolvedImageUri({
    src: design.coverImage,
    fileId: design.coverFileId,
    enabled: Boolean(design.coverImage || design.coverFileId),
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.piece,
        { width, backgroundColor: theme.colors.surfaceAlt },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${design.title}`}
    >
      {uri ? (
        <StableImage
          uri={uri}
          resizeMode="cover"
          containerStyle={StyleSheet.absoluteFill}
          imageStyle={StyleSheet.absoluteFill}
          fadeDuration={140}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.pieceFallback]}>
          <AppText variant="title" tone="muted">
            {design.title.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
      )}
      {/* Only the bottom band, where the dots sit. The artwork is the point. */}
      <MediaScrim edges={['bottom']} reach={0.22} strength="light" />
    </Pressable>
  );
});

export const DesignerFrontCard = memo(function DesignerFrontCard({
  brand,
  width,
  onOpenDesign,
  onOpenCatalogue,
}: DesignerFrontCardProps) {
  const { theme } = useTheme();
  const [pieces, setPieces] = useState<CollectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestedRef = useRef<string | null>(null);

  const mediaWidth = Math.round(width * MEDIA_FLEX);
  const logoUri = useResolvedImageUri({
    src: brand.logoUrl,
    fileId: brand.logoFileId,
    enabled: Boolean(brand.logoUrl || brand.logoFileId),
  });

  useEffect(() => {
    if (!brand.id || requestedRef.current === brand.id) return;
    requestedRef.current = brand.id;
    let active = true;

    void (async () => {
      try {
        const result = await brandApi.getCollections({
          brandId: brand.id,
          scope: 'design',
          visibility: 'PUBLIC',
          limit: PIECE_LIMIT,
        });
        if (!active) return;
        setPieces(result.items.filter((item) => Boolean(item.coverImage || item.coverFileId)));
      } catch {
        // A designer whose pieces will not load still gets their card and their
        // catalogue link — the row does not become a hole in the list.
        if (active) setPieces([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [brand.id]);

  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (mediaWidth <= 0) return;
      const next = Math.round(event.nativeEvent.contentOffset.x / mediaWidth);
      setActiveIndex((current) => (current === next ? current : next));
    },
    [mediaWidth],
  );

  const activePiece = pieces[activeIndex] ?? null;
  const pieceCount = pieces.length || brand.pieceCount || 0;

  const dots = useMemo(() => pieces.slice(0, 6), [pieces]);

  return (
    <View
      style={[
        styles.card,
        { width, height: CARD_HEIGHT, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={[styles.mediaColumn, { width: mediaWidth }]}>
        {loading ? (
          <View style={[styles.pieceFallback, StyleSheet.absoluteFill]}>
            <MuseLoader size={20} />
          </View>
        ) : pieces.length > 0 ? (
          <>
            <FlatList
              data={pieces}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(design) => design.id}
              onScroll={onScroll}
              scrollEventThrottle={16}
              /* Fixed cell width, so the pager can jump without measuring. */
              getItemLayout={(_, index) => ({
                length: mediaWidth,
                offset: mediaWidth * index,
                index,
              })}
              renderItem={({ item }) => (
                <DesignerPiece
                  design={item}
                  width={mediaWidth}
                  onPress={() => onOpenDesign(item)}
                />
              )}
            />
            {dots.length > 1 ? (
              <View style={styles.dots} pointerEvents="none">
                {dots.map((design, index) => (
                  <View
                    key={design.id}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          index === activeIndex ? theme.colors.textInverse : theme.colors.backdropStrong,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.pieceFallback, StyleSheet.absoluteFill]}>
            <AppText variant="caption" tone="muted" numberOfLines={2} style={styles.emptyPieces}>
              No public pieces yet
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.detailColumn}>
        <View style={styles.identityRow}>
          {logoUri ? (
            <StableImage
              uri={logoUri}
              resizeMode="cover"
              containerStyle={styles.logo}
              imageStyle={styles.logoFill}
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="captionBold" tone="muted">
                {brand.name.slice(0, 1).toUpperCase()}
              </AppText>
            </View>
          )}
          <View style={styles.identityText}>
            <AppText variant="captionBold" numberOfLines={1}>
              {brand.name}
            </AppText>
            {brand.handle ? (
              <AppText variant="small" tone="muted" numberOfLines={1}>
                @{brand.handle.replace(/^@+/, '')}
              </AppText>
            ) : null}
          </View>
        </View>

        {pieceCount > 0 ? (
          <AppText variant="small" tone="secondary" numberOfLines={1}>
            {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}
          </AppText>
        ) : null}

        {brand.blurb ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {brand.blurb}
          </AppText>
        ) : null}

        {/* The piece under the reader's thumb, named. This is the half that
            changes as they swipe — without it the pager is just a slideshow. */}
        <View style={[styles.nowShowing, { borderTopColor: theme.colors.border }]}>
          {activePiece ? (
            <>
              <AppText variant="small" tone="muted" numberOfLines={1}>
                Now showing
              </AppText>
              <AppText variant="captionBold" numberOfLines={2}>
                {activePiece.title}
              </AppText>
              <AppText variant="small" tone="primary" numberOfLines={1}>
                {priceBand(activePiece) ?? 'Price on request'}
              </AppText>
            </>
          ) : null}
        </View>

        <InlineNavLink
          label="Catalogue"
          direction="forward"
          onPress={() => onOpenCatalogue(brand.id)}
          accessibilityLabel={`Open ${brand.name}'s catalogue`}
          style={styles.catalogueLink}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaColumn: {
    height: '100%',
    position: 'relative',
  },
  piece: {
    height: '100%',
    overflow: 'hidden',
  },
  pieceFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPieces: {
    textAlign: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  dots: {
    position: 'absolute',
    bottom: tokens.spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  detailColumn: {
    flex: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  // Rule 6: avatars are rounded-square, never circles.
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    overflow: 'hidden',
  },
  logoFill: {
    width: '100%',
    height: '100%',
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  nowShowing: {
    marginTop: 'auto',
    paddingTop: tokens.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  catalogueLink: {
    paddingVertical: 0,
  },
  pressed: {
    opacity: 0.85,
  },
});
