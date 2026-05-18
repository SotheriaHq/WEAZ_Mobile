import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import { MobileStoreApi, type StoreCollectionSummary, type StoreProduct } from '@/src/api/StoreApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { getMarketFeed } from '@/src/api/MarketApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { MarketFilterSheet } from '@/src/features/market/components/MarketFilterSheet';
import { MarketEmptyState, MarketErrorState } from '@/src/features/market/components/MarketStates';
import { MarketSkeleton } from '@/src/features/market/components/MarketSkeleton';
import {
  DEFAULT_MARKET_FILTERS,
  normalizeOption,
  parsePriceFilter,
  productStock,
} from '@/src/features/market/marketUtils';
import type { MarketContentItem, MarketFilters } from '@/src/features/market/types';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import type { MarketItem } from '@/src/types/market';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { BAG_IT_LABEL } from '@/src/constants/bagging';

const SIDE_PADDING = tokens.spacing.lg;
const SECTION_GAP = tokens.spacing.xl;
const CARD_GAP = tokens.spacing.md;
const HERO_INTERVAL_MS = 3000;
const PREFERRED_CATEGORIES = ['Ankara Fashion', 'Lacewear', 'Ready to Wear', 'Custom', 'Bridal'];

type MarketRow =
  | { id: 'hero'; type: 'HERO_CAROUSEL'; items: MarketContentItem[] }
  | { id: 'blazing'; type: 'BLAZING_ROW'; trends: BlazingTrend[] }
  | {
      id: string;
      type: 'HORIZONTAL_CARD_ROW';
      title: string;
      subtitle?: string;
      items: MarketContentItem[];
      onSeeAll?: () => void;
    }
  | {
      id: 'latest-collections';
      type: 'COLLECTION_ROW';
      title: string;
      subtitle: string;
      items: StoreCollectionSummary[];
      error: string | null;
    }
  | { id: string; type: 'PRODUCT_GRID'; title: string; items: MarketContentItem[] }
  | { id: string; type: 'EDITORIAL_CARD'; item: MarketContentItem | null }
  | { id: 'loading-more'; type: 'LOADING_MORE' }
  | { id: 'empty'; type: 'EMPTY_STATE' }
  | { id: 'error'; type: 'ERROR_STATE'; message: string };

type BlazingTrend = {
  id: string;
  label: string;
  count: number;
  category: string | null;
  item: MarketContentItem | null;
};

type ProductMarketItem = Extract<MarketContentItem, { entityType: 'PRODUCT' }>;
type DesignMarketItem = Extract<MarketContentItem, { entityType: 'DESIGN' }>;

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to load market right now.';

function getItemTitle(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.name : item.design.collectionTitle;
}

function getItemBrand(item: MarketContentItem) {
  if (item.kind === 'product') return normalizeOption(item.product.brandName);
  return normalizeOption(item.design.brandName ?? item.design.username);
}

function getItemCategories(item: MarketContentItem) {
  if (item.kind === 'product') {
    return [
      normalizeOption(item.product.categoryName),
      ...(item.product.tags ?? []).map(normalizeOption),
    ].filter((entry): entry is string => Boolean(entry));
  }
  return (item.design.tags ?? []).map(normalizeOption).filter((entry): entry is string => Boolean(entry));
}

function getItemPrice(item: MarketContentItem) {
  if (item.kind === 'product') return item.product.effectivePrice ?? item.product.salePrice ?? item.product.price;
  return item.design.saleMinPrice ?? item.design.minPrice ?? item.design.saleMaxPrice ?? item.design.maxPrice ?? null;
}

function getItemCreatedAt(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.createdAt : item.design.createdAt;
}

function getPopularity(item: MarketContentItem) {
  if (item.kind === 'product') return 0;
  return (item.design.likesCount ?? 0) + (item.design.threadsCount ?? 0) + (item.design.combinedCommentsCount ?? 0);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function buildContentItems(products: StoreProduct[], designs: MarketItem[]): MarketContentItem[] {
  return [
    ...products.map((product) => ({
      key: `product:${product.id}`,
      entityType: 'PRODUCT' as const,
      kind: 'product' as const,
      product,
    })),
    ...designs.map((design) => ({
      key: `design:${design.collectionId}`,
      entityType: 'DESIGN' as const,
      kind: 'design' as const,
      design,
    })),
  ];
}

function getItemMedia(item: MarketContentItem) {
  if (item.kind === 'product') {
    return {
      mediaSrc: item.product.coverImage,
      mediaFileId: item.product.coverImageId,
    };
  }

  return {
    mediaSrc:
      item.design.primaryMedia?.displayUrl ??
      item.design.media?.url ??
      item.design.media?.previewUrl ??
      null,
    mediaFileId:
      item.design.primaryMedia?.fileId ??
      item.design.media?.fileId ??
      null,
  };
}

function hasDisplayMedia(item: MarketContentItem) {
  const media = getItemMedia(item);
  return Boolean(media.mediaSrc || media.mediaFileId);
}

function getItemTypeLabel(item: MarketContentItem) {
  if (item.entityType === 'DESIGN') return 'Design';
  if (item.entityType === 'PRODUCT') return 'Product';
  return 'Catalog item';
}

function isCustomReady(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.customOrderEnabled : Boolean(item.design.viewerState?.canBag);
}

function getItemPriceLabel(item: MarketContentItem) {
  if (item.kind === 'product') {
    const price = item.product.effectivePrice ?? item.product.salePrice ?? item.product.price;
    return formatMarketPrice(price, item.product.currency) ?? 'Price on request';
  }

  const min = typeof item.design.saleMinPrice === 'number' ? item.design.saleMinPrice : item.design.minPrice;
  const max = typeof item.design.saleMaxPrice === 'number' ? item.design.saleMaxPrice : item.design.maxPrice;
  if (typeof min === 'number' && typeof max === 'number') {
    if (min === max) return formatMarketPrice(min) ?? 'Custom quote';
    return `${formatMarketPrice(min) ?? 'From'} - ${formatMarketPrice(max) ?? 'custom'}`;
  }
  if (typeof min === 'number') return `From ${formatMarketPrice(min)}`;
  if (typeof max === 'number') return `Up to ${formatMarketPrice(max)}`;
  return 'Custom quote';
}

function getCollectionPriceLabel(collection: StoreCollectionSummary) {
  const { min, max, currency } = collection.priceRange;
  if (typeof min === 'number' && typeof max === 'number') {
    if (min === max) return formatMarketPrice(min, currency) ?? 'Price on request';
    return `${formatMarketPrice(min, currency) ?? 'From'} - ${formatMarketPrice(max, currency) ?? 'custom'}`;
  }
  if (typeof min === 'number') return `From ${formatMarketPrice(min, currency)}`;
  if (typeof max === 'number') return `Up to ${formatMarketPrice(max, currency)}`;
  return 'Price on request';
}

function formatMarketPrice(value?: number | null, currency = 'NGN') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('en-NG')}`;
  }
}

function getGridColumnCount(width: number) {
  const availableWidth = width - SIDE_PADDING * 2;
  const threeColumnWidth = Math.floor((availableWidth - CARD_GAP * 2) / 3);
  return threeColumnWidth >= 168 ? 3 : 2;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildBlazingTrends(categoryOptions: string[], allItems: MarketContentItem[], filteredItems: MarketContentItem[]) {
  const trends = categoryOptions
    .map((category) => {
      const matching = allItems.filter((item) =>
        getItemCategories(item).some((entry) => entry.toLowerCase() === category.toLowerCase()),
      );
      return {
        id: category,
        label: category,
        count: matching.length,
        category,
        item: matching.find(hasDisplayMedia) ?? matching[0] ?? null,
      };
    })
    .filter((trend) => trend.count > 0)
    .slice(0, 10);

  if (trends.length > 0) return trends;

  return filteredItems.slice(0, 8).map((item) => ({
    id: item.key,
    label: getItemTypeLabel(item),
    count: Math.max(1, getPopularity(item)),
    category: getItemCategories(item)[0] ?? null,
    item,
  }));
}

function buildRows(args: {
  allItems: MarketContentItem[];
  filteredItems: MarketContentItem[];
  collections: StoreCollectionSummary[];
  collectionError: string | null;
  categoryOptions: string[];
  loadingMore: boolean;
  setNewestView: () => void;
  setCustomReadyView: () => void;
}) {
  const {
    allItems,
    filteredItems,
    collections,
    collectionError,
    categoryOptions,
    loadingMore,
    setNewestView,
    setCustomReadyView,
  } = args;
  const heroItems = filteredItems.filter(hasDisplayMedia).slice(0, 3);
  const rows: MarketRow[] = [];

  if (heroItems.length > 0) {
    rows.push({ id: 'hero', type: 'HERO_CAROUSEL', items: heroItems });
  }

  const trends = buildBlazingTrends(categoryOptions, allItems, filteredItems);
  if (trends.length > 0) {
    rows.push({ id: 'blazing', type: 'BLAZING_ROW', trends });
  }

  const freshItems = filteredItems.slice(0, 10);
  if (freshItems.length > 0) {
    rows.push({
      id: 'fresh-row',
      type: 'HORIZONTAL_CARD_ROW',
      title: 'Fresh on Threadly',
      subtitle: 'New products and custom-ready designs',
      items: freshItems,
      onSeeAll: setNewestView,
    });
  }

  rows.push({
    id: 'latest-collections',
    type: 'COLLECTION_ROW',
    title: 'Latest Collections',
    subtitle: 'Shop complete edits from Threadly brands',
    items: collections,
    error: collectionError,
  });

  const firstGrid = filteredItems.slice(0, 6);
  if (firstGrid.length > 0) {
    rows.push({ id: 'grid-primary', type: 'PRODUCT_GRID', title: 'Shop the edit', items: firstGrid });
  }

  rows.push({ id: 'editorial-primary', type: 'EDITORIAL_CARD', item: heroItems[0] ?? filteredItems[0] ?? null });

  const customReady = filteredItems.filter(isCustomReady).slice(0, 10);
  if (customReady.length > 1) {
    rows.push({
      id: 'custom-ready-row',
      type: 'HORIZONTAL_CARD_ROW',
      title: 'Custom-ready designs',
      subtitle: 'Start a tailored request from the feed',
      items: customReady,
      onSeeAll: setCustomReadyView,
    });
  }

  chunkItems(filteredItems.slice(6), 6).forEach((chunk, index) => {
    if (chunk.length > 0) {
      rows.push({
        id: `grid-${index + 2}`,
        type: 'PRODUCT_GRID',
        title: index === 0 ? 'More market picks' : 'Keep exploring',
        items: chunk,
      });
    }

    if (index === 1) {
      rows.push({ id: 'editorial-secondary', type: 'EDITORIAL_CARD', item: chunk.find(hasDisplayMedia) ?? chunk[0] ?? null });
    }
  });

  if (loadingMore) rows.push({ id: 'loading-more', type: 'LOADING_MORE' });
  return rows;
}

type MarketCardProps = {
  item: MarketContentItem;
  width: number;
  height?: number;
  favorite: boolean;
  bagBusy: boolean;
  favoriteBusy: boolean;
  onOpen: (item: MarketContentItem) => void;
  onBag: (item: MarketContentItem) => void;
  onFavorite: (item: MarketContentItem) => void;
};

function MarketProductCard({
  item,
  width,
  height,
  favorite,
  bagBusy,
  favoriteBusy,
  onOpen,
  onBag,
  onFavorite,
}: Omit<MarketCardProps, 'item'> & { item: ProductMarketItem }) {
  const media = getItemMedia(item);
  const unavailable = productStock(item.product) <= 0 && !item.product.customOrderEnabled;

  return (
    <UnifiedProductCard
      width={width}
      height={height}
      title={getItemTitle(item)}
      brandName={getItemBrand(item) ?? 'Threadly brand'}
      priceLabel={getItemPriceLabel(item)}
      mediaSrc={media.mediaSrc}
      mediaFileId={media.mediaFileId}
      typeLabel="Product"
      unavailable={unavailable}
      favorite={favorite}
      favoriteBusy={favoriteBusy}
      actionLabel={unavailable ? 'Out' : BAG_IT_LABEL}
      actionBusy={bagBusy}
      actionDisabled={unavailable}
      onPress={() => onOpen(item)}
      onActionPress={() => onBag(item)}
      onFavoritePress={() => onFavorite(item)}
    />
  );
}

function MarketDesignCard({
  item,
  width,
  height,
  favorite,
  bagBusy,
  favoriteBusy,
  onOpen,
  onBag,
  onFavorite,
}: Omit<MarketCardProps, 'item'> & { item: DesignMarketItem }) {
  const media = getItemMedia(item);
  const canRequestCustomOrder = isCustomReady(item);

  return (
    <UnifiedProductCard
      width={width}
      height={height}
      title={getItemTitle(item)}
      brandName={getItemBrand(item) ?? 'Threadly brand'}
      priceLabel={getItemPriceLabel(item)}
      mediaSrc={media.mediaSrc}
      mediaFileId={media.mediaFileId}
      typeLabel="Design"
      favorite={favorite}
      favoriteBusy={favoriteBusy}
      actionLabel={canRequestCustomOrder ? BAG_IT_LABEL : undefined}
      actionBusy={bagBusy}
      actionDisabled={!canRequestCustomOrder}
      onPress={() => onOpen(item)}
      onActionPress={canRequestCustomOrder ? () => onBag(item) : undefined}
      onFavoritePress={() => onFavorite(item)}
    />
  );
}

function MarketCard(props: MarketCardProps) {
  if (props.item.entityType === 'PRODUCT') {
    return <MarketProductCard {...props} item={props.item} />;
  }

  return <MarketDesignCard {...props} item={props.item} />;
}

function MarketHeroSlide({
  item,
  width,
  height,
  onOpen,
}: {
  item: MarketContentItem;
  width: number;
  height: number;
  onOpen: (item: MarketContentItem) => void;
}) {
  const { theme } = useTheme();
  const media = getItemMedia(item);
  const imageUri = useResolvedImageUri({
    src: media.mediaSrc,
    fileId: media.mediaFileId,
    enabled: Boolean(media.mediaSrc || media.mediaFileId),
  });

  return (
    <Pressable
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.heroSlide, { width, height, backgroundColor: theme.colors.surfaceAlt }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open featured ${getItemTitle(item)}`}
    >
      {imageUri ? (
        <StableImage uri={imageUri} resizeMode="cover" containerStyle={styles.heroImage} imageStyle={styles.heroImage} />
      ) : null}
      <LinearGradient
        colors={[theme.colors.backdropStrong, theme.colors.backdrop, theme.colors.backdropStrong]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroTopRow}>
        <View style={[styles.heroPill, { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder }]}>
          <AppText variant="captionBold" tone="inverse">Trending Now</AppText>
        </View>
        <View style={[styles.heroBadge, { backgroundColor: theme.colors.primary }]}>
          <AppText variant="captionBold" tone="inverse">{String.fromCodePoint(0x1f525)}</AppText>
        </View>
      </View>
      <View style={styles.heroCopy}>
        <AppText variant="title" tone="inverse" numberOfLines={1}>
          {getItemTitle(item)}
        </AppText>
        <AppText variant="caption" tone="inverse" numberOfLines={1}>
          {getItemBrand(item) ?? 'Curated fashion marketplace'} - {getItemPriceLabel(item)}
        </AppText>
      </View>
    </Pressable>
  );
}

function MarketHeroCarousel({
  items,
  width,
  height,
  onOpen,
}: {
  items: MarketContentItem[];
  width: number;
  height: number;
  onOpen: (item: MarketContentItem) => void;
}) {
  const { theme } = useTheme();
  const listRef = useRef<FlatList<MarketContentItem> | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slideWidth = width - SIDE_PADDING * 2;

  useEffect(() => {
    if (items.length < 2) return undefined;
    const interval = setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % items.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, HERO_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [items.length]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setActiveIndex(Math.max(0, Math.min(items.length - 1, nextIndex)));
  }, [items.length, slideWidth]);

  if (items.length === 0) return null;

  return (
    <View style={styles.heroSection}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        keyExtractor={(item) => `hero-${item.key}`}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollToIndexFailed={() => undefined}
        renderItem={({ item }) => (
          <MarketHeroSlide item={item} width={slideWidth} height={height} onOpen={onOpen} />
        )}
      />
      {items.length > 1 ? (
        <View style={styles.heroDots}>
          {items.map((item, index) => (
            <View
              key={`dot-${item.key}`}
              style={[
                styles.heroDot,
                { backgroundColor: theme.colors.glassSurface },
                index === activeIndex && [styles.heroDotActive, { backgroundColor: theme.colors.textInverse }],
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BlazingChip({
  trend,
  onPress,
}: {
  trend: BlazingTrend;
  onPress: (trend: BlazingTrend) => void;
}) {
  const { theme } = useTheme();
  const media = trend.item ? getItemMedia(trend.item) : { mediaSrc: null, mediaFileId: null };
  const imageUri = useResolvedImageUri({
    src: media.mediaSrc,
    fileId: media.mediaFileId,
    enabled: Boolean(media.mediaSrc || media.mediaFileId),
  });

  return (
    <Pressable
      onPress={() => onPress(trend)}
      style={({ pressed }) => [
        styles.blazingChip,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${trend.label}`}
    >
      <View style={[styles.blazingThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
        {imageUri ? (
          <StableImage uri={imageUri} resizeMode="cover" containerStyle={styles.blazingThumbImage} imageStyle={styles.blazingThumbImage} />
        ) : (
          <AppText variant="captionBold" tone="primary">{String.fromCodePoint(0x1f525)}</AppText>
        )}
      </View>
      <View style={styles.blazingCopy}>
        <AppText variant="captionBold" numberOfLines={1}>{trend.label}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {trend.count} live picks
        </AppText>
      </View>
    </Pressable>
  );
}

function BlazingRow({
  trends,
  onSelectTrend,
}: {
  trends: BlazingTrend[];
  onSelectTrend: (trend: BlazingTrend) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="subtitle">{String.fromCodePoint(0x1f525)} Blazing Now</AppText>
      </View>
      <FlatList
        data={trends}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.blazingContent}
        renderItem={({ item }) => <BlazingChip trend={item} onPress={onSelectTrend} />}
      />
    </View>
  );
}

function CollectionCard({
  collection,
  width,
  onOpen,
}: {
  collection: StoreCollectionSummary;
  width: number;
  onOpen: (collection: StoreCollectionSummary) => void;
}) {
  const { theme } = useTheme();
  const imageUri = useResolvedImageUri({
    src: collection.coverImage,
    fileId: collection.coverImageId,
    enabled: Boolean(collection.coverImage || collection.coverImageId),
  });

  return (
    <Pressable
      onPress={() => onOpen(collection)}
      style={({ pressed }) => [
        styles.collectionCard,
        { width, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`View ${collection.title} collection`}
    >
      <View style={[styles.collectionMedia, { backgroundColor: theme.colors.surfaceAlt }]}>
        {imageUri ? (
          <StableImage uri={imageUri} resizeMode="cover" containerStyle={styles.collectionImage} imageStyle={styles.collectionImage} />
        ) : (
          <AppText variant="title" tone="muted">{String.fromCodePoint(0x1f5bc, 0xfe0f)}</AppText>
        )}
        <LinearGradient
          colors={[theme.colors.backdrop, 'transparent', theme.colors.backdropStrong]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.collectionCountPill, { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder }]}>
          <AppText variant="captionBold" tone="inverse">
            {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}
          </AppText>
        </View>
      </View>
      <View style={styles.collectionCopy}>
        <AppText variant="bodyBold" numberOfLines={2}>
          {collection.title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {collection.brandName ?? 'Threadly brand'}
        </AppText>
        <View style={styles.collectionMetaRow}>
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            {getCollectionPriceLabel(collection)}
          </AppText>
          <AppText variant="captionBold" tone="muted">
            View
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function CollectionRow({
  title,
  subtitle,
  items,
  error,
  cardWidth,
  onOpen,
  onRetry,
}: {
  title: string;
  subtitle: string;
  items: StoreCollectionSummary[];
  error: string | null;
  cardWidth: number;
  onOpen: (collection: StoreCollectionSummary) => void;
  onRetry: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <AppText variant="subtitle">{title}</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>{subtitle}</AppText>
        </View>
      </View>

      {error ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.collectionStateCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading collections"
        >
          <AppText variant="bodyBold">Collections could not load</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={2}>{error}</AppText>
          <AppText variant="captionBold" tone="primary">Retry</AppText>
        </Pressable>
      ) : items.length === 0 ? (
        <View style={[styles.collectionStateCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="bodyBold">No collections live yet</AppText>
          <AppText variant="caption" tone="muted">New brand edits will appear here as soon as they are published.</AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          horizontal
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalCardsContent}
          renderItem={({ item }) => (
            <CollectionCard collection={item} width={cardWidth} onOpen={onOpen} />
          )}
        />
      )}
    </View>
  );
}

function HorizontalCardRow({
  title,
  subtitle,
  items,
  cardWidth,
  favoriteByKey,
  busyByKey,
  favoriteBusyByKey,
  onOpen,
  onBag,
  onFavorite,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  items: MarketContentItem[];
  cardWidth: number;
  favoriteByKey: Record<string, boolean>;
  busyByKey: Record<string, boolean>;
  favoriteBusyByKey: Record<string, boolean>;
  onOpen: (item: MarketContentItem) => void;
  onBag: (item: MarketContentItem) => void;
  onFavorite: (item: MarketContentItem) => void;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <AppText variant="subtitle">{title}</AppText>
          {subtitle ? <AppText variant="caption" tone="muted" numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={tokens.spacing.sm} accessibilityRole="button" accessibilityLabel={`See all ${title}`}>
            <AppText variant="captionBold" tone="primary">See all</AppText>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={items}
        horizontal
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalCardsContent}
        renderItem={({ item }) => (
          <MarketCard
            item={item}
            width={cardWidth}
            height={Math.round(cardWidth * 1.5)}
            favorite={Boolean(favoriteByKey[item.key])}
            bagBusy={Boolean(busyByKey[item.key])}
            favoriteBusy={Boolean(favoriteBusyByKey[item.key])}
            onOpen={onOpen}
            onBag={onBag}
            onFavorite={onFavorite}
          />
        )}
      />
    </View>
  );
}

function ProductGridSection({
  title,
  items,
  width,
  favoriteByKey,
  busyByKey,
  favoriteBusyByKey,
  onOpen,
  onBag,
  onFavorite,
}: {
  title: string;
  items: MarketContentItem[];
  width: number;
  favoriteByKey: Record<string, boolean>;
  busyByKey: Record<string, boolean>;
  favoriteBusyByKey: Record<string, boolean>;
  onOpen: (item: MarketContentItem) => void;
  onBag: (item: MarketContentItem) => void;
  onFavorite: (item: MarketContentItem) => void;
}) {
  const columnCount = getGridColumnCount(width);
  const cardWidth = Math.floor((width - SIDE_PADDING * 2 - CARD_GAP * (columnCount - 1)) / columnCount);
  const rows = chunkItems(items, columnCount);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="subtitle">{title}</AppText>
      </View>
      <View style={styles.gridStack}>
        {rows.map((row, rowIndex) => (
          <View key={`grid-row-${rowIndex}`} style={styles.gridRow}>
            {row.map((item) => (
              <MarketCard
                key={item.key}
                item={item}
                width={cardWidth}
                height={Math.round(cardWidth * 1.58)}
                favorite={Boolean(favoriteByKey[item.key])}
                bagBusy={Boolean(busyByKey[item.key])}
                favoriteBusy={Boolean(favoriteBusyByKey[item.key])}
                onOpen={onOpen}
                onBag={onBag}
                onFavorite={onFavorite}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function EditorialCard({
  item,
  onPress,
}: {
  item: MarketContentItem | null;
  onPress: (item: MarketContentItem) => void;
}) {
  const { theme } = useTheme();
  const media = item ? getItemMedia(item) : { mediaSrc: null, mediaFileId: null };
  const imageUri = useResolvedImageUri({
    src: media.mediaSrc,
    fileId: media.mediaFileId,
    enabled: Boolean(media.mediaSrc || media.mediaFileId),
  });

  return (
    <Pressable
      onPress={() => item && onPress(item)}
      disabled={!item}
      style={({ pressed }) => [styles.editorialCard, { backgroundColor: theme.colors.surfaceAlt }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open featured market edit"
    >
      {imageUri ? (
        <StableImage uri={imageUri} resizeMode="cover" containerStyle={styles.editorialImage} imageStyle={styles.editorialImage} />
      ) : null}
      <LinearGradient
        colors={[theme.colors.backdropStrong, theme.colors.primaryDark, theme.colors.backdropStrong]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.editorialTag, { backgroundColor: theme.colors.primary }]}>
        <AppText variant="captionBold" tone="inverse">Market Edit</AppText>
      </View>
      <View style={styles.editorialCopy}>
        <AppText variant="title" tone="inverse" numberOfLines={2}>
          {item ? `Build a look around ${getItemTitle(item)}` : 'Discover curated African fashion'}
        </AppText>
        <AppText variant="caption" tone="inverse" numberOfLines={2}>
          Mix custom-ready design inspiration with ready-to-wear finds from Threadly brands.
        </AppText>
        <AppText variant="captionBold" tone="primary">Read & Shop {String.fromCodePoint(0x2192)}</AppText>
      </View>
    </Pressable>
  );
}

export function MarketScreen() {
  const { theme, scheme } = useTheme();
  const { status } = useAuth();
  const toast = useToast();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  const { width, height } = useWindowDimensions();
  const { bagProduct, bagSource } = useMobileBagging();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [designs, setDesigns] = useState<MarketItem[]>([]);
  const [collections, setCollections] = useState<StoreCollectionSummary[]>([]);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [designCursor, setDesignCursor] = useState<string | null>(null);
  const [productHasNext, setProductHasNext] = useState(false);
  const [designHasNext, setDesignHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_MARKET_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [favoriteByKey, setFavoriteByKey] = useState<Record<string, boolean>>({});
  const [busyByKey, setBusyByKey] = useState<Record<string, boolean>>({});
  const [favoriteBusyByKey, setFavoriteBusyByKey] = useState<Record<string, boolean>>({});

  const bottomClearance = standardScreenBottomPadding;
  const allItems = useMemo(() => buildContentItems(products, designs), [designs, products]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    PREFERRED_CATEGORIES.forEach((category) => values.add(category));
    allItems.forEach((item) => {
      getItemCategories(item).forEach((category) => values.add(category));
    });
    return Array.from(values).slice(0, 12);
  }, [allItems]);

  const brandOptions = useMemo(() => {
    const values = new Set<string>();
    allItems.forEach((item) => {
      const brand = getItemBrand(item);
      if (brand) values.add(brand);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const query = normalizeSearch(search);
    const minPrice = parsePriceFilter(filters.minPrice);
    const maxPrice = parsePriceFilter(filters.maxPrice);
    const next = allItems.filter((item) => {
      const title = getItemTitle(item);
      const brand = getItemBrand(item) ?? '';
      const categories = getItemCategories(item);
      const price = getItemPrice(item);

      if (query && !`${title} ${brand} ${categories.join(' ')}`.toLowerCase().includes(query)) return false;
      if (filters.category && !categories.some((category) => category.toLowerCase() === filters.category?.toLowerCase())) return false;
      if (filters.brand && brand.toLowerCase() !== filters.brand.toLowerCase()) return false;
      if (minPrice !== null && (typeof price !== 'number' || price < minPrice)) return false;
      if (maxPrice !== null && (typeof price !== 'number' || price > maxPrice)) return false;

      if (filters.availability === 'in_stock') {
        return item.kind === 'product' && productStock(item.product) > 0;
      }
      if (filters.availability === 'custom_ready') return isCustomReady(item);
      return true;
    });

    return next.sort((a, b) => {
      if (filters.sort === 'price_asc') return (getItemPrice(a) ?? Number.MAX_SAFE_INTEGER) - (getItemPrice(b) ?? Number.MAX_SAFE_INTEGER);
      if (filters.sort === 'price_desc') return (getItemPrice(b) ?? 0) - (getItemPrice(a) ?? 0);
      if (filters.sort === 'popular') return getPopularity(b) - getPopularity(a);
      return new Date(getItemCreatedAt(b) ?? 0).getTime() - new Date(getItemCreatedAt(a) ?? 0).getTime();
    });
  }, [allItems, filters, search]);

  const loadMarket = useCallback(
    async (mode: 'reset' | 'more') => {
      if (mode === 'reset') {
        setError(null);
        setCollectionError(null);
        setLoading(true);
      } else {
        if (loadingMore || (!productHasNext && !designHasNext)) return;
        setLoadingMore(true);
      }

      try {
        const minPrice = parsePriceFilter(filters.minPrice);
        const maxPrice = parsePriceFilter(filters.maxPrice);
        const productRequest = MobileStoreApi.getMarketplaceProducts({
          cursor: mode === 'more' ? productCursor : null,
          limit: 36,
          category: filters.category,
          minPrice,
          maxPrice,
          sortBy: filters.sort === 'popular' ? 'popular' : filters.sort,
          search: search.trim() || null,
        });
        const designRequest = getMarketFeed({
          cursor: mode === 'more' ? designCursor : null,
          limit: 18,
          tag: filters.category,
          counts: 'combined',
        });
        const collectionRequest = mode === 'reset'
          ? MobileStoreApi.getStoreCollections({ limit: 12 })
          : Promise.resolve(null);

        const [productResult, designResult, collectionResult] = await Promise.allSettled([
          productRequest,
          designRequest,
          collectionRequest,
        ]);
        const productOk = productResult.status === 'fulfilled';
        const designOk = designResult.status === 'fulfilled';
        const collectionOk = collectionResult.status === 'fulfilled';

        if (!productOk && !designOk) {
          setError(toErrorMessage(productResult.reason ?? designResult.reason));
        }

        if (productOk) {
          setProductCursor(productResult.value.nextCursor);
          setProductHasNext(productResult.value.hasNextPage);
          setProducts((current) => {
            if (mode === 'reset') return productResult.value.items;
            const seen = new Set(current.map((item) => item.id));
            return [...current, ...productResult.value.items.filter((item) => !seen.has(item.id))];
          });
        }

        if (designOk) {
          setDesignCursor(designResult.value.nextCursor ?? null);
          setDesignHasNext(Boolean(designResult.value.hasNextPage));
          setDesigns((current) => {
            if (mode === 'reset') return designResult.value.items;
            const seen = new Set(current.map((item) => item.collectionId));
            return [...current, ...designResult.value.items.filter((item) => !seen.has(item.collectionId))];
          });
        }

        if (mode === 'reset') {
          if (collectionOk && collectionResult.value) {
            setCollections(collectionResult.value.items);
            setCollectionError(null);
          } else if (!collectionOk) {
            setCollectionError(toErrorMessage(collectionResult.reason));
          }
        }
      } finally {
        if (mode === 'reset') setLoading(false);
        else setLoadingMore(false);
      }
    },
    [
      designCursor,
      designHasNext,
      filters.category,
      filters.maxPrice,
      filters.minPrice,
      filters.sort,
      loadingMore,
      productCursor,
      productHasNext,
      search,
    ],
  );

  useEffect(() => {
    void loadMarket('reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.maxPrice, filters.minPrice, filters.sort, search]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    products.forEach((product) => {
      next[`product:${product.id}`] = Boolean(product.isWishlisted);
    });
    setFavoriteByKey((current) => ({ ...next, ...current }));
  }, [products]);

  useEffect(() => {
    if (status !== 'authenticated' || designs.length === 0) return undefined;
    const ids = designs.map((item) => item.collectionId).filter(Boolean);
    let cancelled = false;
    SavedItemsApi.checkBatch('COLLECTION', ids)
      .then((result) => {
        if (cancelled) return;
        setFavoriteByKey((current) => {
          const next = { ...current };
          ids.forEach((id) => {
            next[`design:${id}`] = Boolean(result[id]);
          });
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [designs, status]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMarket('reset');
    setRefreshing(false);
  }, [loadMarket]);

  const requireAuth = useCallback(() => {
    if (status === 'authenticated') return true;
    toast.info('Please sign in to continue.');
    router.push({ pathname: '/(auth)/login', params: { next: '/(tabs)/discover' } } as any);
    return false;
  }, [status, toast]);

  const openItem = useCallback((item: MarketContentItem) => {
    if (item.kind === 'product') {
      router.push({ pathname: '/products/[productId]', params: { productId: item.product.id } } as any);
      return;
    }
    router.push({
      pathname: '/market-viewer',
      params: {
        sourceType: 'DESIGN',
        sourceId: item.design.collectionId,
        brandId: item.design.brandId,
        title: item.design.collectionTitle,
        brandName: item.design.brandName ?? item.design.username ?? '',
        priceLabel: getItemPriceLabel(item),
      },
    } as any);
  }, []);

  const openCollection = useCallback((collection: StoreCollectionSummary) => {
    router.push({
      pathname: '/collection-viewer',
      params: { collectionId: collection.id, returnTo: '/(tabs)/discover' },
    } as any);
  }, []);

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyByKey((current) => {
      const next = { ...current };
      if (busy) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const handleBag = useCallback(
    async (item: MarketContentItem) => {
      if (!requireAuth()) return;
      setBusy(item.key, true);
      try {
        if (item.kind === 'product') {
          await bagProduct({ id: item.product.id, name: item.product.name });
        } else {
          await bagSource({
            sourceType: 'DESIGN',
            sourceId: item.design.collectionId,
            name: item.design.collectionTitle,
          });
        }
      } catch (error) {
        toast.error(toErrorMessage(error));
      } finally {
        setBusy(item.key, false);
      }
    },
    [bagProduct, bagSource, requireAuth, setBusy, toast],
  );

  const handleFavorite = useCallback(
    async (item: MarketContentItem) => {
      if (!requireAuth()) return;
      setFavoriteBusyByKey((current) => ({ ...current, [item.key]: true }));
      const currentlyFavorite = Boolean(favoriteByKey[item.key]);
      setFavoriteByKey((current) => ({ ...current, [item.key]: !currentlyFavorite }));
      try {
        if (item.kind === 'product') {
          if (currentlyFavorite) await MobileStoreApi.removeFromWishlist(item.product.id);
          else await MobileStoreApi.addToWishlist(item.product.id);
        } else if (currentlyFavorite) {
          await SavedItemsApi.unsaveCatalogTarget({
            targetType: 'DESIGN',
            designId: item.design.collectionId,
            legacyCollectionId: item.design.collectionId,
          });
        } else {
          await SavedItemsApi.saveCatalogTarget({
            targetType: 'DESIGN',
            designId: item.design.collectionId,
            legacyCollectionId: item.design.collectionId,
          });
        }
      } catch (error) {
        setFavoriteByKey((current) => ({ ...current, [item.key]: currentlyFavorite }));
        toast.error(toErrorMessage(error));
      } finally {
        setFavoriteBusyByKey((current) => {
          const next = { ...current };
          delete next[item.key];
          return next;
        });
      }
    },
    [favoriteByKey, requireAuth, toast],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_MARKET_FILTERS);
    setSearch('');
  }, []);

  const setNewestView = useCallback(() => {
    setFilters((current) => ({ ...current, availability: 'all', sort: 'newest' }));
  }, []);

  const setCustomReadyView = useCallback(() => {
    setFilters((current) => ({ ...current, availability: 'custom_ready' }));
  }, []);

  const rowData = useMemo<MarketRow[]>(() => {
    if (error) return [{ id: 'error', type: 'ERROR_STATE', message: error }];
    if (filteredItems.length === 0 && collections.length === 0) return [{ id: 'empty', type: 'EMPTY_STATE' }];
    return buildRows({
      allItems,
      filteredItems,
      collections,
      collectionError,
      categoryOptions,
      loadingMore,
      setNewestView,
      setCustomReadyView,
    });
  }, [
    allItems,
    categoryOptions,
    collectionError,
    collections,
    error,
    filteredItems,
    loadingMore,
    setCustomReadyView,
    setNewestView,
  ]);

  const horizontalCardWidth = Math.min(184, Math.max(150, Math.round(width * 0.42)));
  const heroHeight = Math.min(236, Math.max(176, Math.round(height * 0.24)));

  const handleTrendSelect = useCallback((trend: BlazingTrend) => {
    if (trend.category) {
      setFilters((current) => ({ ...current, category: trend.category }));
    } else if (trend.item) {
      openItem(trend.item);
    }
  }, [openItem]);

  const renderRow = useCallback(
    ({ item }: { item: MarketRow }) => {
      switch (item.type) {
        case 'HERO_CAROUSEL':
          return <MarketHeroCarousel items={item.items} width={width} height={heroHeight} onOpen={openItem} />;
        case 'BLAZING_ROW':
          return <BlazingRow trends={item.trends} onSelectTrend={handleTrendSelect} />;
        case 'HORIZONTAL_CARD_ROW':
          return (
            <HorizontalCardRow
              title={item.title}
              subtitle={item.subtitle}
              items={item.items}
              cardWidth={horizontalCardWidth}
              favoriteByKey={favoriteByKey}
              busyByKey={busyByKey}
              favoriteBusyByKey={favoriteBusyByKey}
              onOpen={openItem}
              onBag={handleBag}
              onFavorite={handleFavorite}
              onSeeAll={item.onSeeAll}
            />
          );
        case 'COLLECTION_ROW':
          return (
            <CollectionRow
              title={item.title}
              subtitle={item.subtitle}
              items={item.items}
              error={item.error}
              cardWidth={horizontalCardWidth}
              onOpen={openCollection}
              onRetry={() => void loadMarket('reset')}
            />
          );
        case 'PRODUCT_GRID':
          return (
            <ProductGridSection
              title={item.title}
              items={item.items}
              width={width}
              favoriteByKey={favoriteByKey}
              busyByKey={busyByKey}
              favoriteBusyByKey={favoriteBusyByKey}
              onOpen={openItem}
              onBag={handleBag}
              onFavorite={handleFavorite}
            />
          );
        case 'EDITORIAL_CARD':
          return <EditorialCard item={item.item} onPress={openItem} />;
        case 'LOADING_MORE':
          return (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          );
        case 'ERROR_STATE':
          return <MarketErrorState message={item.message} onRetry={() => void loadMarket('reset')} />;
        case 'EMPTY_STATE':
        default:
          return <MarketEmptyState onClear={clearFilters} onRetry={() => void loadMarket('reset')} />;
      }
    },
    [
      busyByKey,
      clearFilters,
      favoriteBusyByKey,
      favoriteByKey,
      handleBag,
      handleFavorite,
      handleTrendSelect,
      heroHeight,
      horizontalCardWidth,
      loadMarket,
      openCollection,
      openItem,
      theme.colors.primary,
      width,
    ],
  );

  const renderHeader = (
    <View style={styles.headerStack}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.replace('/' as any)} style={({ pressed }) => [styles.logoButton, pressed && styles.pressed]}>
          <ThreadlyLogo size={30} />
        </Pressable>
        <View style={styles.titleWrap}>
          <AppText variant="title">Market</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            Products and custom-ready designs
          </AppText>
        </View>
        <Pressable
          onPress={() => setFilterSheetVisible(true)}
          style={({ pressed }) => [
            styles.roundButton,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <AppText variant="subtitle">{String.fromCodePoint(0x2699, 0xfe0f)}</AppText>
        </Pressable>
      </View>

      <Input
        label="Search market"
        hideLabel
        value={search}
        onChangeText={setSearch}
        placeholder="Search brands, styles, items..."
        leading={<AppText variant="body" tone="muted">{String.fromCodePoint(0x1f50d)}</AppText>}
        trailing={
          <Pressable onPress={() => setFilterSheetVisible(true)} accessibilityRole="button" accessibilityLabel="Sort and filter">
            <AppText variant="captionBold" tone="primary">Sort</AppText>
          </Pressable>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        <Pressable
          onPress={() => setFilters((current) => ({ ...current, category: null }))}
          style={({ pressed }) => [
            styles.categoryChip,
            {
              backgroundColor: !filters.category ? theme.colors.primary : theme.colors.surface,
              borderColor: !filters.category ? theme.colors.primary : theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="captionBold" tone={!filters.category ? 'inverse' : 'secondary'}>All</AppText>
        </Pressable>
        {categoryOptions.map((category) => {
          const selected = filters.category === category;
          return (
            <Pressable
              key={category}
              onPress={() => setFilters((current) => ({ ...current, category }))}
              style={({ pressed }) => [
                styles.categoryChip,
                {
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="captionBold" tone={selected ? 'inverse' : 'secondary'} numberOfLines={1}>
                {category}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (loading && allItems.length === 0) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />
        <MarketSkeleton bottomPadding={bottomClearance} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />
      <FlatList
        data={rowData}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ListHeaderComponent={renderHeader}
        scrollIndicatorInsets={{ bottom: bottomClearance }}
        contentContainerStyle={[styles.feedContent, { paddingBottom: bottomClearance + tokens.spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onEndReached={() => {
          if (!loadingMore && (productHasNext || designHasNext)) {
            void loadMarket('more');
          }
        }}
        onEndReachedThreshold={0.65}
        removeClippedSubviews={false}
      />

      <MarketFilterSheet
        visible={filterSheetVisible}
        filters={filters}
        categoryOptions={categoryOptions}
        brandOptions={brandOptions}
        resultCount={filteredItems.length}
        onClose={() => setFilterSheetVisible(false)}
        onClear={clearFilters}
        onApply={(next) => {
          setFilters(next);
          setFilterSheetVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  feedContent: {
    gap: SECTION_GAP,
  },
  headerStack: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: tokens.spacing.xs,
    gap: tokens.spacing.md,
  },
  topRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  logoButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRow: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  categoryChip: {
    minHeight: 36,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  section: {
    gap: tokens.spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: SIDE_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  sectionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroSection: {
    paddingHorizontal: SIDE_PADDING,
    position: 'relative',
  },
  heroSlide: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopRow: {
    position: 'absolute',
    top: tokens.spacing.md,
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPill: {
    minHeight: 30,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    bottom: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  heroDots: {
    position: 'absolute',
    right: SIDE_PADDING + tokens.spacing.md,
    bottom: tokens.spacing.md,
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroDotActive: {
    width: 18,
  },
  blazingContent: {
    paddingHorizontal: SIDE_PADDING,
    gap: tokens.spacing.sm,
  },
  blazingChip: {
    width: 176,
    minHeight: 62,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
  },
  blazingThumb: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blazingThumbImage: {
    ...StyleSheet.absoluteFillObject,
  },
  blazingCopy: {
    flex: 1,
    minWidth: 0,
  },
  horizontalCardsContent: {
    paddingHorizontal: SIDE_PADDING,
    gap: CARD_GAP,
  },
  collectionCard: {
    minHeight: 262,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  collectionMedia: {
    height: 168,
    overflow: 'hidden',
  },
  collectionImage: {
    ...StyleSheet.absoluteFillObject,
  },
  collectionCountPill: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    minHeight: 28,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionCopy: {
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
  },
  collectionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  collectionStateCard: {
    marginHorizontal: SIDE_PADDING,
    minHeight: 98,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
    justifyContent: 'center',
  },
  gridStack: {
    paddingHorizontal: SIDE_PADDING,
    gap: CARD_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  editorialCard: {
    marginHorizontal: SIDE_PADDING,
    minHeight: 164,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  editorialImage: {
    ...StyleSheet.absoluteFillObject,
  },
  editorialTag: {
    position: 'absolute',
    top: tokens.spacing.md,
    left: tokens.spacing.md,
    minHeight: 28,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorialCopy: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    bottom: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  loadingMoreRow: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.76,
  },
});
