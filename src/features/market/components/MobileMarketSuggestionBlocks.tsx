import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import {
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
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('en-NG')}`;
  }
};

const navigateToSuggestion = (item: MarketSectionItem) => {
  const targetId = getItemTargetId(item);
  const targetType = item.target?.type ?? item.entityType;
  if (!targetId) return;

  if (targetType === 'PRODUCT') {
    router.push({ pathname: '/products/[productId]', params: { productId: targetId } } as any);
    return;
  }
  if (targetType === 'COLLECTION') {
    router.push({ pathname: '/collection-viewer', params: { collectionId: targetId } } as any);
    return;
  }
  if (targetType === 'DESIGN') {
    router.push({ pathname: '/designs/[designId]', params: { designId: targetId } } as any);
    return;
  }
  if (targetType === 'BRAND') {
    router.push({ pathname: '/catalog/[brandId]', params: { brandId: targetId } } as any);
    return;
  }
  if (targetType === 'CATEGORY') {
    const query = item.category?.name ?? item.category?.slug ?? item.target?.key ?? item.title;
    router.push({ pathname: '/search', params: { q: query, autoSubmit: '1' } } as any);
  }
};

function SuggestionCard({
  item,
  blockKey,
  position,
  surface,
  screenContext,
}: {
  item: MarketSectionItem;
  blockKey: string;
  position: number;
  surface: MarketSignalSurface;
  screenContext: string;
}) {
  const { theme } = useTheme();
  const image = item.media?.thumbnailUrl ?? item.media?.url ?? null;

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

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
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
            <AppText variant="subtitle" tone="muted">🧵</AppText>
          </View>
        )}
      </View>
      <View style={styles.cardCopy}>
        <AppText variant="captionBold" numberOfLines={2}>
          {item.title}
        </AppText>
        {item.subtitle ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        ) : null}
        <AppText variant="captionBold" tone="primary" numberOfLines={1}>
          {formatPrice(item)}
        </AppText>
      </View>
    </Pressable>
  );
}

function SuggestionBlock({
  block,
  surface,
  screenContext,
}: {
  block: MarketSuggestionBlock;
  surface: MarketSignalSurface;
  screenContext: string;
}) {
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
        keyExtractor={(item) => `${block.blockKey}:${getStableItemKey(item)}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        renderItem={({ item, index }) => (
          <SuggestionCard
            item={item}
            blockKey={block.blockKey}
            position={index}
            surface={surface}
            screenContext={screenContext}
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
  const [blocks, setBlocks] = useState<MarketSuggestionBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const normalizedQuery = query?.trim() ?? '';
  const canFetch =
    context === 'SEARCH_EMPTY'
      ? normalizedQuery.length > 0
      : context === 'MARKET_SECTION_DETAIL'
        ? Boolean(sectionKey)
        : Boolean(targetType && targetId);

  useEffect(() => startMarketSignalRuntime(), []);

  useEffect(() => {
    if (!canFetch) {
      setBlocks([]);
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

  const visibleBlocks = useMemo(
    () => blocks.filter((block) => block.items.length > 0),
    [blocks],
  );

  if (!canFetch) return null;
  if (failed || (loaded && visibleBlocks.length === 0)) return null;

  if (loading && !loaded) {
    return (
      <Card padding="md" style={[styles.loadingCard, style]}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <AppText variant="body" tone="muted">Loading market picks...</AppText>
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
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  imageWrap: {
    height: 172,
    width: '100%',
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
});
