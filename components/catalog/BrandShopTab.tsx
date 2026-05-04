import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { useAuth } from '@/src/auth/AuthContext';
import { useAuthAction } from '@/src/hooks/useAuthAction';
import { useToast } from '@/src/toast/ToastContext';
import {
  MobileStoreApi,
  type StoreProduct,
  type StoreProductVariant,
} from '@/src/api/StoreApi';
import { LoaderBlock } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { CatalogCardSurface } from '@/components/catalog/CatalogCardSurface';
import { SkeletonProductCard } from '@/components/ui/Skeleton';
import { AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { BagPulseIcon, type BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useProductBagging } from '@/src/hooks/useProductBagging';

type SortKey = 'newest' | 'price_low_high' | 'price_high_low';
type FilterKey = 'all' | 'in_stock' | 'custom_only' | 'bagged' | 'saved';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'price_low_high', label: 'Price ↑' },
  { key: 'price_high_low', label: 'Price ↓' },
];

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In stock' },
  { key: 'custom_only', label: 'Custom-ready' },
  { key: 'bagged', label: 'In bag' },
  { key: 'saved', label: 'Saved' },
];

const toApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim().length > 0) return error;

  const err = error as {
    message?: string;
    response?: {
      data?: {
        message?: string | string[];
      };
    };
  };

  const responseMessage = err?.response?.data?.message;
  if (Array.isArray(responseMessage)) {
    const joined = responseMessage.filter(Boolean).join(', ').trim();
    if (joined.length > 0) return joined;
  }

  if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) {
    return responseMessage;
  }

  if (
    typeof err?.message === 'string' &&
    err.message.trim().length > 0 &&
    !/axioserror|network error|request failed|status code/i.test(err.message)
  ) {
    return err.message;
  }

  return fallback;
};

const getTotalStock = (product: Pick<StoreProduct, 'stock' | 'variants'>) => {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
  }
  return Number(product.stock || 0);
};

const normalizeVariantPool = (
  variants: StoreProductVariant[],
  selectedSize: string | null,
  selectedColor: string | null,
) => {
  const inStock = variants.filter((variant) => Number(variant.stock || 0) > 0);
  return inStock.filter((variant) => {
    if (selectedSize && variant.size && variant.size !== selectedSize) return false;
    if (selectedColor && variant.color && variant.color !== selectedColor) return false;
    return true;
  });
};

const formatPrice = (amount: number, currency = 'NGN'): string => {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString()}`;
  }
};

const getBagPulseStatus = (args: {
  busy?: boolean;
  disabled?: boolean;
  standardBagged?: boolean;
  customBagged?: boolean;
}): BagPulseStatus => {
  if (args.disabled) return 'disabled';
  if (args.busy) return 'bagging';
  if (args.standardBagged || args.customBagged) return 'currently_bagged';
  return 'not_bagged';
};

function ProductCard({
  product,
  width,
  primary,
  wishlisted,
  standardBagged,
  customBagged,
  busy,
  pulseStatus,
  onPress,
}: {
  product: StoreProduct;
  width: number;
  primary: string;
  wishlisted: boolean;
  standardBagged: boolean;
  customBagged: boolean;
  busy: boolean;
  pulseStatus: BagPulseStatus;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const stock = getTotalStock(product);
  const isOutOfStock = stock <= 0;
  const hasDiscount =
    typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;

  return (
    <CatalogCardSurface
      width={width}
      onPress={onPress}
      mediaSrc={product.coverImage}
      mediaFileId={product.coverImageId}
      style={[
        styles.productCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      bodyStyle={styles.productInfo}
      fallback={
        <View
          style={[
            styles.imageFallback,
            { backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <AppText variant="h1">🛍️</AppText>
        </View>
      }
      topOverlay={
        <View style={styles.cardTopOverlay}>
          <View style={styles.topBadgeRow}>
            {isOutOfStock ? (
              <View style={[styles.outOfStockBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                <AppText variant="captionBold" tone="danger">Out of stock</AppText>
              </View>
            ) : null}

            {hasDiscount ? (
              <View style={[styles.saleBadge, { backgroundColor: primary }]}>
                <AppText variant="captionBold" tone="inverse">
                  -
                  {Math.round(
                    (1 - product.price / Number(product.compareAtPrice || product.price || 1)) * 100,
                  )}
                  %
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.cardBagAffordance}>
            <BagPulseIcon
              status={pulseStatus}
              context="multi"
              mode={customBagged && !standardBagged ? 'custom' : 'standard'}
              size={36}
            />
          </View>
        </View>
      }
    >
      <AppText variant="captionBold" numberOfLines={2}>
        {product.name}
      </AppText>

      <View style={styles.priceRow}>
        <AppText variant="captionBold" tone="primary">
          {formatPrice(product.price, product.currency)}
        </AppText>
        {hasDiscount ? (
          <AppText variant="caption" tone="muted" style={styles.comparePrice}>
            {formatPrice(Number(product.compareAtPrice), product.currency)}
          </AppText>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        {wishlisted ? <AppText variant="captionBold" tone="muted">🧵 Saved</AppText> : null}
        {standardBagged ? <AppText variant="captionBold" tone="muted">🛍️ In bag</AppText> : null}
        {customBagged ? <AppText variant="captionBold" tone="muted">✂️ Custom bagged</AppText> : null}
        {product.customOrderEnabled ? <AppText variant="captionBold" tone="muted">✂️ Custom-ready</AppText> : null}
      </View>
    </CatalogCardSurface>
  );
}

function RailChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.railChip,
        { borderBottomColor: selected ? theme.colors.primary : 'transparent' },
        pressed && { opacity: 0.72 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <AppText variant={selected ? 'captionBold' : 'captionRegular'} tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface BrandShopTabProps {
  brandId?: string;
  isOwner?: boolean;
  containerWidth: number;
  initialProductId?: string | null;
  headerComponent?: React.ReactNode;
  scrollEnabled?: boolean;
}

export function BrandShopTab({
  brandId,
  isOwner = false,
  containerWidth,
  initialProductId,
  headerComponent,
  scrollEnabled = false,
}: BrandShopTabProps) {
  const { scheme, theme } = useTheme();
  const { status, user } = useAuth();
  const requireAuth = useAuthAction();
  const toast = useToast();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [selectedSort, setSelectedSort] = useState<SortKey>('newest');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('all');
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  const [wishlistByProductId, setWishlistByProductId] = useState<Record<string, true>>({});
  const [cartByProductId, setCartByProductId] = useState<Record<string, string>>({});
  const [customBagByProductId, setCustomBagByProductId] = useState<Record<string, string>>({});
  const [busyByProductId, setBusyByProductId] = useState<Record<string, boolean>>({});
  const { prepareBag, loadingByProductId, getPulseStatus, bagProduct, beginCustomFlow } = useProductBagging();

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeProduct, setActiveProduct] = useState<StoreProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const openedInitialProductIdRef = useRef<string | null>(null);

  const CARD_GAP = 10;
  const SIDE_PADDING = 16;
  const cardWidth = (containerWidth - SIDE_PADDING * 2 - CARD_GAP) / 2;

  const setBusy = useCallback((productId: string, busy: boolean) => {
    setBusyByProductId((prev) => {
      const next = { ...prev };
      if (busy) {
        next[productId] = true;
      } else {
        delete next[productId];
      }
      return next;
    });
  }, []);

  const refreshCommerceState = useCallback(async () => {
    if (status !== 'authenticated' || isOwner) {
      setWishlistByProductId({});
      setCartByProductId({});
      setCustomBagByProductId({});
      return;
    }

    const [wishlistRes, cartRes, customBagRes] = await Promise.allSettled([
      MobileStoreApi.getWishlist(),
      MobileStoreApi.getCart(),
      MobileStoreApi.listCustomBag(),
    ]);

    if (wishlistRes.status === 'fulfilled') {
      const next = wishlistRes.value.items.reduce<Record<string, true>>((acc, item) => {
        acc[item.productId] = true;
        return acc;
      }, {});
      setWishlistByProductId(next);
    }

    if (cartRes.status === 'fulfilled') {
      const next = cartRes.value.items.reduce<Record<string, string>>((acc, item) => {
        acc[item.productId] = item.id;
        return acc;
      }, {});
      setCartByProductId(next);
    }

    if (customBagRes.status === 'fulfilled') {
      const next = customBagRes.value.items.reduce<Record<string, string>>((acc, item) => {
        if (item.sourceType === 'PRODUCT') {
          acc[item.sourceId] = item.sessionId;
        }
        return acc;
      }, {});
      setCustomBagByProductId(next);
    }
  }, [isOwner, status]);

  const fetchProducts = useCallback(async () => {
    if (!brandId) {
      setProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    try {
      const items = await MobileStoreApi.getBrandProducts(brandId, 80);
      setProducts(items);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load products right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [brandId]);

  useEffect(() => {
    setLoading(true);
    void fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    void refreshCommerceState();
  }, [refreshCommerceState]);

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        products
          .map((product) => product.categoryName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );

    categories.sort((a, b) => a.localeCompare(b));
    return ['all', ...categories];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const working = products.filter((product) => {
      const stock = getTotalStock(product);
      const saved = Boolean(wishlistByProductId[product.id]);
      const standardBagged = Boolean(cartByProductId[product.id]);
      const customBagged = Boolean(customBagByProductId[product.id]);

      if (selectedCategory !== 'all') {
        const categoryName = product.categoryName?.trim() || '';
        if (categoryName !== selectedCategory) return false;
      }

      if (normalizedQuery) {
        const haystack = [product.name, product.categoryName, product.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      if (selectedFilter === 'in_stock' && stock <= 0) return false;
      if (selectedFilter === 'custom_only' && !product.customOrderEnabled) return false;
      if (selectedFilter === 'bagged' && !standardBagged && !customBagged) return false;
      if (selectedFilter === 'saved' && !saved) return false;

      return true;
    });

    working.sort((a, b) => {
      if (selectedSort === 'price_low_high') {
        return a.price - b.price;
      }
      if (selectedSort === 'price_high_low') {
        return b.price - a.price;
      }

      const aTs = Date.parse(a.createdAt ?? '') || 0;
      const bTs = Date.parse(b.createdAt ?? '') || 0;
      return bTs - aTs;
    });

    return working;
  }, [
    cartByProductId,
    customBagByProductId,
    products,
    query,
    selectedCategory,
    selectedFilter,
    selectedSort,
    wishlistByProductId,
  ]);

  const activeStock = getTotalStock(activeProduct || { stock: 0, variants: [] });
  const activeProductImageUri = useResolvedImageUri({
    src: activeProduct?.coverImage,
    fileId: activeProduct?.coverImageId,
    enabled: Boolean(activeProduct?.coverImage || activeProduct?.coverImageId),
  });

  const availableSizes = useMemo(() => {
    if (!activeProduct) return [];
    if (!activeProduct.variants.length) return activeProduct.sizes;

    const pool = normalizeVariantPool(activeProduct.variants, null, selectedColor);
    const values = Array.from(
      new Set(pool.map((variant) => variant.size).filter((value): value is string => Boolean(value))),
    );
    return values.length > 0 ? values : activeProduct.sizes;
  }, [activeProduct, selectedColor]);

  const availableColors = useMemo(() => {
    if (!activeProduct) return [];
    if (!activeProduct.variants.length) return activeProduct.colors;

    const pool = normalizeVariantPool(activeProduct.variants, selectedSize, null);
    const values = Array.from(
      new Set(pool.map((variant) => variant.color).filter((value): value is string => Boolean(value))),
    );
    return values.length > 0 ? values : activeProduct.colors;
  }, [activeProduct, selectedSize]);

  useEffect(() => {
    if (!selectedSize) return;
    if (!availableSizes.includes(selectedSize)) {
      setSelectedSize(null);
    }
  }, [availableSizes, selectedSize]);

  useEffect(() => {
    if (!selectedColor) return;
    if (!availableColors.includes(selectedColor)) {
      setSelectedColor(null);
    }
  }, [availableColors, selectedColor]);

  const openProductDetail = useCallback(
    async (product: StoreProduct) => {
      setDetailVisible(true);
      setDetailLoading(true);
      setActiveProduct(product);

      try {
        const [detail] = await Promise.all([
          MobileStoreApi.getProductById(product.id),
          status === 'authenticated' && !isOwner ? prepareBag(product.id).catch(() => null) : Promise.resolve(null),
        ]);
        setActiveProduct(detail);
      } catch {
        // Keep card payload as fallback.
      } finally {
        setDetailLoading(false);
      }
    },
    [isOwner, prepareBag, status],
  );

  useEffect(() => {
    if (!activeProduct) return;

    if (activeProduct.sizes.length > 0) {
      setSelectedSize(activeProduct.sizes[0]);
    } else {
      setSelectedSize(null);
    }

    if (activeProduct.colors.length > 0) {
      setSelectedColor(activeProduct.colors[0]);
    } else {
      setSelectedColor(null);
    }
  }, [activeProduct?.id]);

  const closeProductDetail = useCallback(() => {
    setDetailVisible(false);
    setDetailLoading(false);
    setActiveProduct(null);
    setSelectedSize(null);
    setSelectedColor(null);
  }, []);

  useEffect(() => {
    if (!initialProductId || openedInitialProductIdRef.current === initialProductId) {
      return;
    }

    const matchingProduct = products.find((product) => product.id === initialProductId);
    if (matchingProduct) {
      openedInitialProductIdRef.current = initialProductId;
      void openProductDetail(matchingProduct);
      return;
    }

    if (!brandId || loading) {
      return;
    }

    let cancelled = false;
    openedInitialProductIdRef.current = initialProductId;

    void MobileStoreApi.getProductById(initialProductId)
      .then((product) => {
        if (cancelled) return;
        void openProductDetail(product);
      })
      .catch(() => {
        if (!cancelled) {
          openedInitialProductIdRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, initialProductId, loading, openProductDetail, products]);

  const ensureAuth = useCallback(
    (action: () => Promise<void>, message: string) => {
      requireAuth(() => {
        void action();
      }, { message });
    },
    [requireAuth],
  );

  const toggleWishlist = useCallback(() => {
    if (!activeProduct) return;
    if (isOwner) {
      toast.info('Owner view does not support wishlist actions on your own products.');
      return;
    }

    ensureAuth(async () => {
      const productId = activeProduct.id;
      const alreadySaved = Boolean(wishlistByProductId[productId]);
      setBusy(productId, true);
      try {
        if (alreadySaved) {
          await MobileStoreApi.removeFromWishlist(productId);
          toast.success('Removed from wishlist.');
        } else {
          await MobileStoreApi.addToWishlist(productId);
          toast.success('Added to wishlist.');
        }
        await refreshCommerceState();
      } catch (error) {
        toast.error(toApiErrorMessage(error, 'Unable to update wishlist right now.'));
      } finally {
        setBusy(productId, false);
      }
    }, 'Sign in to use wishlist.');
  }, [activeProduct, ensureAuth, isOwner, refreshCommerceState, setBusy, toast, wishlistByProductId]);

  const toggleStandardBag = useCallback(() => {
    if (!activeProduct) return;
    if (isOwner) {
      toast.info('Owner view does not support bagging your own products.');
      return;
    }

    const productId = activeProduct.id;
    setBusy(productId, true);

    void (async () => {
      try {
        await bagProduct({
          id: productId,
          name: activeProduct.name,
        });
        await refreshCommerceState();
      } catch (error) {
        toast.error(toApiErrorMessage(error, 'Unable to update bag right now.'));
      } finally {
        setBusy(productId, false);
      }
    })();
  }, [
    activeProduct,
    bagProduct,
    isOwner,
    refreshCommerceState,
    setBusy,
    toast,
  ]);

  const toggleCustomBag = useCallback(() => {
    if (!activeProduct) return;
    if (isOwner) {
      toast.info('Owner view does not support custom bag actions on your own products.');
      return;
    }

    const productId = activeProduct.id;
    setBusy(productId, true);

    void (async () => {
      try {
        await beginCustomFlow({ id: productId, name: activeProduct.name });
        await refreshCommerceState();
      } catch (error) {
        toast.error(toApiErrorMessage(error, 'Unable to update custom bag right now.'));
      } finally {
        setBusy(productId, false);
      }
    })();
  }, [
    activeProduct,
    beginCustomFlow,
    isOwner,
    refreshCommerceState,
    setBusy,
    toast,
  ]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProducts(), refreshCommerceState()]);
    setRefreshing(false);
  }, [fetchProducts, refreshCommerceState]);

  if (loading) {
    return (
      <View style={styles.shopSkeleton}>
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((item) => (
            <SkeletonProductCard key={item} />
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyState}>
        <AppText variant="display">⚠️</AppText>
        <AppText variant="subtitle" style={styles.emptyTitle}>Could not load products</AppText>
        <AppText variant="body" tone="muted" style={styles.emptyBody}>{error}</AppText>
        <Pressable
          onPress={() => {
            setLoading(true);
            void fetchProducts();
          }}
          style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}
        >
          <AppText variant="bodyBold" tone="inverse">Retry</AppText>
        </Pressable>
      </View>
    );
  }

  const listHeader = (
    <>
      {headerComponent}
      <View style={styles.controlPanel}>
        <Input
          label="Search products or categories"
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder="Search products or categories"
          leading={<AppText variant="caption">🔍</AppText>}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <RailChip
            label={selectedCategory === 'all' ? 'All categories' : selectedCategory}
            selected={selectedCategory !== 'all'}
            onPress={() => setCategorySheetOpen(true)}
          />
          {categoryOptions.slice(0, 5).map((category) => {
            const selected = selectedCategory === category;
            const label = category === 'all' ? 'All' : category;
            return (
              <RailChip
                key={`cat-${category}`}
                label={label}
                selected={selected}
                onPress={() => setSelectedCategory(category)}
              />
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SORT_OPTIONS.map((option) => {
            const selected = selectedSort === option.key;
            return (
              <RailChip
                key={option.key}
                label={option.label}
                selected={selected}
                onPress={() => setSelectedSort(option.key)}
              />
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTER_OPTIONS.map((option) => {
            const selected = selectedFilter === option.key;
            return (
              <RailChip
                key={option.key}
                label={option.label}
                selected={selected}
                onPress={() => setSelectedFilter(option.key)}
              />
            );
          })}
        </ScrollView>
      </View>
    </>
  );

  return (
    <View style={styles.shopRoot}>
      {filteredProducts.length === 0 ? listHeader : null}

      {filteredProducts.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="display">🧵</AppText>
          <AppText variant="subtitle" style={styles.emptyTitle}>No products match this view</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>Try a different filter or search phrase.</AppText>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={scrollEnabled}
          ListHeaderComponent={listHeader}
          columnWrapperStyle={{ gap: CARD_GAP }}
          contentContainerStyle={[styles.gridContainer, { paddingHorizontal: SIDE_PADDING, paddingBottom: 110 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              width={cardWidth}
              primary={theme.colors.primary}
              wishlisted={Boolean(wishlistByProductId[item.id])}
              standardBagged={Boolean(cartByProductId[item.id])}
              customBagged={Boolean(customBagByProductId[item.id])}
              busy={Boolean(busyByProductId[item.id] || loadingByProductId[item.id])}
              pulseStatus={getPulseStatus(item.id, getTotalStock(item) <= 0 && !item.customOrderEnabled)}
              onPress={() => {
                void openProductDetail(item);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
        />
      )}

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={closeProductDetail}
      >
        <View style={styles.modalRoot}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]} onPress={closeProductDetail} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />

            {detailLoading || !activeProduct ? (
              <LoaderBlock message="Loading product options" minHeight={240} style={styles.modalLoadingWrap} />
            ) : (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.modalImageWrap}>
                  {activeProductImageUri ? (
                    <StableImage
                      uri={activeProductImageUri}
                      containerStyle={styles.modalImage}
                      imageStyle={styles.modalImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.imageFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <AppText variant="h1">🛍️</AppText>
                    </View>
                  )}
                </View>

                <AppText variant="title">{activeProduct.name}</AppText>
                <AppText variant="subtitle" tone="primary">
                  {formatPrice(activeProduct.price, activeProduct.currency)}
                </AppText>

                {activeProduct.description ? (
                  <AppText variant="body" tone="muted" style={styles.modalDescription}> 
                    {activeProduct.description}
                  </AppText>
                ) : null}

                <View style={styles.modalMetaRow}>
                  {activeProduct.categoryName ? (
                    <View style={[styles.metaPill, { borderColor: theme.colors.border }]}> 
                      <AppText variant="captionRegular" tone="muted" style={styles.metaPillText}>
                        🏷️ {activeProduct.categoryName}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={[styles.metaPill, { borderColor: theme.colors.border }]}> 
                    <AppText variant="captionRegular" tone="muted" style={styles.metaPillText}> 
                      {activeStock > 0 ? `📦 ${activeStock} in stock` : '⚠️ Out of stock'}
                    </AppText>
                  </View>
                </View>

                {availableSizes.length > 0 ? (
                  <View style={styles.selectorBlock}>
                    <AppText variant="bodyBold">Size</AppText>
                    <View style={styles.selectorWrap}>
                      {availableSizes.map((size) => {
                        const selected = selectedSize === size;
                        return (
                          <Chip
                            key={size}
                            label={size}
                            selected={selected}
                            onPress={() => setSelectedSize(size)}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {availableColors.length > 0 ? (
                  <View style={styles.selectorBlock}>
                    <AppText variant="bodyBold">Color</AppText>
                    <View style={styles.selectorWrap}>
                      {availableColors.map((color) => {
                        const selected = selectedColor === color;
                        return (
                          <Chip
                            key={color}
                            label={color}
                            swatchColor={color}
                            selected={selected}
                            onPress={() => setSelectedColor(color)}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {isOwner ? (
                  <View style={[styles.ownerHintCard, { borderColor: theme.colors.border }]}> 
                    <AppText variant="bodyBold">👑 Owner view</AppText>
                    <AppText variant="small" tone="muted" style={styles.ownerHintBody}> 
                      Wishlist and bag actions are disabled for your own products to match buyer behavior.
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.actionStack}>
                    <Pressable
                      onPress={toggleWishlist}
                      disabled={Boolean(busyByProductId[activeProduct.id])}
                      style={[
                        styles.actionButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          opacity: busyByProductId[activeProduct.id] ? 0.7 : 1,
                        },
                      ]}
                    >
                      <AppText variant="bodyBold" tone="secondary" style={styles.actionButtonText}>
                        {wishlistByProductId[activeProduct.id] ? '🧵 Saved • Tap to unsave' : '🧵 Save to wishlist'}
                      </AppText>
                    </Pressable>

                    <Pressable
                      onPress={toggleStandardBag}
                      disabled={Boolean(busyByProductId[activeProduct.id])}
                      style={[
                        styles.actionButton,
                        {
                          borderColor: theme.colors.primary,
                          backgroundColor: theme.colors.primarySoft,
                          opacity: busyByProductId[activeProduct.id] ? 0.7 : 1,
                        },
                      ]}
                    >
                      <BagPulseIcon
                        status={getPulseStatus(activeProduct.id, activeStock <= 0)}
                        context="single"
                        size={34}
                      />
                      <AppText variant="bodyBold" tone="primary" style={styles.actionButtonText}>
                        {cartByProductId[activeProduct.id] ? '🛍️ In bag • Tap to unbag' : '🛍️ Bag this item'}
                      </AppText>
                    </Pressable>

                    {activeProduct.customOrderEnabled ? (
                      <Pressable
                        onPress={toggleCustomBag}
                        disabled={Boolean(busyByProductId[activeProduct.id])}
                        style={[
                          styles.actionButton,
                          {
                            borderColor: theme.colors.primaryDark,
                            backgroundColor: theme.colors.primarySoft,
                            opacity: busyByProductId[activeProduct.id] ? 0.7 : 1,
                          },
                        ]}
                      >
                        <BagPulseIcon
                          status={getPulseStatus(activeProduct.id, false)}
                          context="single"
                          mode="custom"
                          size={34}
                        />
                        <AppText variant="bodyBold" tone="primary" style={styles.actionButtonText}>
                          {customBagByProductId[activeProduct.id]
                            ? '✂️ Custom bagged • Tap to remove'
                            : '✂️ Bag as custom request'}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <AppSelectSheet
        visible={categorySheetOpen}
        title="Categories"
        subtitle="Filter products instantly by category."
        options={categoryOptions.map((category) => ({
          value: category,
          label: category === 'all' ? 'All categories' : category,
        }))}
        value={selectedCategory}
        onChange={setSelectedCategory}
        onClose={() => setCategorySheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shopRoot: {
    flex: 1,
  },
  shopSkeleton: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: 90,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  controlPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 6,
    gap: 8,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  searchBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipRow: {
    gap: tokens.spacing.md,
    paddingRight: 4,
  },
  railChip: {
    minHeight: 34,
    maxWidth: 180,
    paddingHorizontal: tokens.spacing.xs,
    paddingTop: tokens.spacing.xs,
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gridContainer: {
    paddingTop: 14,
  },
  productCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackEmoji: {
    fontSize: 34,
    opacity: 0.6,
  },
  topBadgeRow: {
    gap: 5,
  },
  cardTopOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardBagAffordance: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saleBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  productInfo: {
    padding: 10,
    gap: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  comparePrice: {
    textDecorationLine: 'line-through',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  loadingWrap: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    paddingHorizontal: 28,
    paddingVertical: 56,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 8,
  },
  modalHandle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalLoadingWrap: {
    paddingVertical: 44,
    alignItems: 'center',
    gap: 10,
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 12,
  },
  modalImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalPrice: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  modalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectorBlock: {
    gap: 8,
  },
  selectorTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ownerHintCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  ownerHintTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  ownerHintBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  actionStack: {
    gap: 10,
    marginTop: 2,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionButtonText: {
    textAlign: 'center',
  },
});

export default BrandShopTab;
