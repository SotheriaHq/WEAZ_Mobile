import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import WiezMark from '@/src/brand/WiezMark';
import { AppText } from '@/components/ui/AppText';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import {
  MobileStoreApi,
  type MarketplaceProductsResponse,
  type StoreCollectionSummary,
  type StoreCollectionsResponse,
  type StoreProduct,
} from '@/src/api/StoreApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import {
  getMarketFeed,
  getMarketSections,
  type MarketSection,
  type MarketSectionItem,
} from '@/src/api/MarketApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { createMixSeed, mixScoredItems } from '@/src/utils/feedMixer';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { buildMoodboardSuggestionSection } from '@/src/recommendations/recommendationScoring';
import { MarketFilterSheet } from '@/src/features/market/components/MarketFilterSheet';
import {
  buildAdireBatch,
  createAdireBatchState,
  filterAdireItems,
  type AdireBatchState,
} from '@/src/features/market/adire';
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
import type { MarketFeedResponse, MarketItem } from '@/src/types/market';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import {
  flushMarketSignals,
  startMarketSignalRuntime,
  trackMarketSignal,
} from '@/src/services/marketSignals';
import { navPerf } from '@/src/utils/navPerf';
import { prefetchMedia } from '@/src/prefetch/navPrefetch';
import { formatMoney } from '@/src/utils/money';
import { MuseLoader } from '@/components/ui/MuseLoader';

const SIDE_PADDING = tokens.spacing.lg;
const SECTION_GAP = tokens.spacing.xl;
const CARD_GAP = tokens.spacing.md;
const HERO_INTERVAL_MS = 3000;
/** Level sliders — the filter/adjust glyph, not the settings cog. */
const MARKET_FILTER_EMOJI = String.fromCodePoint(0x1f39a, 0xfe0f);

const PREFERRED_CATEGORIES = ['Ankara Fashion', 'Lacewear', 'Ready to Wear', 'Custom', 'Bridal'];
const MARKET_SEARCH_DEBOUNCE_MS = 350;
const MARKET_HOME_CACHE_TTL_MS = 3 * 60 * 1000;
const MARKET_HOME_CACHE_MAX_ENTRIES = 12;

type MarketRow =
  | { id: 'hero'; type: 'HERO_CAROUSEL'; items: MarketContentItem[] }
  | {
      id: string;
      type: 'HORIZONTAL_CARD_ROW';
      title: string;
      subtitle?: string;
      items: MarketContentItem[];
      source?: 'moodboard';
      onSeeAll?: () => void;
    }
  | {
      id: string;
      type: 'API_SECTION_ROW';
      section: MarketSection;
      onSeeAll?: () => void;
    }
  | {
      id: 'adire';
      type: 'ADIRE_ROW';
      title: string;
      subtitle: string;
      items: MarketContentItem[];
      onSeeAll: () => void;
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


type ProductMarketItem = Extract<MarketContentItem, { entityType: 'PRODUCT' }>;
type DesignMarketItem = Extract<MarketContentItem, { entityType: 'DESIGN' }>;

type MarketSnapshot = {
  products: StoreProduct[];
  designs: MarketItem[];
  collections: StoreCollectionSummary[];
  productCursor: string | null;
  designCursor: string | null;
  productHasNext: boolean;
  designHasNext: boolean;
  collectionError: string | null;
  cachedAt: number;
};

type MarketSettledResults = {
  productResult: PromiseSettledResult<MarketplaceProductsResponse | null>;
  designResult: PromiseSettledResult<MarketFeedResponse | null>;
  collectionResult: PromiseSettledResult<StoreCollectionsResponse | null>;
};

const marketSnapshotCache = new Map<string, MarketSnapshot>();
const marketRequestInFlight = new Map<string, Promise<MarketSettledResults>>();
let marketSectionsCache: MarketSection[] | null = null;

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to load market right now.';

export function getItemTitle(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.name : item.design.collectionTitle;
}

export function getItemBrand(item: MarketContentItem) {
  if (item.kind === 'product') return normalizeOption(item.product.brandName);
  return normalizeOption(item.design.brandName ?? item.design.username);
}

function getItemBrandId(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.brandId ?? null : item.design.brandId ?? null;
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

function getMarketSignalTarget(item: MarketContentItem) {
  if (item.kind === 'product') {
    return {
      targetType: 'PRODUCT' as const,
      targetId: item.product.id,
    };
  }
  return {
    targetType: 'DESIGN' as const,
    targetId: item.design.collectionId,
  };
}

function getPopularity(item: MarketContentItem) {
  if (item.kind === 'product') return 0;
  return (item.design.likesCount ?? 0) + (item.design.threadsCount ?? 0) + (item.design.combinedCommentsCount ?? 0);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function buildMarketQueryKey(filters: MarketFilters, searchValue: string, viewerKey: string) {
  const minPrice = parsePriceFilter(filters.minPrice);
  const maxPrice = parsePriceFilter(filters.maxPrice);
  return JSON.stringify({
    viewerKey,
    category: filters.category ?? null,
    minPrice,
    maxPrice,
    sort: filters.sort,
    search: normalizeSearch(searchValue),
  });
}

function trimMarketSnapshotCache() {
  while (marketSnapshotCache.size > MARKET_HOME_CACHE_MAX_ENTRIES) {
    const oldestKey = marketSnapshotCache.keys().next().value;
    if (!oldestKey) return;
    marketSnapshotCache.delete(oldestKey);
  }
}

function readMarketSnapshot(queryKey: string) {
  const snapshot = marketSnapshotCache.get(queryKey);
  if (!snapshot) return null;
  return {
    snapshot,
    isFresh: Date.now() - snapshot.cachedAt < MARKET_HOME_CACHE_TTL_MS,
  };
}

function writeMarketSnapshot(queryKey: string, snapshot: Omit<MarketSnapshot, 'cachedAt'>) {
  marketSnapshotCache.set(queryKey, {
    ...snapshot,
    cachedAt: Date.now(),
  });
  trimMarketSnapshotCache();
}

function fetchMarketBatch(params: {
  requestKey: string;
  filters: MarketFilters;
  search: string;
  productCursor: string | null;
  designCursor: string | null;
  includeCollections: boolean;
  includeProducts: boolean;
  includeDesigns: boolean;
}) {
  const existing = marketRequestInFlight.get(params.requestKey);
  if (existing) return existing;

  const minPrice = parsePriceFilter(params.filters.minPrice);
  const maxPrice = parsePriceFilter(params.filters.maxPrice);
  const productRequest = params.includeProducts
    ? MobileStoreApi.getMarketplaceProducts({
        cursor: params.productCursor,
        limit: 36,
        category: params.filters.category,
        minPrice,
        maxPrice,
        sortBy: params.filters.sort === 'popular' ? 'popular' : params.filters.sort,
        search: params.search.trim() || null,
      })
    : Promise.resolve(null);
  const designRequest = params.includeDesigns
    ? getMarketFeed({
        cursor: params.designCursor,
        limit: 18,
        tag: params.filters.category,
        counts: 'combined',
      })
    : Promise.resolve(null);
  const collectionRequest = params.includeCollections
    ? MobileStoreApi.getStoreCollections({ limit: 12 })
    : Promise.resolve(null);

  const request = Promise.allSettled([
    productRequest,
    designRequest,
    collectionRequest,
  ]).then(([productResult, designResult, collectionResult]) => ({
    productResult,
    designResult,
    collectionResult,
  }));

  marketRequestInFlight.set(params.requestKey, request);
  void request.finally(() => {
    if (marketRequestInFlight.get(params.requestKey) === request) {
      marketRequestInFlight.delete(params.requestKey);
    }
  });

  return request;
}

export function buildContentItems(products: StoreProduct[], designs: MarketItem[]): MarketContentItem[] {
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

export function getItemMedia(item: MarketContentItem) {
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
  if (item.entityType === 'DESIGN') return 'Runway';
  if (item.entityType === 'PRODUCT') return 'Product';
  return 'Catalog item';
}

export function isCustomReady(item: MarketContentItem) {
  return item.kind === 'product' ? item.product.customOrderEnabled : Boolean(item.design.viewerState?.canBag);
}

export function getItemPriceLabel(item: MarketContentItem) {
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
  return formatMoney(value, currency);
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


function buildRows(args: {
  allItems: MarketContentItem[];
  filteredItems: MarketContentItem[];
  moodboardItems: MarketContentItem[];
  apiSections: MarketSection[];
  collections: StoreCollectionSummary[];
  collectionError: string | null;
  categoryOptions: string[];
  /** Last snapshot taken with no theme filter — see `chromePool` below. */
  chromeItems: MarketContentItem[];
  adirePool: MarketContentItem[];
  adireBatchState: AdireBatchState;
  openAdireAll: () => void;
  loadingMore: boolean;
  setNewestView: () => void;
  setCustomReadyView: () => void;
  openApiSection: (sectionKey: string) => void;
}) {
  const {
    allItems,
    filteredItems,
    moodboardItems,
    apiSections,
    collections,
    collectionError,
    categoryOptions,
    chromeItems,
    adirePool,
    adireBatchState,
    openAdireAll,
    loadingMore,
    setNewestView,
    setCustomReadyView,
    openApiSection,
  } = args;
  /**
   * Hero and the theme rail are CHROME, and chrome is built from the unfiltered
   * pool — never from the results the chrome itself filters.
   *
   * Tapping a live-theme card writes `filters.category`, which is part of
   * `marketQueryKey`, so the whole market list REFETCHES scoped to that theme.
   * While that request is in flight `allItems`/`filteredItems` are empty, and
   * afterwards they hold only that one category. Both of these rows were
   * derived from those arrays, so both vanished the instant you used one of
   * them — the theme rail deleting the control you had just pressed, and the
   * hero above it going with it. Two sections disappearing at once is why it
   * reads as the screen being destroyed.
   *
   * `chromeItems` is the last snapshot taken with no theme applied, so it
   * survives both the refetch and the narrowing. An earlier fix made
   * `buildBlazingTrends`' FALLBACK use `allItems` instead of `filteredItems`,
   * which was the right idea one level too shallow: `allItems` is itself
   * refetched per theme, so it empties too.
   */
  const chromePool = chromeItems.length > 0 ? chromeItems : allItems;
  const heroItems = chromePool.filter(hasDisplayMedia).slice(0, 3);
  const rows: MarketRow[] = [];

  if (heroItems.length > 0) {
    rows.push({ id: 'hero', type: 'HERO_CAROUSEL', items: heroItems });
  }

  /**
   * Adire Casual — its own section, built from whatever the market already has.
   *
   * The pool is every item that mentions adire anywhere a brand might write it
   * (tags, title, description, category, style details), and one BATCH of that
   * pool is shown here. `buildAdireBatch` owns the rotation rules — an item
   * appears at most twice, more if it sells — so this only has to decide where
   * the row sits and what it links to.
   */
  const adireItems = buildAdireBatch(adirePool, (entry) => entry.key, adireBatchState);
  if (adireItems.length > 0) {
    rows.push({
      id: 'adire',
      type: 'ADIRE_ROW',
      title: 'Adire Casual',
      subtitle: 'Indigo-dyed pieces, everyday cuts',
      items: adireItems,
      onSeeAll: openAdireAll,
    });
  }

  apiSections
    .filter((section) => section.items.length > 0)
    .forEach((section) => {
      rows.push({
        id: `api-section:${section.key}`,
        type: 'API_SECTION_ROW',
        section,
        onSeeAll:
          section.supportsViewAll || section.viewAll?.enabled
            ? () => openApiSection(section.key)
            : undefined,
      });
    });

  const freshItems = filteredItems.slice(0, 10);
  if (freshItems.length > 0) {
    rows.push({
      id: 'fresh-row',
      type: 'HORIZONTAL_CARD_ROW',
      title: 'Fresh on WIEZ',
      subtitle: 'New products and custom-ready runway',
      items: freshItems,
      onSeeAll: setNewestView,
    });
  }

  if (moodboardItems.length > 0) {
    rows.push({
      id: 'for-moodboard',
      type: 'HORIZONTAL_CARD_ROW',
      title: 'For your moodboard',
      subtitle: 'Looks to save for inspiration',
      items: moodboardItems,
      source: 'moodboard',
    });
  }

  rows.push({
    id: 'latest-collections',
    type: 'COLLECTION_ROW',
    title: 'Latest Collections',
    subtitle: 'Shop complete edits from WIEZ brands',
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
      title: 'Custom-ready runway',
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
      brandName={getItemBrand(item) ?? 'WIEZ brand'}
      priceLabel={getItemPriceLabel(item)}
      customOrder={Boolean(item.product.customOrderEnabled)}
      mediaSrc={media.mediaSrc}
      mediaFileId={media.mediaFileId}
      newDropItemId={item.product.id}
      newDropCreatedAt={item.product.createdAt}
      analyticsSourceScreen="market"
      unavailable={unavailable}
      favorite={favorite}
      favoriteBusy={favoriteBusy}
      favoriteAccessibilityLabel={favorite ? 'Remove from wishlist' : 'Add to wishlist'}
      actionLabel={unavailable ? 'Out' : BAG_IT_LABEL}
      actionBusy={bagBusy}
      actionDisabled={unavailable}
      onPressIn={() => prefetchMedia({ src: media.mediaSrc, fileId: media.mediaFileId }, 'tap')}
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
      brandName={getItemBrand(item) ?? 'WIEZ brand'}
      priceLabel={getItemPriceLabel(item)}
      customOrder={canRequestCustomOrder}
      mediaSrc={media.mediaSrc}
      mediaFileId={media.mediaFileId}
      newDropItemId={item.design.collectionId}
      newDropCreatedAt={item.design.createdAt ?? item.design.media?.createdAt}
      analyticsSourceScreen="market"
      favorite={favorite}
      favoriteBusy={favoriteBusy}
      favoriteAccessibilityLabel={favorite ? 'Remove from Saved Looks' : 'Save look for inspiration'}
      actionLabel={canRequestCustomOrder ? BAG_IT_LABEL : undefined}
      actionBusy={bagBusy}
      actionDisabled={!canRequestCustomOrder}
      onPressIn={() => prefetchMedia({ src: media.mediaSrc, fileId: media.mediaFileId }, 'tap')}
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
          <AppText variant="captionBold" tone="inverse">Market Pick</AppText>
        </View>
        <NewDropBadge
          itemId={item.key}
          createdAt={getItemCreatedAt(item)}
          sourceScreen="market"
          style={styles.heroNewDropBadge}
        />
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
      {imageUri ? (
        <StableImage uri={imageUri} resizeMode="cover" containerStyle={styles.collectionImage} imageStyle={styles.collectionImage} />
      ) : (
        <View style={[styles.collectionImage, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
          <AppText variant="title" tone="muted">{String.fromCodePoint(0x1f5bc, 0xfe0f)}</AppText>
        </View>
      )}
      <LinearGradient
        colors={['transparent', theme.colors.backdropStrong] as [string, string]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.collectionCountPill, { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder }]}>
        <AppText variant="captionBold" tone="inverse">
          {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}
        </AppText>
      </View>
      <BlurView tint="dark" intensity={24} style={styles.collectionCopy}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.backdrop }]} />
        <AppText variant="bodyBold" tone="inverse" numberOfLines={2}>
          {collection.title}
        </AppText>
        <AppText variant="caption" tone="inverse" numberOfLines={1}>
          {collection.brandName ?? 'WIEZ brand'}
        </AppText>
        <View style={styles.collectionMetaRow}>
          <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
            {getCollectionPriceLabel(collection)}
          </AppText>
          <AppText variant="captionBold" tone="inverse">
            View
          </AppText>
        </View>
      </BlurView>
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
  source,
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
  source?: 'moodboard';
}) {
  const handleOpen = useCallback(
    (item: MarketContentItem) => {
      if (source === 'moodboard' && item.kind === 'design') {
        trackMobileEvent('moodboard_suggestion_opened', {
          sourceScreen: 'market',
          itemId: item.key,
          collectionId: item.design.collectionId,
          brandId: item.design.brandId,
        });
      }
      onOpen(item);
    },
    [onOpen, source],
  );

  const handleFavorite = useCallback(
    (item: MarketContentItem) => {
      if (source === 'moodboard' && item.kind === 'design') {
        trackMobileEvent('moodboard_suggestion_saved', {
          sourceScreen: 'market',
          itemId: item.key,
          collectionId: item.design.collectionId,
          brandId: item.design.brandId,
        });
      }
      onFavorite(item);
    },
    [onFavorite, source],
  );

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
            onOpen={handleOpen}
            onBag={onBag}
            onFavorite={handleFavorite}
          />
        )}
      />
    </View>
  );
}

function formatSectionItemPrice(item: MarketSectionItem) {
  const currency =
    item.price?.currency ?? item.priceRange?.currency ?? 'NGN';
  const amount = item.price?.effectiveAmount ?? item.price?.amount ?? null;
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
  const min = item.priceRange?.min;
  const max = item.priceRange?.max;
  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max > 0) {
    return min === max
      ? `${currency} ${Math.round(min).toLocaleString()}`
      : `${currency} ${Math.round(min).toLocaleString()} - ${Math.round(max).toLocaleString()}`;
  }
  if (item.entityType === 'CATEGORY') return 'Explore';
  if (item.entityType === 'BRAND') return `${item.stats?.products ?? 0} pieces`;
  return 'View';
}

/**
 * Every API-driven section renders the SAME card as the rest of the market.
 *
 * This used to be its own layout: image on top, then a solid card body with an
 * entity-type pill ("PRODUCT"), title, brand and price stacked underneath. So
 * "Hot right now", "Fresh Drops", "Picked for you", "New designers to watch",
 * "Shop by style", "Loved near you", "Still thinking about these", "More from
 * brands you like" and "Style picks of the week" — every section the API
 * drives, which is most of the screen — looked nothing like "Fresh on WIEZ" or
 * "For your moodboard" directly above and below them.
 *
 * `UnifiedProductCard` is the agreed design (full-bleed image, frosted copy
 * panel over it) and it is now the only product card on this screen. The
 * entity-type pill is gone with it: "PRODUCT" told a shopper nothing they could
 * not see, and labels like that were removed from the catalog cards for the
 * same reason.
 *
 * Bag and favourite are not wired here because section items are not
 * `MarketContentItem`s — a section can carry a BRAND or a CATEGORY, which
 * neither action means anything for. The card handles their absence by
 * rendering neither control, so the SHAPE stays identical either way.
 */
function ApiSectionCard({
  item,
  width,
  onOpen,
}: {
  item: MarketSectionItem;
  width: number;
  onOpen: (item: MarketSectionItem) => void;
}) {
  const mediaSrc = item.media?.thumbnailUrl ?? item.media?.url ?? item.brand?.logoUrl ?? null;

  return (
    <UnifiedProductCard
      width={width}
      height={Math.round(width * 1.5)}
      title={item.title}
      brandName={item.brand?.name ?? 'WIEZ brand'}
      priceLabel={formatSectionItemPrice(item)}
      customOrder={Boolean(item.availability?.customOrderEnabled)}
      mediaSrc={mediaSrc}
      mediaFileId={item.media?.fileId ?? null}
      analyticsSourceScreen="market"
      onPress={() => onOpen(item)}
    />
  );
}

function ApiSectionRow({
  section,
  cardWidth,
  onOpen,
  onSeeAll,
}: {
  section: MarketSection;
  cardWidth: number;
  onOpen: (item: MarketSectionItem, sectionKey: string) => void;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <AppText variant="subtitle">{section.title}</AppText>
          {section.subtitle ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {section.subtitle}
            </AppText>
          ) : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={tokens.spacing.sm} accessibilityRole="button" accessibilityLabel={`See all ${section.title}`}>
            <AppText variant="captionBold" tone="primary">See all</AppText>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={section.items}
        horizontal
        keyExtractor={(item) => `${item.entityType}:${item.sourceId}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalCardsContent}
        renderItem={({ item }) => (
          <ApiSectionCard
            item={item}
            width={cardWidth}
            onOpen={(entry) => onOpen(entry, section.key)}
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
          Mix custom-ready design inspiration with ready-to-wear finds from WIEZ brands.
        </AppText>
        <AppText variant="captionBold" tone="primary">Read & Shop {String.fromCodePoint(0x2192)}</AppText>
      </View>
    </Pressable>
  );
}

export function MarketScreen() {
  const flowKey = 'market';
  // Phase 1 instrumentation (gated)
  React.useEffect(() => {
    navPerf.screenMounted(flowKey);
  }, []);

  React.useLayoutEffect(() => {
    navPerf.shellVisible(flowKey);
  }, []);

  React.useEffect(() => {
    navPerf.firstVisibleUi(flowKey);
  }, []);

  const { theme, scheme } = useTheme();
  const { status, user } = useAuth();
  const toast = useToast();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  const { width, height } = useWindowDimensions();
  const { bagProduct, bagSource } = useMobileBagging();
  const deferredWorkReady = useDeferredScreenWork();
  const marketViewerKey = status === 'authenticated' ? user?.id ?? 'authenticated' : 'guest';
  const initialMarketSnapshotRef = useRef<MarketSnapshot | null>(
    readMarketSnapshot(buildMarketQueryKey(DEFAULT_MARKET_FILTERS, '', marketViewerKey))?.snapshot ?? null,
  );
  const [products, setProducts] = useState<StoreProduct[]>(() => initialMarketSnapshotRef.current?.products ?? []);
  const [designs, setDesigns] = useState<MarketItem[]>(() => initialMarketSnapshotRef.current?.designs ?? []);
  const [collections, setCollections] = useState<StoreCollectionSummary[]>(
    () => initialMarketSnapshotRef.current?.collections ?? [],
  );
  const [productCursor, setProductCursor] = useState<string | null>(
    () => initialMarketSnapshotRef.current?.productCursor ?? null,
  );
  const [designCursor, setDesignCursor] = useState<string | null>(
    () => initialMarketSnapshotRef.current?.designCursor ?? null,
  );
  const [productHasNext, setProductHasNext] = useState(() => initialMarketSnapshotRef.current?.productHasNext ?? false);
  const [designHasNext, setDesignHasNext] = useState(() => initialMarketSnapshotRef.current?.designHasNext ?? false);
  const [loading, setLoading] = useState(() => !initialMarketSnapshotRef.current);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(
    () => initialMarketSnapshotRef.current?.collectionError ?? null,
  );
  const [apiSections, setApiSections] = useState<MarketSection[]>(() => marketSectionsCache ?? []);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, MARKET_SEARCH_DEBOUNCE_MS);
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_MARKET_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [favoriteByKey, setFavoriteByKey] = useState<Record<string, boolean>>({});
  const [busyByKey, setBusyByKey] = useState<Record<string, boolean>>({});
  const [favoriteBusyByKey, setFavoriteBusyByKey] = useState<Record<string, boolean>>({});
  const loadedMorePageKeysRef = useRef<Set<string>>(new Set());
  const lastResetQueryKeyRef = useRef<string | null>(null);
  const resetInFlightKeyRef = useRef<string | null>(null);
  const moreInFlightKeyRef = useRef<string | null>(null);
  const productsRef = useRef(products);
  const designsRef = useRef(designs);
  const collectionsRef = useRef(collections);
  const productCursorRef = useRef(productCursor);
  const designCursorRef = useRef(designCursor);
  const productHasNextRef = useRef(productHasNext);
  const designHasNextRef = useRef(designHasNext);
  const collectionErrorRef = useRef(collectionError);
  const moodboardSectionSeenRef = useRef<string | null>(null);
  const moodboardSuggestionSeenRef = useRef<Set<string>>(new Set());
  const viewedSectionKeysRef = useRef<Set<string>>(new Set());
  const viewedItemKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!deferredWorkReady) return undefined;
    return startMarketSignalRuntime();
  }, [deferredWorkReady]);

  // Dev-only nav timing for tabs→market. Shell renders at mount (cached snapshot
  // or skeleton); data is ready once the initial market load settles.
  useEffect(() => {
    navPerf.screenMounted('tabs→market');
    navPerf.shellVisible('tabs→market');
    navPerf.firstVisibleUi('tabs→market');
    if (initialMarketSnapshotRef.current || marketSectionsCache !== null) {
      navPerf.mark('cache_hit', 'tabs→market');
      navPerf.mark('stale_ui_rendered', 'tabs→market');
    } else {
      navPerf.mark('cache_miss', 'tabs→market');
      navPerf.mark('cold_skeleton_rendered', 'tabs→market');
    }
  }, []);
  useEffect(() => {
    if (!loading) navPerf.dataReady('tabs→market');
  }, [loading]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    designsRef.current = designs;
  }, [designs]);

  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  useEffect(() => {
    productCursorRef.current = productCursor;
  }, [productCursor]);

  useEffect(() => {
    designCursorRef.current = designCursor;
  }, [designCursor]);

  useEffect(() => {
    productHasNextRef.current = productHasNext;
  }, [productHasNext]);

  useEffect(() => {
    designHasNextRef.current = designHasNext;
  }, [designHasNext]);

  useEffect(() => {
    collectionErrorRef.current = collectionError;
  }, [collectionError]);

  const bottomClearance = standardScreenBottomPadding;
  // One rotation seed per screen mount: every market entry renders a freshly
  // mixed stack; the order stays stable while the user is on the screen.
  const marketMixSeedRef = useRef(createMixSeed());
  const allItems = useMemo(() => buildContentItems(products, designs), [designs, products]);
  const marketQueryKey = useMemo(
    () => buildMarketQueryKey(filters, debouncedSearch, marketViewerKey),
    [debouncedSearch, filters.category, filters.maxPrice, filters.minPrice, filters.sort, marketViewerKey],
  );

  const applyMarketSnapshot = useCallback((snapshot: MarketSnapshot) => {
    setProducts(snapshot.products);
    setDesigns(snapshot.designs);
    setCollections(snapshot.collections);
    setProductCursor(snapshot.productCursor);
    setDesignCursor(snapshot.designCursor);
    setProductHasNext(snapshot.productHasNext);
    setDesignHasNext(snapshot.designHasNext);
    setCollectionError(snapshot.collectionError);
  }, []);

  const loadApiSections = useCallback(async () => {
    try {
      const response = await getMarketSections({ limit: 8 });
      const nextSections = response.sections ?? [];
      marketSectionsCache = nextSections;
      setApiSections(nextSections);
    } catch {
      // Keep the last visible sections on transient refresh failures.
    }
  }, []);

  /**
   * The market as it looks with NO theme applied.
   *
   * Captured whenever `filters.category` is null and results are in, then held
   * across theme changes so the hero and the theme rail have something stable
   * to be built from. Without it those two rows are derived from a list that
   * the act of choosing a theme empties and re-scopes — so they delete
   * themselves the moment they are used.
   */
  const [chromeItems, setChromeItems] = useState<MarketContentItem[]>([]);

  /**
   * Adire Casual draws from the UNFILTERED pool, like the other chrome.
   *
   * A themed section that empties when someone filters the market by something
   * else is a section that disappears at random, so it reads from the same
   * snapshot the hero does rather than from the current result set.
   */
  const adirePool = useMemo(
    () => filterAdireItems(chromeItems.length > 0 ? chromeItems : allItems),
    [allItems, chromeItems],
  );

  /*
   * The exposure tally lives in a ref: it is bookkeeping for the rotation, not
   * something the screen renders, and putting it in state would re-run the
   * batch on every tick that reads it. Reset when the pool identity changes so
   * a fresh set of items starts from a clean count.
   */
  const adireBatchStateRef = useRef<AdireBatchState>(createAdireBatchState());
  useEffect(() => {
    adireBatchStateRef.current = createAdireBatchState();
  }, [adirePool]);

  const openAdireAll = useCallback(() => {
    drillDownPush('/adire' as any);
  }, []);

  useEffect(() => {
    if (filters.category) return;
    if (allItems.length === 0) return;
    setChromeItems(allItems);
  }, [allItems, filters.category]);

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

    if (filters.sort === 'price_asc' || filters.sort === 'price_desc' || filters.sort === 'popular') {
      return next.sort((a, b) => {
        if (filters.sort === 'price_asc') return (getItemPrice(a) ?? Number.MAX_SAFE_INTEGER) - (getItemPrice(b) ?? Number.MAX_SAFE_INTEGER);
        if (filters.sort === 'price_desc') return (getItemPrice(b) ?? 0) - (getItemPrice(a) ?? 0);
        return getPopularity(b) - getPopularity(a);
      });
    }

    // Default view: scored rotation (recency + popularity weighted, seeded
    // per screen mount) — the market never renders the same stack in the
    // same order on every visit. Explicit user sorts above stay exact.
    return mixScoredItems(next, marketMixSeedRef.current, {
      getId: (item) => item.key,
      getCreatedAtMs: (item) => new Date(getItemCreatedAt(item) ?? 0).getTime(),
      getPopularity,
      getBrandKey: (item) => getItemBrand(item),
    });
  }, [allItems, filters, search]);

  const moodboardRecommendations = useMemo(() => {
    const preferredKeys = [
      filters.category,
      ...search.split(/\s+/g).map((entry) => entry.trim()).filter(Boolean),
    ].filter((entry): entry is string => Boolean(entry));

    const candidates = filteredItems
      .filter((item): item is DesignMarketItem => item.kind === 'design')
      .map((item) => ({
        id: item.key,
        item,
        entityType: 'DESIGN' as const,
        createdAt: item.design.createdAt ?? item.design.media?.createdAt ?? null,
        brandId: item.design.brandId ?? null,
        categoryKeys: getItemCategories(item),
        tagKeys: item.design.tags ?? [],
        mediaReady: hasDisplayMedia(item),
        alreadySaved: Boolean(favoriteByKey[item.key]),
        signals: {
          threadCount: item.design.threadsCount ?? item.design.stats?.threads ?? null,
          commentCount: item.design.combinedCommentsCount ?? item.design.commentsCount ?? null,
          commerceReady: typeof item.design.viewerState?.canBag === 'boolean' ? item.design.viewerState.canBag : null,
        },
      }));

    return buildMoodboardSuggestionSection(candidates, {
      userProfile: preferredKeys.length ? { preferredKeys } : null,
      limit: 10,
    });
  }, [favoriteByKey, filteredItems, filters.category, search]);

  const moodboardItems = useMemo(
    () => moodboardRecommendations.map((candidate) => candidate.item),
    [moodboardRecommendations],
  );

  const moodboardScoreByKey = useMemo(
    () => Object.fromEntries(moodboardRecommendations.map((candidate) => [candidate.item.key, candidate.score])),
    [moodboardRecommendations],
  );

  useEffect(() => {
    if (moodboardItems.length === 0) return;
    const sectionKey = moodboardItems.map((item) => item.key).join('|');
    if (moodboardSectionSeenRef.current !== sectionKey) {
      moodboardSectionSeenRef.current = sectionKey;
      trackMobileEvent('moodboard_section_seen', {
        sourceScreen: 'market',
        sectionId: 'for-moodboard',
        itemCount: moodboardItems.length,
      });
      trackMarketSignal({
        targetType: 'SECTION',
        targetId: 'for-moodboard',
        signalType: 'MARKET_SECTION_VIEW',
        surface: 'MARKET_HOME',
        sectionKey: 'for-moodboard',
      });
    }

    moodboardItems.forEach((item, index) => {
      const seenKey = `${item.key}:${index}`;
      if (moodboardSuggestionSeenRef.current.has(seenKey)) return;
      moodboardSuggestionSeenRef.current.add(seenKey);
      trackMobileEvent('moodboard_suggestion_seen', {
        sourceScreen: 'market',
        itemId: item.key,
        collectionId: item.kind === 'design' ? item.design.collectionId : null,
        brandId: getItemBrandId(item),
        position: index,
        score: moodboardScoreByKey[item.key],
      });
      const target = getMarketSignalTarget(item);
      trackMarketSignal({
        ...target,
        signalType: 'SUGGESTION_ITEM_VIEW',
        surface: 'MARKET_HOME',
        sectionKey: 'for-moodboard',
        suggestionBlockKey: 'for-moodboard',
        position: index,
        metadata: { score: moodboardScoreByKey[item.key] },
      });
    });
  }, [moodboardItems, moodboardScoreByKey]);

  const loadMarket = useCallback(
    async (mode: 'reset' | 'more', options?: { forceRefresh?: boolean }) => {
      let didStartBackgroundRefresh = false;
      if (mode === 'reset') {
        const cached = options?.forceRefresh ? null : readMarketSnapshot(marketQueryKey);
        if (cached) {
          navPerf.mark('cache_hit', 'tabs→market');
          applyMarketSnapshot(cached.snapshot);
          setError(null);
          setLoading(false);
          setCollectionError(cached.snapshot.collectionError);
          if (cached.isFresh) {
            lastResetQueryKeyRef.current = marketQueryKey;
            return;
          }
          navPerf.mark('stale_ui_rendered', 'tabs→market');
          navPerf.mark('background_refresh_started', 'tabs→market');
          didStartBackgroundRefresh = true;
        } else if (
          !options?.forceRefresh &&
          lastResetQueryKeyRef.current === marketQueryKey &&
          (allItems.length > 0 || collectionsRef.current.length > 0)
        ) {
          return;
        }

        if (!options?.forceRefresh && resetInFlightKeyRef.current === marketQueryKey) {
          return;
        }

        resetInFlightKeyRef.current = marketQueryKey;
        loadedMorePageKeysRef.current.clear();
        setError(null);
        setCollectionError(null);
        setLoading(!cached && allItems.length === 0 && collectionsRef.current.length === 0);
      } else {
        const canFetchProducts = productHasNext && Boolean(productCursor);
        const canFetchDesigns = designHasNext && Boolean(designCursor);
        if (loadingMore || (!canFetchProducts && !canFetchDesigns)) return;
        const pageKey = `${marketQueryKey}:p=${productCursor ?? ''}:d=${designCursor ?? ''}`;
        if (moreInFlightKeyRef.current === pageKey || loadedMorePageKeysRef.current.has(pageKey)) return;
        moreInFlightKeyRef.current = pageKey;
        setLoadingMore(true);
      }

      try {
        const canFetchProducts = mode === 'reset' || (productHasNext && Boolean(productCursor));
        const canFetchDesigns = mode === 'reset' || (designHasNext && Boolean(designCursor));
        const pageKey =
          mode === 'reset'
            ? `${marketQueryKey}:reset`
            : `${marketQueryKey}:p=${productCursor ?? ''}:d=${designCursor ?? ''}`;
        const { productResult, designResult, collectionResult } = await fetchMarketBatch({
          requestKey: pageKey,
          filters,
          search: debouncedSearch,
          productCursor: mode === 'more' ? productCursor : null,
          designCursor: mode === 'more' ? designCursor : null,
          includeCollections: mode === 'reset',
          includeProducts: canFetchProducts,
          includeDesigns: canFetchDesigns,
        });
        const productValue = productResult.status === 'fulfilled' ? productResult.value : null;
        const designValue = designResult.status === 'fulfilled' ? designResult.value : null;
        const collectionValue = collectionResult.status === 'fulfilled' ? collectionResult.value : null;
        const productOk = productValue !== null;
        const designOk = designValue !== null;
        const collectionOk = collectionResult.status === 'fulfilled';
        const previousProducts = productsRef.current;
        const previousDesigns = designsRef.current;
        const previousCollections = collectionsRef.current;
        const hasVisibleMarketState =
          previousProducts.length > 0 ||
          previousDesigns.length > 0 ||
          previousCollections.length > 0;

        if (!productOk && !designOk && !hasVisibleMarketState) {
          const failureReason =
            productResult.status === 'rejected'
              ? productResult.reason
              : designResult.status === 'rejected'
                ? designResult.reason
                : null;
          setError(toErrorMessage(failureReason));
        }

        let nextProducts: StoreProduct[] | null = mode === 'reset' ? previousProducts : null;
        let nextDesigns: MarketItem[] | null = mode === 'reset' ? previousDesigns : null;
        let nextCollections: StoreCollectionSummary[] | null = mode === 'reset' ? previousCollections : null;
        let nextProductCursor: string | null = mode === 'reset' ? productCursorRef.current : null;
        let nextDesignCursor: string | null = mode === 'reset' ? designCursorRef.current : null;
        let nextProductHasNext = mode === 'reset' ? productHasNextRef.current : false;
        let nextDesignHasNext = mode === 'reset' ? designHasNextRef.current : false;
        let nextCollectionError: string | null = mode === 'reset' ? collectionErrorRef.current : null;

        if (productValue) {
          nextProductCursor = productValue.nextCursor;
          nextProductHasNext = productValue.hasNextPage;
          if (mode === 'reset') {
            nextProducts = productValue.items;
            setProducts(nextProducts);
          } else {
            setProducts((current) => {
              const seen = new Set(current.map((item) => item.id));
              const merged = [...current, ...productValue.items.filter((item) => !seen.has(item.id))];
              nextProducts = merged;
              return merged;
            });
          }
          setProductCursor(nextProductCursor);
          setProductHasNext(nextProductHasNext);
        }

        if (designValue) {
          nextDesignCursor = designValue.nextCursor ?? null;
          nextDesignHasNext = Boolean(designValue.hasNextPage);
          if (mode === 'reset') {
            nextDesigns = designValue.items;
            setDesigns(nextDesigns);
          } else {
            setDesigns((current) => {
              const seen = new Set(current.map((item) => item.collectionId));
              const merged = [...current, ...designValue.items.filter((item) => !seen.has(item.collectionId))];
              nextDesigns = merged;
              return merged;
            });
          }
          setDesignCursor(nextDesignCursor);
          setDesignHasNext(nextDesignHasNext);
        }

        if (mode === 'reset') {
          if (collectionOk && collectionValue) {
            nextCollections = collectionValue.items;
            setCollections(nextCollections);
            setCollectionError(null);
          } else if (collectionResult.status === 'rejected') {
            nextCollectionError = toErrorMessage(collectionResult.reason);
            setCollectionError(nextCollectionError);
          }

          if (productValue || designValue || collectionValue) {
            writeMarketSnapshot(marketQueryKey, {
              products: nextProducts ?? [],
              designs: nextDesigns ?? [],
              collections: nextCollections ?? [],
              productCursor: nextProductCursor,
              designCursor: nextDesignCursor,
              productHasNext: nextProductHasNext,
              designHasNext: nextDesignHasNext,
              collectionError: nextCollectionError,
            });
            lastResetQueryKeyRef.current = marketQueryKey;
          }
        } else {
          loadedMorePageKeysRef.current.add(pageKey);
        }
      } finally {
        if (mode === 'reset') {
          if (resetInFlightKeyRef.current === marketQueryKey) {
            resetInFlightKeyRef.current = null;
          }
          setLoading(false);
          if (didStartBackgroundRefresh) {
            navPerf.mark('background_refresh_completed', 'tabs→market');
          }
        } else {
          moreInFlightKeyRef.current = null;
          setLoadingMore(false);
        }
      }
    },
    [
      allItems.length,
      applyMarketSnapshot,
      debouncedSearch,
      designCursor,
      designHasNext,
      filters.category,
      filters.maxPrice,
      filters.minPrice,
      filters.sort,
      loadingMore,
      marketQueryKey,
      productCursor,
      productHasNext,
    ],
  );

  useEffect(() => {
    void loadMarket('reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketQueryKey]);

  useEffect(() => {
    if (!deferredWorkReady) return;
    void loadApiSections();
  }, [deferredWorkReady, loadApiSections]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    products.forEach((product) => {
      next[`product:${product.id}`] = Boolean(product.isWishlisted);
    });
    setFavoriteByKey((current) => ({ ...next, ...current }));
  }, [products]);

  useEffect(() => {
    if (!deferredWorkReady || status !== 'authenticated' || designs.length === 0) return undefined;
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
  }, [deferredWorkReady, designs, status]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadMarket('reset', { forceRefresh: true }),
      loadApiSections(),
    ]);
    setRefreshing(false);
  }, [loadApiSections, loadMarket]);

  const requireAuth = useCallback(() => {
    if (status === 'authenticated') return true;
    toast.info('Please sign in to continue.');
    drillDownPush({ pathname: '/(auth)/login', params: { next: '/(tabs)/discover' } } as any);
    return false;
  }, [status, toast]);

  const openItem = useCallback((item: MarketContentItem) => {
    const target = getMarketSignalTarget(item);
    trackMarketSignal({
      ...target,
      signalType: 'OPEN',
      surface: 'MARKET_HOME',
      sectionKey: 'market-local',
      metadata: { itemKind: item.kind },
    });
    void flushMarketSignals();

    if (item.kind === 'product') {
      drillDownPush({ pathname: '/products/[productId]', params: { productId: item.product.id } } as any);
      return;
    }
    drillDownPush({
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
    trackMarketSignal({
      targetType: 'COLLECTION',
      targetId: collection.id,
      signalType: 'OPEN',
      surface: 'MARKET_HOME',
      sectionKey: 'latest-collections',
    });
    void flushMarketSignals();
    drillDownPush({
      pathname: '/collection-viewer',
      params: { collectionId: collection.id, returnTo: '/(tabs)/discover' },
    } as any);
  }, []);

  const openApiSection = useCallback((sectionKey: string) => {
    if (!sectionKey) return;
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: sectionKey,
      signalType: 'MARKET_SECTION_VIEW_ALL_CLICK',
      surface: 'MARKET_HOME',
      sectionKey,
    });
    void flushMarketSignals();
    navPerf.tap('market→section');
    navPerf.navigationCalled();
    drillDownPush({
      pathname: '/market-section',
      params: { sectionKey },
    } as any);
  }, []);

  const openApiSectionItem = useCallback((item: MarketSectionItem, sectionKey: string) => {
    const targetType = item.target?.type ?? item.entityType;
    const targetId = item.target?.id ?? item.sourceId;
    trackMarketSignal({
      targetType,
      targetId: targetId ?? item.sourceId,
      signalType: 'OPEN',
      surface: 'MARKET_HOME',
      sectionKey,
      metadata: { sourceType: item.sourceType, entityType: item.entityType },
    });
    void flushMarketSignals();

    if (targetType === 'PRODUCT' && targetId) {
      drillDownPush({ pathname: '/products/[productId]', params: { productId: targetId } } as any);
      return;
    }
    if (targetType === 'DESIGN' && targetId) {
      drillDownPush({
        pathname: '/market-viewer',
        params: {
          sourceType: 'DESIGN',
          sourceId: targetId,
          brandId: item.brand?.id ?? undefined,
          title: item.title,
          brandName: item.brand?.name ?? '',
          priceLabel: formatSectionItemPrice(item),
        },
      } as any);
      return;
    }
    if (targetType === 'COLLECTION' && targetId) {
      drillDownPush({
        pathname: '/collection-viewer',
        params: { collectionId: targetId, returnTo: '/(tabs)/discover' },
      } as any);
      return;
    }
    if (targetType === 'BRAND' && targetId) {
      drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: targetId } } as any);
      return;
    }
    if (targetType === 'CATEGORY') {
      setFilters((current) => ({
        ...current,
        category: item.category?.name ?? item.category?.slug ?? item.title,
      }));
    }
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
          trackMobileEvent('bag_tapped', {
            sourceScreen: 'market',
            sourceType: 'PRODUCT',
            sourceId: item.product.id,
            productId: item.product.id,
            eligibilityState: productStock(item.product) > 0 ? 'eligible' : 'not_eligible',
          });
          await bagProduct({ id: item.product.id, name: item.product.name });
        } else {
          trackMobileEvent('bag_tapped', {
            sourceScreen: 'market',
            sourceType: 'DESIGN',
            sourceId: item.design.collectionId,
            designId: item.design.collectionId,
            collectionId: item.design.collectionId,
            eligibilityState: item.design.viewerState?.canBag ? 'eligible' : 'not_eligible',
          });
          trackMobileEvent('custom_order_tapped', {
            sourceScreen: 'market',
            sourceType: 'DESIGN',
            sourceId: item.design.collectionId,
            brandId: item.design.brandId,
            eligibilityState: item.design.viewerState?.canBag ? 'eligible' : 'not_eligible',
          });
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
          trackMobileEvent('design_unsaved', {
            sourceScreen: 'market',
            targetType: 'DESIGN',
            targetId: item.design.collectionId,
            collectionId: item.design.collectionId,
            brandId: item.design.brandId,
          });
        } else {
          await SavedItemsApi.saveCatalogTarget({
            targetType: 'DESIGN',
            designId: item.design.collectionId,
            legacyCollectionId: item.design.collectionId,
          });
          trackMobileEvent('design_saved', {
            sourceScreen: 'market',
            targetType: 'DESIGN',
            targetId: item.design.collectionId,
            collectionId: item.design.collectionId,
            brandId: item.design.brandId,
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
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: 'fresh-row',
      signalType: 'MARKET_SECTION_VIEW_ALL_CLICK',
      surface: 'MARKET_HOME',
      sectionKey: 'fresh-row',
    });
    setFilters((current) => ({ ...current, availability: 'all', sort: 'newest' }));
  }, []);

  const setCustomReadyView = useCallback(() => {
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: 'custom-ready-row',
      signalType: 'MARKET_SECTION_VIEW_ALL_CLICK',
      surface: 'MARKET_HOME',
      sectionKey: 'custom-ready-row',
    });
    setFilters((current) => ({ ...current, availability: 'custom_ready' }));
  }, []);

  const rowData = useMemo<MarketRow[]>(() => {
    if (error) return [{ id: 'error', type: 'ERROR_STATE', message: error }];
    /**
     * "No results" replaces the RESULTS, not the whole screen.
     *
     * This returned a bare empty state, which on a theme change meant the hero
     * and the theme rail were unmounted along with the items — and a theme
     * refetch passes through exactly this branch, because `filteredItems` is
     * empty for as long as the request is in flight. Once there is a chrome
     * snapshot to draw from, the empty state is appended BELOW the chrome so
     * the rail that applied the filter is still there to clear it.
     */
    const noContent =
      filteredItems.length === 0 && collections.length === 0 && apiSections.length === 0;
    if (noContent && chromeItems.length === 0) {
      return [{ id: 'empty', type: 'EMPTY_STATE' }];
    }
    if (noContent) {
      return [
        ...buildRows({
          allItems,
          chromeItems,
          adirePool,
          adireBatchState: adireBatchStateRef.current,
          openAdireAll,
          filteredItems,
          moodboardItems,
          apiSections,
          collections,
          collectionError,
          categoryOptions,
          loadingMore,
          setNewestView,
          setCustomReadyView,
          openApiSection,
        }).filter((row) => row.type === 'HERO_CAROUSEL'),
        { id: 'empty', type: 'EMPTY_STATE' },
      ];
    }
    return buildRows({
      allItems,
      chromeItems,
      adirePool,
      adireBatchState: adireBatchStateRef.current,
      openAdireAll,
      filteredItems,
      moodboardItems,
      apiSections,
      collections,
      collectionError,
      categoryOptions,
      loadingMore,
      setNewestView,
      setCustomReadyView,
      openApiSection,
    });
  }, [
    adirePool,
    allItems,
    apiSections,
    categoryOptions,
    chromeItems,
    collectionError,
    openAdireAll,
    collections,
    error,
    filteredItems,
    loadingMore,
    moodboardItems,
    openApiSection,
    setCustomReadyView,
    setNewestView,
  ]);

  const trackItemImpression = useCallback(
    (item: MarketContentItem, sectionKey: string, position: number) => {
      const target = getMarketSignalTarget(item);
      const itemKey = `${sectionKey}:${target.targetType}:${target.targetId}:${position}`;
      if (viewedItemKeysRef.current.has(itemKey)) return;
      viewedItemKeysRef.current.add(itemKey);
      if (viewedItemKeysRef.current.size > 500) {
        viewedItemKeysRef.current.clear();
      }
      trackMarketSignal({
        ...target,
        signalType: 'IMPRESSION',
        surface: 'MARKET_HOME',
        sectionKey,
        position,
      });
    },
    [],
  );

  const trackSectionImpressions = useCallback(
    (row: MarketRow) => {
      if (row.type === 'EMPTY_STATE' || row.type === 'ERROR_STATE' || row.type === 'LOADING_MORE') {
        return;
      }

      const sectionKey = row.type === 'API_SECTION_ROW' ? row.section.key : row.id;
      if (!viewedSectionKeysRef.current.has(sectionKey)) {
        viewedSectionKeysRef.current.add(sectionKey);
        trackMarketSignal({
          targetType: 'SECTION',
          targetId: sectionKey,
          signalType: 'MARKET_SECTION_VIEW',
          surface: 'MARKET_HOME',
          sectionKey,
        });
      }

      if (row.type === 'HERO_CAROUSEL') {
        row.items.forEach((entry, index) => trackItemImpression(entry, sectionKey, index));
      }
      if (
        row.type === 'HORIZONTAL_CARD_ROW' ||
        row.type === 'ADIRE_ROW' ||
        row.type === 'PRODUCT_GRID'
      ) {
        row.items.forEach((entry, index) => trackItemImpression(entry, sectionKey, index));
      }
      if (row.type === 'API_SECTION_ROW') {
        row.section.items.forEach((entry, index) => {
          const targetType = entry.target?.type ?? entry.entityType;
          const targetId = entry.target?.id ?? entry.sourceId;
          const itemKey = `${sectionKey}:${targetType}:${targetId}:${index}`;
          if (viewedItemKeysRef.current.has(itemKey)) return;
          viewedItemKeysRef.current.add(itemKey);
          trackMarketSignal({
            targetType,
            targetId: targetId ?? entry.sourceId,
            signalType: 'IMPRESSION',
            surface: 'MARKET_HOME',
            sectionKey: row.section.key,
            position: index,
          });
        });
      }
      if (row.type === 'COLLECTION_ROW') {
        row.items.forEach((collection, index) => {
          const itemKey = `${sectionKey}:COLLECTION:${collection.id}:${index}`;
          if (viewedItemKeysRef.current.has(itemKey)) return;
          viewedItemKeysRef.current.add(itemKey);
          trackMarketSignal({
            targetType: 'COLLECTION',
            targetId: collection.id,
            signalType: 'IMPRESSION',
            surface: 'MARKET_HOME',
            sectionKey,
            position: index,
          });
        });
      }
      if (row.type === 'EDITORIAL_CARD' && row.item) {
        trackItemImpression(row.item, sectionKey, 0);
      }
    },
    [trackItemImpression],
  );

  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 250,
  });

  const handleViewableRowsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: MarketRow | null }> }) => {
      viewableItems.forEach(({ item }) => {
        if (item) trackSectionImpressions(item);
      });
    },
    [trackSectionImpressions],
  );

  const horizontalCardWidth = Math.min(184, Math.max(150, Math.round(width * 0.42)));
  const heroHeight = Math.min(236, Math.max(176, Math.round(height * 0.24)));

  /**
   * Applying a theme scrolls back to the top.
   *
   * The rows above the tap point change when a filter lands, so leaving the
   * list where it was meant the user's viewport jumped to a different section
   * without moving — the second half of "it feels like I am routed to another
   * screen". Returning to the top shows the change in context: the theme bar
   * appears, the rail is still there, and the list below it is visibly the new
   * one.
   */
  const feedListRef = useRef<FlatList<MarketRow> | null>(null);
  const lastAppliedCategoryRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const next = filters.category ?? null;
    if (lastAppliedCategoryRef.current === undefined) {
      lastAppliedCategoryRef.current = next;
      return;
    }
    if (lastAppliedCategoryRef.current === next) return;
    lastAppliedCategoryRef.current = next;
    feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [filters.category]);


  const renderRow = useCallback(
    ({ item }: { item: MarketRow }) => {
      switch (item.type) {
        case 'HERO_CAROUSEL':
          return <MarketHeroCarousel items={item.items} width={width} height={heroHeight} onOpen={openItem} />;
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
              source={item.source}
            />
          );
        case 'ADIRE_ROW':
          /* Same row component as every other curated strip, so Adire Casual
             is a section of the market rather than a special case in it. */
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
        case 'API_SECTION_ROW':
          return (
            <ApiSectionRow
              section={item.section}
              cardWidth={horizontalCardWidth}
              onOpen={openApiSectionItem}
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
              onRetry={() => void loadMarket('reset', { forceRefresh: true })}
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
              <MuseLoader size={20} />
            </View>
          );
        case 'ERROR_STATE':
          return <MarketErrorState message={item.message} onRetry={() => void loadMarket('reset', { forceRefresh: true })} />;
        case 'EMPTY_STATE':
        default:
          return <MarketEmptyState onClear={clearFilters} onRetry={() => void loadMarket('reset', { forceRefresh: true })} />;
      }
    },
    [
      busyByKey,
      clearFilters,
      favoriteBusyByKey,
      favoriteByKey,
      handleBag,
      handleFavorite,
      heroHeight,
      horizontalCardWidth,
      loadMarket,
      openCollection,
      openApiSectionItem,
      openItem,
      theme.colors.primary,
      width,
    ],
  );

  const renderHeader = (
    <View style={styles.headerStack}>
      <View style={styles.topRow}>
        <Pressable onPress={() => topLevelNavigate('/' as any)} style={({ pressed }) => [styles.logoButton, pressed && styles.pressed]}>
          <WiezMark size={30} />
        </Pressable>
        <View style={styles.titleWrap}>
          <AppText variant="title">Market</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            Products and custom-ready runway
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
          accessibilityLabel="Sort and filter the market"
        >
          {/*
            Sliders, not a gear.

            A cog means "settings" — app preferences, account, configuration —
            everywhere else a person uses a phone, so putting one here promised
            the wrong screen. The slider control is the one glyph that reads as
            "adjust what I am looking at", and it is what filter controls use
            across the apps this audience already knows. The label goes under it
            because an icon alone in a header is a guess either way.
          */}
          <AppText variant="subtitle">{MARKET_FILTER_EMOJI}</AppText>
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

      {/*
        Say which theme is on, and give a way off it.

        Live themes and the category chips are DIFFERENT taxonomies: the chips
        come from `categoryOptions` ("Ankara Fashion", "Lacewear", …) while a
        live theme falls back to an item's own category ("Bridal",
        "Two-piece set"). Tapping a theme set `filters.category` to a value no
        chip could match — so no chip highlighted, "All" un-highlighted too, and
        the screen entered a filtered state that its own controls could neither
        show nor clear. The user had no indication anything had been applied,
        let alone how to undo it.

        This bar is bound to the filter itself rather than to the chip list, so
        it is correct whichever taxonomy set it.
      */}
      {filters.category ? (
        /*
          One control, and it is a way OUT.

          Choosing a theme re-scopes the whole market, which is a place you have
          gone rather than a chip you have ticked — so the thing that undoes it
          has to read like leaving. It was a pill with a small ✕ on the end: two
          targets, the useful one the size of a full stop, and nothing saying
          where pressing it would put you.

          The whole bar is now the exit, it leads with a back arrow, and it says
          where it goes.
        */
        <Pressable
          onPress={() => setFilters((current) => ({ ...current, category: null }))}
          accessibilityRole="button"
          accessibilityLabel={`Leave the ${filters.category} theme and return to the full market`}
          style={({ pressed }) => [styles.activeFilterRow, pressed && styles.pressed]}
        >
          <View
            style={[
              styles.activeFilterPill,
              { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.focusRing },
            ]}
          >
            <AppText variant="captionBold" tone="primary">←</AppText>
            <AppText variant="captionBold" tone="primary" numberOfLines={1} style={styles.activeFilterLabel}>
              Showing “{filters.category}” · Back to all
            </AppText>
          </View>
        </Pressable>
      ) : null}
    </View>
  );

  if (loading && allItems.length === 0 && collections.length === 0 && apiSections.length === 0) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.surface, paddingTop: insets.top }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <MarketSkeleton bottomPadding={bottomClearance} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.surface, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        ref={feedListRef}
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
        viewabilityConfig={viewabilityConfigRef.current}
        onViewableItemsChanged={handleViewableRowsChanged}
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
  activeFilterRow: {
    flexDirection: 'row',
    paddingTop: tokens.spacing.sm,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 32,
    maxWidth: '100%',
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
  },
  activeFilterLabel: {
    flexShrink: 1,
    minWidth: 0,
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
    ...StyleSheet.absoluteFill,
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
  heroNewDropBadge: {
    maxWidth: 118,
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
  horizontalCardsContent: {
    paddingHorizontal: SIDE_PADDING,
    gap: CARD_GAP,
  },
  collectionCard: {
    height: 262,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  collectionImage: {
    ...StyleSheet.absoluteFill,
  },
  collectionCountPill: {
    position: 'absolute',
    right: tokens.spacing.sm,
    top: tokens.spacing.sm,
    minHeight: 28,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionCopy: {
    position: 'absolute',
    left: tokens.spacing.sm,
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    maxHeight: 52,
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
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
    ...StyleSheet.absoluteFill,
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
