import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';
import { useQueryClient } from '@tanstack/react-query';

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
import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import { SkeletonProductCard } from '@/components/ui/Skeleton';
import { AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Button } from '@/components/ui/Button';
import { BagPulseIcon, type BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useProductBagging } from '@/src/hooks/useProductBagging';
import { BAG_IT_EMOJI, BAG_IT_LABEL } from '@/src/constants/bagging';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { WIEZ_QUERY_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { brandShopDevLog, brandShopDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

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
  { key: 'saved', label: 'Wishlist' },
];

const EMPTY_PRODUCTS: StoreProduct[] = [];

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
  wishlisted,
  standardBagged,
  customBagged,
  busy,
  pulseStatus,
  onPress,
}: {
  product: StoreProduct;
  width: number;
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
  const discountLabel = hasDiscount
    ? `-${Math.round((1 - product.price / Number(product.compareAtPrice || product.price || 1)) * 100)}%`
    : null;
  const typeLabel = isOutOfStock
    ? 'Out'
    : discountLabel ?? (product.customOrderEnabled ? 'Custom' : 'Product');
  const metaLabel = product.categoryName ?? (product.customOrderEnabled ? 'Custom-ready' : 'Ready to wear');

  return (
    <UnifiedProductCard
      width={width}
      onPress={onPress}
      title={product.name}
      brandName={metaLabel}
      priceLabel={formatPrice(product.price, product.currency)}
      mediaSrc={product.coverImage}
      mediaFileId={product.coverImageId}
      allowSignedFallback={false}
      typeLabel={typeLabel}
      metaLabel={wishlisted ? 'Wishlist' : metaLabel}
      actionLabel="View"
      actionBusy={busy}
      onActionPress={onPress}
      topRightSlot={
        <View style={[styles.cardBagAffordance, { backgroundColor: theme.colors.backdropStrong, borderColor: theme.colors.glassBorder }]}>
          <BagPulseIcon
            status={pulseStatus}
            context="multi"
            mode={customBagged && !standardBagged ? 'custom' : 'standard'}
            size={34}
          />
        </View>
      }
    />
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

function SelectorTrigger({
  icon,
  label,
  value,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        styles.selectorTrigger,
        {
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceAlt,
        },
        pressed && { opacity: 0.78 },
      ]}
    >
      <AppText variant="captionRegular" tone="muted">{icon}</AppText>
      <AppText
        variant="captionBold"
        tone={active ? 'primary' : 'secondary'}
        numberOfLines={1}
        style={styles.selectorTriggerLabel}
      >
        {label}: {value}
      </AppText>
      <AppText variant="captionRegular" tone="muted">▾</AppText>
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
  enabled?: boolean;
}

export function BrandShopTab({
  brandId,
  isOwner = false,
  containerWidth,
  initialProductId,
  headerComponent,
  scrollEnabled = false,
  enabled = true,
}: BrandShopTabProps) {
  const { scheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const modalBottomGap = Platform.OS === 'android' ? Math.max(0, insets.bottom) : 0;
  const { status, user } = useAuth();
  const { standardScreenBottomPadding } = useScreenChrome();
  const requireAuth = useAuthAction();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [selectedSort, setSelectedSort] = useState<SortKey>('newest');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('all');
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const [wishlistByProductId, setWishlistByProductId] = useState<Record<string, true>>({});
  const [cartByProductId, setCartByProductId] = useState<Record<string, string>>({});
  const [customBagByProductId, setCustomBagByProductId] = useState<Record<string, string>>({});
  const [busyByProductId, setBusyByProductId] = useState<Record<string, boolean>>({});
  const { loadingByProductId, getPulseStatus, bagProduct, beginCustomFlow } = useProductBagging();

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeProduct, setActiveProduct] = useState<StoreProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  useAndroidOverlaySystemBars(detailVisible, scheme, 'brand-shop-detail');

  const openedInitialProductIdRef = useRef<string | null>(null);
  const normalizedBrandId = useMemo(() => {
    const value = String(brandId ?? '').trim();
    return value.length > 0 ? value : null;
  }, [brandId]);
  const brandIdIssue = normalizedBrandId
    ? null
    : 'No active brand ID is available for this store view. Switch to a brand workspace or sign in again.';
  const brandProductsQueryKey = useMemo(
    () => queryKeys.store.brandProducts(normalizedBrandId, { limit: 80 }),
    [normalizedBrandId],
  );
  const cachedBrandProducts = normalizedBrandId
    ? queryClient.getQueryData<StoreProduct[]>(brandProductsQueryKey)
    : undefined;
  const hasCachedBrandProducts = cachedBrandProducts !== undefined;
  const displayProducts = products.length > 0 ? products : cachedBrandProducts ?? EMPTY_PRODUCTS;

  const CARD_GAP = 10;
  const SIDE_PADDING = 16;
  const cardWidth = (containerWidth - SIDE_PADDING * 2 - CARD_GAP) / 2;
  const gridBottomPadding = scrollEnabled
    ? standardScreenBottomPadding + tokens.spacing.xl
    : tokens.spacing.xl;

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

  const fetchProducts = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!normalizedBrandId) {
      brandShopDevWarn('missing-brand-id', {
        isOwner,
        userId: user?.id ?? null,
        activeBrandId: user?.activeBrandId ?? null,
        storeId: user?.storeId ?? null,
        activeMembershipCount: user?.brandMemberships?.filter((membership) => membership.status === 'ACTIVE').length ?? 0,
      });
      setProducts([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    const forceRefresh = options?.forceRefresh === true;
    if (forceRefresh) {
      queryClient.removeQueries({ queryKey: brandProductsQueryKey, exact: true });
    } else {
      const cached = queryClient.getQueryData<StoreProduct[]>(brandProductsQueryKey);
      if (cached) {
        setProducts(cached);
        setLoading(false);
      }
    }

    setError(null);
    try {
      brandShopDevLog('load-products', {
        brandId: normalizedBrandId,
        isOwner,
      });
      const items = await queryClient.fetchQuery({
        queryKey: brandProductsQueryKey,
        queryFn: () => MobileStoreApi.getBrandProducts(normalizedBrandId, 80),
        staleTime: WIEZ_QUERY_STALE_TIME_MS,
      });
      setProducts(items);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load products right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [brandProductsQueryKey, enabled, isOwner, normalizedBrandId, queryClient, user?.activeBrandId, user?.brandMemberships, user?.id, user?.storeId]);

  useEffect(() => {
    const cached = normalizedBrandId ? queryClient.getQueryData<StoreProduct[]>(brandProductsQueryKey) : undefined;
    if (!enabled) {
      if (cached !== undefined) {
        setProducts(cached);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoading(cached === undefined);
    void fetchProducts();
  }, [brandProductsQueryKey, enabled, fetchProducts, normalizedBrandId, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    void refreshCommerceState();
  }, [enabled, refreshCommerceState]);

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        displayProducts
          .map((product) => product.categoryName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );

    categories.sort((a, b) => a.localeCompare(b));
    return ['all', ...categories];
  }, [displayProducts]);

  const sizeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          displayProducts
            .flatMap((product) => product.sizes ?? [])
            .map((size) => size.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [displayProducts],
  );

  const colorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          displayProducts
            .flatMap((product) => product.colors ?? [])
            .map((color) => color.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [displayProducts],
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const working = displayProducts.filter((product) => {
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

      const min = parseFloat(priceMin);
      const max = parseFloat(priceMax);
      if (!Number.isNaN(min) && product.price < min) return false;
      if (!Number.isNaN(max) && product.price > max) return false;

      if (onSaleOnly) {
        const onSale =
          typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
        if (!onSale) return false;
      }

      if (selectedSizes.length > 0) {
        const productSizes = product.sizes ?? [];
        if (!productSizes.some((size) => selectedSizes.includes(size))) return false;
      }

      if (selectedColors.length > 0) {
        const productColors = product.colors ?? [];
        if (!productColors.some((color) => selectedColors.includes(color))) return false;
      }

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
    displayProducts,
    onSaleOnly,
    priceMax,
    priceMin,
    query,
    selectedCategory,
    selectedColors,
    selectedFilter,
    selectedSizes,
    selectedSort,
    wishlistByProductId,
  ]);

  const activeStock = getTotalStock(activeProduct || { stock: 0, variants: [] });
  const activeProductImageUri = useResolvedImageUri({
    src: activeProduct?.coverImage,
    fileId: activeProduct?.coverImageId,
    enabled: Boolean(activeProduct?.coverImage || activeProduct?.coverImageId),
    allowSignedFallback: false,
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
      drillDownPush({ pathname: '/products/[productId]', params: { productId: product.id } } as any);
    },
    [],
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

    const matchingProduct = displayProducts.find((product) => product.id === initialProductId);
    if (matchingProduct) {
      openedInitialProductIdRef.current = initialProductId;
      void openProductDetail(matchingProduct);
      return;
    }

    if (!normalizedBrandId || loading) {
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
  }, [displayProducts, initialProductId, loading, normalizedBrandId, openProductDetail]);

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
    if (!enabled) return;
    setRefreshing(true);
    await Promise.all([fetchProducts({ forceRefresh: true }), refreshCommerceState()]);
    setRefreshing(false);
  }, [enabled, fetchProducts, refreshCommerceState]);

  const activeFilterCount =
    (selectedFilter !== 'all' ? 1 : 0) +
    (priceMin.trim() ? 1 : 0) +
    (priceMax.trim() ? 1 : 0) +
    (onSaleOnly ? 1 : 0) +
    selectedSizes.length +
    selectedColors.length;

  const hasActiveProductFilters = Boolean(
    query.trim() ||
      selectedCategory !== 'all' ||
      activeFilterCount > 0,
  );

  const clearProductFilters = useCallback(() => {
    setQuery('');
    setSelectedCategory('all');
    setSelectedFilter('all');
    setSelectedSort('newest');
    setPriceMin('');
    setPriceMax('');
    setOnSaleOnly(false);
    setSelectedSizes([]);
    setSelectedColors([]);
  }, []);

  const renderEmptyState = (args: {
    marker: string;
    title: string;
    body: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <View style={styles.emptyState}>
      <AppText variant="display">{args.marker}</AppText>
      <AppText variant="subtitle" style={styles.emptyTitle}>{args.title}</AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>{args.body}</AppText>
      {args.actionLabel && args.onAction ? (
        <Pressable
          onPress={args.onAction}
          style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}
        >
          <AppText variant="bodyBold" tone="inverse">{args.actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );

  if (brandIdIssue) {
    return renderEmptyState({
      marker: '⚠️',
      title: 'Store identity missing',
      body: brandIdIssue,
    });
  }

  if (loading && !hasCachedBrandProducts) {
    return (
      <View style={[styles.shopSkeleton, { paddingBottom: gridBottomPadding }]}>
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((item) => (
            <SkeletonProductCard key={item} />
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return renderEmptyState({
      marker: '⚠️',
      title: 'Could not load products',
      body: error,
      actionLabel: 'Retry',
      onAction: () => {
        setLoading(true);
        void fetchProducts({ forceRefresh: true });
      },
    });
  }

  const activeSortLabel = SORT_OPTIONS.find((option) => option.key === selectedSort)?.label ?? 'Newest';

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

        <View style={styles.selectorRow}>
          <SelectorTrigger
            icon="↕"
            label="Sort"
            value={activeSortLabel}
            active={selectedSort !== 'newest'}
            onPress={() => setSortSheetOpen(true)}
          />
          <SelectorTrigger
            icon="⚙"
            label="Filter"
            value={activeFilterCount > 0 ? `${activeFilterCount} active` : 'All'}
            active={activeFilterCount > 0}
            onPress={() => setFilterSheetOpen(true)}
          />
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.shopRoot, !scrollEnabled && { flex: undefined }]}>
      {filteredProducts.length === 0 ? listHeader : null}

      {filteredProducts.length === 0 ? (
        renderEmptyState(
          displayProducts.length > 0
            ? {
                marker: '🧵',
                title: 'Filters hide all products',
                body: 'Products loaded for this brand, but the current search or filters hide them.',
                actionLabel: hasActiveProductFilters ? 'Clear filters' : undefined,
                onAction: hasActiveProductFilters ? clearProductFilters : undefined,
              }
            : {
                marker: BAG_IT_EMOJI,
                title: isOwner ? 'No products yet' : 'No products available',
                body: isOwner
                  ? 'This brand store has no products yet. Products created in Studio will appear here after the brand-products endpoint returns them.'
                  : 'This brand has not published any store products yet.',
              },
        )
      ) : scrollEnabled ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={true}
          ListHeaderComponent={listHeader}
          columnWrapperStyle={{ gap: CARD_GAP }}
          contentContainerStyle={[
            styles.gridContainer,
            { paddingHorizontal: SIDE_PADDING, paddingBottom: gridBottomPadding },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              width={cardWidth}
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
      ) : (
        // Embedded mode (scrollEnabled=false): the parent catalogue ScrollView is
        // the single scroll owner. A nested non-scroll ScrollView here collapsed /
        // measured unreliably, which clipped the lower product rows and made the
        // Shop tab feel scroll-locked. A plain View reports its true content height
        // to the pager's onLayout so every row scrolls fully above the bottom island.
        <View>
          {listHeader}
          <View
            style={[
              styles.gridContainer,
              { paddingHorizontal: SIDE_PADDING, paddingBottom: gridBottomPadding },
              { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, rowGap: CARD_GAP }
            ]}
          >
            {filteredProducts.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                width={cardWidth}
                wishlisted={Boolean(wishlistByProductId[item.id])}
                standardBagged={Boolean(cartByProductId[item.id])}
                customBagged={Boolean(customBagByProductId[item.id])}
                busy={Boolean(busyByProductId[item.id] || loadingByProductId[item.id])}
                pulseStatus={getPulseStatus(item.id, getTotalStock(item) <= 0 && !item.customOrderEnabled)}
                onPress={() => {
                  void openProductDetail(item);
                }}
              />
            ))}
          </View>
        </View>
      )}

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeProductDetail}
      >
        <View style={styles.modalRoot}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]} onPress={closeProductDetail} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginBottom: modalBottomGap }]}>
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
                      <AppText variant="h1">{BAG_IT_EMOJI}</AppText>
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
                        {wishlistByProductId[activeProduct.id] ? '🧵 In wishlist • Tap to remove' : '🧵 Save to wishlist'}
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
                        {cartByProductId[activeProduct.id]
                          ? `${BAG_IT_EMOJI} In bag • Tap to unbag`
                          : `${BAG_IT_EMOJI} ${BAG_IT_LABEL}`}
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
                            ? `${BAG_IT_EMOJI} Custom bagged • Tap to remove`
                            : `${BAG_IT_EMOJI} ${BAG_IT_LABEL} as custom request`}
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

      <AppSelectSheet
        visible={sortSheetOpen}
        title="Sort"
        subtitle="Choose how products are ordered."
        options={SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
        value={selectedSort}
        onChange={(value) => setSelectedSort(value as SortKey)}
        onClose={() => setSortSheetOpen(false)}
      />

      <AppBottomSheet
        visible={filterSheetOpen}
        title="Filter"
        subtitle="Refine by availability, price, size and colour."
        onClose={() => setFilterSheetOpen(false)}
        onDone={() => setFilterSheetOpen(false)}
        doneLabel="Done"
        footer={
          <Button
            title="Clear all filters"
            variant="secondary"
            onPress={clearProductFilters}
            disabled={!hasActiveProductFilters}
          />
        }
      >
        <View style={styles.filterSection}>
          <AppText variant="bodyBold">Availability</AppText>
          <View style={styles.filterChipWrap}>
            {/* "In bag" and "Wishlist" are buyer state. The owner of the shop
                has neither, and offering them reads as a shopping affordance on
                the seller's own store. */}
            {FILTER_OPTIONS.filter(
              (option) => !isOwner || (option.key !== 'bagged' && option.key !== 'saved'),
            ).map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={selectedFilter === option.key}
                onPress={() => setSelectedFilter(option.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterSection}>
          <AppText variant="bodyBold">Price range</AppText>
          <View style={styles.priceRow}>
            <Input
              label="Minimum price"
              hideLabel
              value={priceMin}
              onChangeText={(text) => setPriceMin(text.replace(/[^0-9]/g, ''))}
              placeholder="Min"
              keyboardType="number-pad"
              containerStyle={styles.priceInput}
            />
            <AppText variant="body" tone="muted">—</AppText>
            <Input
              label="Maximum price"
              hideLabel
              value={priceMax}
              onChangeText={(text) => setPriceMax(text.replace(/[^0-9]/g, ''))}
              placeholder="Max"
              keyboardType="number-pad"
              containerStyle={styles.priceInput}
            />
          </View>
        </View>

        <View style={styles.filterSection}>
          <AppText variant="bodyBold">Offers</AppText>
          <View style={styles.filterChipWrap}>
            <Chip label="On sale" selected={onSaleOnly} onPress={() => setOnSaleOnly((value) => !value)} />
          </View>
        </View>

        {sizeOptions.length > 0 ? (
          <View style={styles.filterSection}>
            <AppText variant="bodyBold">Sizes</AppText>
            <View style={styles.filterChipWrap}>
              {sizeOptions.map((size) => (
                <Chip
                  key={size}
                  label={size}
                  selected={selectedSizes.includes(size)}
                  onPress={() =>
                    setSelectedSizes((prev) =>
                      prev.includes(size) ? prev.filter((value) => value !== size) : [...prev, size],
                    )
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {colorOptions.length > 0 ? (
          <View style={styles.filterSection}>
            <AppText variant="bodyBold">Colours</AppText>
            <View style={styles.filterChipWrap}>
              {colorOptions.map((color) => (
                <Chip
                  key={color}
                  label={color}
                  swatchColor={color}
                  selected={selectedColors.includes(color)}
                  onPress={() =>
                    setSelectedColors((prev) =>
                      prev.includes(color) ? prev.filter((value) => value !== color) : [...prev, color],
                    )
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </AppBottomSheet>
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
  selectorRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: 2,
  },
  selectorTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorTriggerLabel: {
    flex: 1,
  },
  filterSection: {
    gap: tokens.spacing.sm,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  gridContainer: {
    paddingTop: 14,
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBagAffordance: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
    ...StyleSheet.absoluteFill,
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
