import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { NATIVE_ISLAND_NAV } from '@/components/navigation/NativeIslandBottomNav';
import { MobileStoreApi, type StoreProduct } from '@/src/api/StoreApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { getMarketFeed } from '@/src/api/MarketApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { MarketFilterSheet } from '@/src/features/market/components/MarketFilterSheet';
import { MarketProductCard } from '@/src/features/market/components/MarketProductCard';
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

const GRID_GAP = tokens.spacing.sm;
const SIDE_PADDING = tokens.spacing.md;
const PREFERRED_CATEGORIES = ['Ankara Fashion', 'Lacewear', 'Ready to Wear', 'Custom', 'Bridal'];

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to load market right now.';

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
    ...products.map((product) => ({ key: `product:${product.id}`, kind: 'product' as const, product })),
    ...designs.map((design) => ({ key: `design:${design.collectionId}`, kind: 'design' as const, design })),
  ];
}

export function MarketScreen() {
  const { theme, scheme } = useTheme();
  const { status } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { bagProduct, bagSource, refreshGlobalBagCount } = useMobileBagging();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [designs, setDesigns] = useState<MarketItem[]>([]);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [designCursor, setDesignCursor] = useState<string | null>(null);
  const [productHasNext, setProductHasNext] = useState(false);
  const [designHasNext, setDesignHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_MARKET_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [favoriteByKey, setFavoriteByKey] = useState<Record<string, boolean>>({});
  const [busyByKey, setBusyByKey] = useState<Record<string, boolean>>({});
  const [favoriteBusyByKey, setFavoriteBusyByKey] = useState<Record<string, boolean>>({});

  const columnCount = width >= 760 ? 5 : width >= 620 ? 4 : width >= 330 ? 3 : 2;
  const cardWidth = Math.floor((width - SIDE_PADDING * 2 - GRID_GAP * (columnCount - 1)) / columnCount);
  const bottomClearance = NATIVE_ISLAND_NAV.contentClearance + insets.bottom;
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
      const title = item.kind === 'product' ? item.product.name : item.design.collectionTitle;
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
      if (filters.availability === 'custom_ready') {
        return item.kind === 'product'
          ? item.product.customOrderEnabled
          : Boolean(item.design.viewerState?.canBag);
      }
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

        const [productResult, designResult] = await Promise.allSettled([productRequest, designRequest]);
        const productOk = productResult.status === 'fulfilled';
        const designOk = designResult.status === 'fulfilled';

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
    // Reset only when query-shaping controls change. Pagination cursors update inside
    // loadMarket and must not recursively trigger another first-page request.
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
    if (status !== 'authenticated' || designs.length === 0) return;
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
      pathname: '/catalog/view/[collectionId]',
      params: { collectionId: item.design.collectionId, scope: 'design' },
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
        await refreshGlobalBagCount();
      } catch (error) {
        toast.error(toErrorMessage(error));
      } finally {
        setBusy(item.key, false);
      }
    },
    [bagProduct, bagSource, refreshGlobalBagCount, requireAuth, setBusy, toast],
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
          await SavedItemsApi.unsaveItem('COLLECTION', item.design.collectionId);
        } else {
          await SavedItemsApi.saveItem('COLLECTION', item.design.collectionId);
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
              borderBottomColor: !filters.category ? theme.colors.primary : 'transparent',
            },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="captionBold" tone={!filters.category ? 'primary' : 'secondary'}>All</AppText>
        </Pressable>
        {categoryOptions.map((category) => (
          <Pressable
            key={category}
            onPress={() => setFilters((current) => ({ ...current, category }))}
            style={({ pressed }) => [
              styles.categoryChip,
              {
                borderBottomColor: filters.category === category ? theme.colors.primary : 'transparent',
              },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="captionBold" tone={filters.category === category ? 'primary' : 'secondary'} numberOfLines={1}>
              {category}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  if (loading && allItems.length === 0) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />
        <MarketSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />
      <FlatList
        key={`market-grid-${columnCount}`}
        data={error ? [] : filteredItems}
        keyExtractor={(item) => item.key}
        numColumns={columnCount}
        columnWrapperStyle={columnCount > 1 ? styles.row : undefined}
        renderItem={({ item }) => (
          <MarketProductCard
            item={item}
            width={cardWidth}
            favorite={Boolean(favoriteByKey[item.key])}
            bagBusy={Boolean(busyByKey[item.key])}
            favoriteBusy={Boolean(favoriteBusyByKey[item.key])}
            onOpen={openItem}
            onBag={handleBag}
            onFavorite={handleFavorite}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          error ? (
            <MarketErrorState message={error} onRetry={() => void loadMarket('reset')} />
          ) : (
            <MarketEmptyState onClear={clearFilters} onRetry={() => void loadMarket('reset')} />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (productHasNext || designHasNext) && filteredItems.length > 0 ? (
            <Pressable
              onPress={() => void loadMarket('more')}
              style={({ pressed }) => [styles.loadMore, { borderColor: theme.colors.border }, pressed && styles.pressed]}
            >
              <AppText variant="bodyBold" tone="primary">Load more</AppText>
            </Pressable>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
        contentContainerStyle={[styles.content, { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onEndReached={() => {
          if (!loadingMore && (productHasNext || designHasNext)) {
            void loadMarket('more');
          }
        }}
        onEndReachedThreshold={0.6}
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
  content: {
    paddingHorizontal: SIDE_PADDING,
    gap: GRID_GAP,
  },
  headerStack: {
    paddingTop: tokens.spacing.xs,
    paddingBottom: tokens.spacing.md,
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
    gap: tokens.spacing.md,
    paddingRight: tokens.spacing.lg,
  },
  categoryChip: {
    minHeight: 36,
    borderBottomWidth: 2,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 160,
  },
  row: {
    gap: GRID_GAP,
  },
  rowSpacer: {
    height: GRID_GAP,
  },
  footer: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMore: {
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: tokens.spacing.lg,
  },
  footerSpacer: {
    height: tokens.spacing.xl,
  },
  pressed: {
    opacity: 0.76,
  },
});
