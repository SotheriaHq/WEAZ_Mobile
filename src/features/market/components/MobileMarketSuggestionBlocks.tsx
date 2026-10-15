import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { drillDownPush } from '@/src/utils/mobileNavigation';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import {
  createMarketSuppression,
  getMarketSuggestions,
  type MarketSectionItem,
  type MarketSignalSurface,
  type MarketSignalTargetType,
  type MarketSuggestionBlock,
  type MarketSuggestionContext,
  type MarketSuggestionTargetType,
} from '@/src/api/MarketApi';
import {
  flushMarketSignals,
  getMarketSignalAnonymousSessionId,
  startMarketSignalRuntime,
  trackMarketSignal,
} from '@/src/services/marketSignals';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { formatMoney } from '@/src/utils/money';
import { MuseLoader } from '@/components/ui/MuseLoader';

type Props = {
  context: MarketSuggestionContext;
  targetType?: MarketSuggestionTargetType;
  targetId?: string | null;
  query?: string | null;
  sectionKey?: string | null;
  limit?: number;
  surface: MarketSignalSurface;
  screenContext: string;
  style?: StyleProp<ViewStyle>;
};

const getItemTargetType = (item: MarketSectionItem): MarketSignalTargetType => {
  const type = item.target?.type ?? item.entityType;
  if (type === 'PRODUCT') return 'PRODUCT';
  if (type === 'COLLECTION') return 'COLLECTION';
  if (type === 'DESIGN') return 'DESIGN';
  if (type === 'BRAND') return 'BRAND';
  if (type === 'CATEGORY') return 'CATEGORY';
  return 'PRODUCT';
};

const getItemTargetId = (item: MarketSectionItem) =>
  item.target?.id ?? item.sourceId ?? item.id;

const getStableItemKey = (item: MarketSectionItem) =>
  `${item.entityType}:${getItemTargetId(item)}:${item.id}`;

const getSuggestionItemKey = (blockKey: string, item: MarketSectionItem) =>
  `${blockKey}:${getStableItemKey(item)}`;

const formatPrice = (item: MarketSectionItem) => {
  const value =
    item.price?.effectiveAmount ??
    item.price?.saleAmount ??
    item.price?.amount ??
    item.priceRange?.min ??
    null;
  const currency = item.price?.currency ?? item.priceRange?.currency ?? 'NGN';
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return item.category?.name ?? item.brand?.name ?? 'Market pick';
  }
  return formatMoney(value, currency);
};

/**
 * Types a card can OPEN as a piece of content.
 *
 * A `PRODUCT_DETAIL` response is not all pieces: "New Designers to Watch" is a
 * BRAND block and "Category" cards are searches. Those are legitimate rows, but
 * they are not what a card press means to a shopper who has just been shown
 * "Similar pieces" — pressing one took them to a catalogue with no way to tell
 * beforehand, which is the "some cards go to the brand instead" report. Cards
 * that are pieces open the piece; cards that are not say what they are.
 */
const CONTENT_TARGET_TYPES = new Set(['PRODUCT', 'COLLECTION', 'DESIGN']);

const isContentSuggestion = (item: MarketSectionItem) =>
  CONTENT_TARGET_TYPES.has(String(item.target?.type ?? item.entityType));

const navigateToBrand = (brandId: string) => {
  drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId } } as any);
};

const navigateToSuggestion = (item: MarketSectionItem) => {
  const targetId = getItemTargetId(item);
  const targetType = item.target?.type ?? item.entityType;
  if (!targetId) return;

  if (targetType === 'PRODUCT') {
    drillDownPush({ pathname: '/products/[productId]', params: { productId: targetId } } as any);
    return;
  }
  if (targetType === 'COLLECTION') {
    drillDownPush({ pathname: '/collection-viewer', params: { collectionId: targetId } } as any);
    return;
  }
  if (targetType === 'DESIGN') {
    // Shop context opens the shop viewer — /designs/[designId] is the
    // comment-anchored detail viewer reserved for notification/comment links.
    drillDownPush({ pathname: '/market-viewer', params: { sourceType: 'DESIGN', sourceId: targetId } } as any);
    return;
  }
  if (targetType === 'BRAND') {
    drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: targetId } } as any);
    return;
  }
  if (targetType === 'CATEGORY') {
    const query = item.category?.name ?? item.category?.slug ?? item.target?.key ?? item.title;
    drillDownPush({ pathname: '/search', params: { q: query, autoSubmit: '1' } } as any);
  }
};

type SuggestionCardProps = {
  item: MarketSectionItem;
  blockKey: string;
  position: number;
  surface: MarketSignalSurface;
  screenContext: string;
  hiddenBusy: boolean;
  onHide: (item: MarketSectionItem, blockKey: string, position: number) => void;
};

function SuggestionCard({
  item,
  blockKey,
  position,
  surface,
  screenContext,
  hiddenBusy,
  onHide,
}: SuggestionCardProps) {
  const { theme } = useTheme();
  const rawImage = item.media?.thumbnailUrl ?? item.media?.url ?? null;
  const image = useResolvedImageUri({
    src: rawImage,
    fileId: item.media?.fileId ?? null,
    enabled: Boolean(rawImage || item.media?.fileId),
  });

  const opensContent = isContentSuggestion(item);
  const brandId = item.brand?.id?.trim() || null;
  const brandName = item.brand?.name?.trim() || null;
  /*
    The brand line is only its own control on a CONTENT card. On a brand card
    the whole card already goes to that brand, so a second control inside it
    doing the same thing is just a smaller target for the same destination.
  */
  const showBrandLink = opensContent && Boolean(brandId && brandName);
  const caption = showBrandLink ? null : item.subtitle?.trim() || null;

  const handlePress = useCallback(() => {
    trackMarketSignal({
      targetType: getItemTargetType(item),
      targetId: getItemTargetId(item),
      signalType: 'SUGGESTION_ITEM_CLICK',
      surface,
      suggestionBlockKey: blockKey,
      screenContext,
      position,
    });
    void flushMarketSignals();
    navigateToSuggestion(item);
  }, [blockKey, item, position, screenContext, surface]);

  const handleBrandPress = useCallback(() => {
    if (brandId) navigateToBrand(brandId);
  }, [brandId]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.cardTapTarget, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={opensContent ? `Open ${item.title}` : `Open ${item.title}'s catalogue`}
      >
        <View style={[styles.imageWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
          {image ? (
            <StableImage
              uri={image}
              resizeMode="cover"
              containerStyle={styles.image}
              imageStyle={styles.image}
            />
          ) : (
            <View style={styles.imageFallback}>
              <AppText variant="subtitle" tone="muted">
                Pick
              </AppText>
            </View>
          )}
          {/*
            A card that is NOT a piece says so on its face. These sit in the
            same rail as the pieces and used to look identical to them, so the
            only way to find out a press led somewhere else was to press it.
          */}
          {opensContent ? null : (
            <View
              style={[
                styles.kindBadge,
                { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder },
              ]}
            >
              <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                {getItemTargetType(item) === 'BRAND' ? 'Brand' : 'Browse'}
              </AppText>
            </View>
          )}
        </View>
        <View style={styles.cardCopy}>
          <AppText variant="captionBold" numberOfLines={2}>
            {item.title}
          </AppText>
          {caption ? (
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              {caption}
            </AppText>
          ) : null}
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            {formatPrice(item)}
          </AppText>
        </View>
      </Pressable>
      {/*
        Outside the card's own Pressable, not nested inside it: the brand name
        is the ONE place on a piece that goes to the brand, and the rest of the
        card goes to the piece. Nesting the two would leave the boundary between
        them to the touch system.
      */}
      {showBrandLink ? (
        <Pressable
          onPress={handleBrandPress}
          style={({ pressed }) => [
            styles.brandLink,
            { borderTopColor: theme.colors.border },
            pressed && styles.pressed,
          ]}
          accessibilityRole="link"
          accessibilityLabel={`View ${brandName}'s catalogue`}
        >
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {brandName}
          </AppText>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onHide(item, blockKey, position)}
        disabled={hiddenBusy}
        style={({ pressed }) => [
          styles.hideButton,
          { borderColor: theme.colors.border },
          pressed && styles.pressed,
          hiddenBusy && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Hide ${item.title} from market suggestions`}
      >
        <AppText variant="captionBold" tone="muted">
          {hiddenBusy ? 'Hiding...' : 'Not interested'}
        </AppText>
      </Pressable>
    </View>
  );
}

type SuggestionBlockProps = {
  block: MarketSuggestionBlock;
  surface: MarketSignalSurface;
  screenContext: string;
  hiddenBusyKeys: Set<string>;
  onHide: (item: MarketSectionItem, blockKey: string, position: number) => void;
};

function SuggestionBlock({
  block,
  surface,
  screenContext,
  hiddenBusyKeys,
  onHide,
}: SuggestionBlockProps) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <AppText variant="subtitle">{block.title}</AppText>
        {block.subtitle ? (
          <AppText variant="captionRegular" tone="muted">
            {block.subtitle}
          </AppText>
        ) : null}
      </View>
      <FlatList
        data={block.items}
        horizontal
        keyExtractor={(item) => getSuggestionItemKey(block.blockKey, item)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        renderItem={({ item, index }) => (
          <SuggestionCard
            item={item}
            blockKey={block.blockKey}
            position={index}
            surface={surface}
            screenContext={screenContext}
            hiddenBusy={hiddenBusyKeys.has(getSuggestionItemKey(block.blockKey, item))}
            onHide={onHide}
          />
        )}
      />
    </View>
  );
}

export function MobileMarketSuggestionBlocks({
  context,
  targetType,
  targetId,
  query,
  sectionKey,
  limit = 6,
  surface,
  screenContext,
  style,
}: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const [blocks, setBlocks] = useState<MarketSuggestionBlock[]>([]);
  const [hiddenItemKeys, setHiddenItemKeys] = useState<Set<string>>(() => new Set());
  const [hiddenBusyKeys, setHiddenBusyKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const normalizedQuery = query?.trim() ?? '';
  const canFetch =
    context === 'WISHLIST'
      ? true
      : context === 'SEARCH_EMPTY'
      ? normalizedQuery.length > 0
      : context === 'MARKET_SECTION_DETAIL'
        ? Boolean(sectionKey)
        : Boolean(targetType && targetId);

  useEffect(() => startMarketSignalRuntime(), []);

  useEffect(() => {
    if (!canFetch) {
      setBlocks([]);
      setHiddenItemKeys(new Set());
      setLoaded(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    void getMarketSuggestions(
      {
        context,
        targetType,
        targetId: targetId ?? undefined,
        query: normalizedQuery || undefined,
        sectionKey: sectionKey ?? undefined,
        limit,
        anonymousSessionId: getMarketSignalAnonymousSessionId(),
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        const nextBlocks = (response.blocks ?? []).filter((block) => block.items.length > 0);
        setBlocks(nextBlocks);
        setHiddenItemKeys(new Set());
        nextBlocks.forEach((block, index) => {
          trackMarketSignal({
            targetType: 'SUGGESTION_BLOCK',
            targetId: block.blockKey,
            signalType: 'SUGGESTION_BLOCK_VIEW',
            surface,
            suggestionBlockKey: block.blockKey,
            screenContext,
            position: index,
          });
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoaded(true);
        }
      });

    return () => controller.abort();
  }, [
    canFetch,
    context,
    limit,
    normalizedQuery,
    screenContext,
    sectionKey,
    surface,
    targetId,
    targetType,
  ]);

  const handleHideSuggestion = useCallback(
    async (item: MarketSectionItem, blockKey: string, position: number) => {
      const itemKey = getSuggestionItemKey(blockKey, item);
      if (hiddenBusyKeys.has(itemKey)) return;

      setHiddenBusyKeys((current) => new Set(current).add(itemKey));
      setHiddenItemKeys((current) => new Set(current).add(itemKey));

      try {
        trackMarketSignal({
          targetType: getItemTargetType(item),
          targetId: getItemTargetId(item),
          signalType: 'SUGGESTION_ITEM_HIDE',
          surface,
          suggestionBlockKey: blockKey,
          screenContext,
          position,
        });
        await createMarketSuppression({
          anonymousSessionId: getMarketSignalAnonymousSessionId(),
          targetType: getItemTargetType(item),
          targetId: getItemTargetId(item),
          brandId: item.brand?.id ?? null,
          categoryId: item.category?.id ?? null,
          suggestionBlockKey: blockKey,
          suppressionType: 'NOT_INTERESTED',
          reason: 'mobile-suggestion-item-hidden',
        });
        void flushMarketSignals();
        toast.success('Suggestion hidden.');
      } catch {
        setHiddenItemKeys((current) => {
          const next = new Set(current);
          next.delete(itemKey);
          return next;
        });
        toast.error('Could not hide that suggestion.');
      } finally {
        setHiddenBusyKeys((current) => {
          const next = new Set(current);
          next.delete(itemKey);
          return next;
        });
      }
    },
    [hiddenBusyKeys, screenContext, surface, toast],
  );

  const visibleBlocks = useMemo(
    () =>
      blocks
        .map((block) => ({
          ...block,
          items: block.items.filter(
            (item) => !hiddenItemKeys.has(getSuggestionItemKey(block.blockKey, item)),
          ),
        }))
        .filter((block) => block.items.length > 0),
    [blocks, hiddenItemKeys],
  );

  if (!canFetch) return null;
  if (failed || (loaded && visibleBlocks.length === 0)) return null;

  if (loading && !loaded) {
    return (
      <Card padding="md" style={[styles.loadingCard, style]}>
        <MuseLoader size={20} />
        <AppText variant="body" tone="muted">
          Loading market picks...
        </AppText>
      </Card>
    );
  }

  return (
    <View style={[styles.root, style]}>
      {visibleBlocks.map((block) => (
        <SuggestionBlock
          key={block.blockKey}
          block={block}
          surface={surface}
          screenContext={screenContext}
          hiddenBusyKeys={hiddenBusyKeys}
          onHide={handleHideSuggestion}
        />
      ))}
    </View>
  );
}

export default MobileMarketSuggestionBlocks;

const styles = StyleSheet.create({
  root: {
    gap: tokens.spacing.lg,
  },
  loadingCard: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  block: {
    gap: tokens.spacing.sm,
  },
  blockHeader: {
    gap: tokens.spacing.xs,
  },
  railContent: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.md,
  },
  card: {
    width: 156,
    overflow: 'hidden',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
  },
  cardTapTarget: {
    flex: 1,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.6,
  },
  imageWrap: {
    height: 172,
    width: '100%',
  },
  kindBadge: {
    position: 'absolute',
    top: tokens.spacing.xs,
    left: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 2,
  },
  brandLink: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    gap: tokens.spacing.xs,
    padding: tokens.spacing.sm,
  },
  hideButton: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
});
