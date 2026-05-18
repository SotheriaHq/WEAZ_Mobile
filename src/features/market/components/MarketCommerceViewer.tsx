import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import ReviewsTab from '@/components/reviews/ReviewsTab';
import { StableImage } from '@/components/ui/StableImage';
import {
  MobileStoreApi,
  type BagSourceType,
  type ProductBagStatus,
  type StoreProduct,
} from '@/src/api/StoreApi';
import {
  brandApi,
  type CollectionDetailDto,
  type CollectionDetailMediaDto,
} from '@/src/api/BrandApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { BAG_IT_EMOJI, BAG_IT_LABEL } from '@/src/constants/bagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type CommerceSourceType = Extract<BagSourceType, 'PRODUCT' | 'DESIGN'>;

type ViewerMediaEntry = {
  id: string;
  url: string | null;
  fileId: string | null;
  label: string;
};

type MarketCommerceViewerProps = {
  sourceType: CommerceSourceType;
  sourceId: string;
  initialTitle?: string | null;
  initialBrandId?: string | null;
  initialBrandName?: string | null;
  initialPriceLabel?: string | null;
  fallbackHref?: string;
};

const EMPTY_MEDIA_ID = 'empty-media';
const ACTION_KIND_BAG = 'bag';
const ACTION_KIND_SAVE = 'save';
const ACTION_KIND_MESSAGE = 'message';
const ACTION_KIND_SHARE = 'share';

const shouldLogViewerTiming = () =>
  __DEV__ ||
  process.env.NODE_ENV === 'test' ||
  process.env.EXPO_PUBLIC_BAGGING_OBSERVABILITY === 'true';

const logViewerTiming = (event: string, startedAt: number, context: Record<string, unknown>) => {
  if (!shouldLogViewerTiming()) return;
  console.debug('[bagging:timing]', {
    event: `mobile.market_viewer.${event}.duration`,
    durationMs: Date.now() - startedAt,
    ...context,
  });
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatPrice = (amount?: number | null, currency = 'NGN') => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-NG')}`;
  }
};

const getProductPrice = (product: StoreProduct) =>
  product.effectivePrice ?? product.salePrice ?? product.price;

const getTotalStock = (product: Pick<StoreProduct, 'stock' | 'variants'>) => {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  }
  return Number(product.stock || 0);
};

const getOwnerName = (owner?: CollectionDetailDto['owner'] | null) => {
  if (!owner) return null;
  const name = [
    owner.brandFullName,
    owner.username,
    [owner.firstName, owner.lastName].filter(Boolean).join(' '),
  ].map(asString).find(Boolean);
  return name ?? null;
};

const getCollectionMediaDirectUrl = (media: CollectionDetailMediaDto) =>
  asString(media.url) ??
  asString(media.secureUrl) ??
  asString(media.s3Url) ??
  asString(media.previewUrl) ??
  asString(media.file?.secureUrl) ??
  asString(media.file?.s3Url) ??
  asString(media.file?.url);

const getCollectionMediaFileId = (media: CollectionDetailMediaDto) =>
  asString(media.fileId) ??
  asString(media.fileUploadId) ??
  asString(media.uploadFileId) ??
  asString(media.file?.fileId) ??
  asString(media.file?.id) ??
  asString(media.id);

const buildProductMedia = (product: StoreProduct): ViewerMediaEntry[] => {
  const entries: ViewerMediaEntry[] = [
    {
      id: `${product.id}:cover`,
      url: product.coverImage ?? null,
      fileId: product.coverImageId ?? null,
      label: product.name,
    },
    ...product.images.map((image, index) => ({
      id: `${product.id}:image:${image.fileId ?? image.url ?? index}`,
      url: image.url ?? null,
      fileId: image.fileId ?? null,
      label: `${product.name} ${index + 1}`,
    })),
  ];

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.url ?? ''}:${entry.fileId ?? ''}`;
    if ((!entry.url && !entry.fileId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildDesignMedia = (detail: CollectionDetailDto): ViewerMediaEntry[] => {
  const entries: ViewerMediaEntry[] = [
    {
      id: `${detail.id}:cover`,
      url: detail.coverImageUrl ?? null,
      fileId: detail.coverMediaId ?? null,
      label: detail.title,
    },
    ...(detail.medias ?? []).map((media, index) => ({
      id: `${detail.id}:media:${media.id ?? index}`,
      url: getCollectionMediaDirectUrl(media),
      fileId: getCollectionMediaFileId(media),
      label: media.caption ?? `${detail.title} ${index + 1}`,
    })),
  ];

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.url ?? ''}:${entry.fileId ?? ''}`;
    if ((!entry.url && !entry.fileId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function MediaSlide({
  item,
  width,
  height,
  sourceId,
  sourceType,
  index,
}: {
  item: ViewerMediaEntry;
  width: number;
  height: number;
  sourceId: string;
  sourceType: CommerceSourceType;
  index: number;
}) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const debugContext = useMemo(
    () => ({
      designId: sourceType === 'DESIGN' ? sourceId : undefined,
      productId: sourceType === 'PRODUCT' ? sourceId : undefined,
      fileId: item.fileId ?? undefined,
      mediaIndex: index,
    }),
    [index, item.fileId, sourceId, sourceType],
  );
  const { uri, loading } = useResolvedImageAsset({
    src: item.url,
    fileId: item.fileId,
    enabled: Boolean(item.url || item.fileId),
    debugContext,
  });

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const fallback = (
    <View style={[styles.mediaFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
      <AppText variant="display" tone="muted">{BAG_IT_EMOJI}</AppText>
      <AppText variant="captionBold" tone="muted">Preview unavailable</AppText>
    </View>
  );

  return (
    <View style={[styles.mediaPage, { width, height, backgroundColor: theme.colors.bg }]}>
      {loading && !uri ? (
        <View style={[styles.mediaFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="captionBold" tone="muted">Loading image</AppText>
        </View>
      ) : uri && !failed ? (
        <StableImage
          uri={uri}
          containerStyle={styles.mediaImage}
          imageStyle={styles.mediaImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
          fallback={fallback}
        />
      ) : (
        fallback
      )}
    </View>
  );
}

export function MarketCommerceViewer({
  sourceType,
  sourceId,
  initialTitle,
  initialBrandId,
  initialBrandName,
  initialPriceLabel,
  fallbackHref = '/(tabs)/discover',
}: MarketCommerceViewerProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { status: authStatus, user } = useAuth();
  const { width, height } = useWindowDimensions();
  const chrome = useScreenChrome();
  const mediaRef = useRef<FlatList<ViewerMediaEntry> | null>(null);
  const {
    bagProduct,
    bagSource,
    prepareBag,
    prepareSourceBag,
    loadingByProductId,
  } = useMobileBagging();

  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [design, setDesign] = useState<CollectionDetailDto | null>(null);
  const [bagStatus, setBagStatus] = useState<ProductBagStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const normalizedSourceId = String(sourceId ?? '').trim();
  const sourceStatusKey = sourceType === 'PRODUCT' ? normalizedSourceId : `${sourceType}:${normalizedSourceId}`;
  const bagBusy = Boolean(loadingByProductId[sourceStatusKey] || busyAction === ACTION_KIND_BAG);
  const activeSheetHeight = sheetExpanded
    ? Math.min(420, Math.max(320, Math.round(height * 0.48)))
    : 116;
  const mediaHeight = height;
  const actionBottom = activeSheetHeight + chrome.immersiveOverlayBottomClearance + tokens.spacing.md;

  const load = useCallback(async () => {
    if (!normalizedSourceId) {
      setError('This market item is missing an identifier.');
      setLoading(false);
      return;
    }

    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      if (sourceType === 'PRODUCT') {
        const [nextProduct, nextStatus] = await Promise.all([
          MobileStoreApi.getProductById(normalizedSourceId),
          prepareBag(normalizedSourceId).catch(() => null),
        ]);
        setProduct(nextProduct);
        setDesign(null);
        setSaved(Boolean(nextProduct.isWishlisted));
        setBagStatus(nextStatus);
        return;
      }

      const [nextDesign, nextStatus] = await Promise.all([
        brandApi.getCollectionDetail(normalizedSourceId, { scope: 'design' }),
        prepareSourceBag('DESIGN', normalizedSourceId).catch(() => null),
      ]);
      if (!nextDesign) {
        throw new Error('Design unavailable.');
      }
      setProduct(null);
      setDesign(nextDesign);
      setBagStatus(nextStatus);

      if (authStatus === 'authenticated') {
        const savedResult: Record<string, boolean> = await SavedItemsApi
          .checkBatch('COLLECTION', [normalizedSourceId])
          .catch(() => ({}));
        setSaved(Boolean(savedResult[normalizedSourceId]));
      } else {
        setSaved(false);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'This market item is unavailable.');
    } finally {
      setLoading(false);
      logViewerTiming('initial_load', startedAt, {
        sourceType,
        sourceId: normalizedSourceId,
      });
    }
  }, [authStatus, normalizedSourceId, prepareBag, prepareSourceBag, sourceType]);

  useEffect(() => {
    void load();
  }, [load]);

  const media = useMemo(() => {
    const entries = product ? buildProductMedia(product) : design ? buildDesignMedia(design) : [];
    return entries.length > 0
      ? entries
      : [{ id: EMPTY_MEDIA_ID, url: null, fileId: null, label: initialTitle ?? 'Market item' }];
  }, [design, initialTitle, product]);

  const title = product?.name ?? design?.title ?? initialTitle ?? 'Market item';
  const brandName =
    product?.brandName ??
    getOwnerName(design?.owner) ??
    initialBrandName ??
    'Threadly brand';
  const brandId = product?.brandId ?? initialBrandId ?? design?.owner?.id ?? null;
  const description = product?.description ?? design?.description ?? null;
  const productStock = product ? getTotalStock(product) : null;
  const priceLabel = product
    ? formatPrice(getProductPrice(product), product.currency)
    : initialPriceLabel ?? 'Custom quote';
  const canMessageBrand = Boolean(brandId);
  const isOwnBrand =
    Boolean(bagStatus?.userState.isOwner) ||
    Boolean(brandId && (user?.activeBrandId === brandId || user?.storeId === brandId));
  const disabledReason =
    bagStatus?.ui.disabledReason ??
    (isOwnBrand ? 'Owner view cannot bag or message this brand item.' : null);
  const bagDisabled = Boolean(
    loading ||
      bagBusy ||
      (bagStatus && bagStatus.ui.defaultAction === 'DISABLED') ||
      isOwnBrand,
  );
  const actionPriceLabel = priceLabel ? ` - ${priceLabel}` : '';
  const bagLabel = `${BAG_IT_EMOJI} ${BAG_IT_LABEL}${actionPriceLabel}`;

  const productOptions = useMemo(() => {
    if (!product) return [];
    const options: string[] = [];
    if (product.sizes.length > 0) options.push(`Sizes: ${product.sizes.join(', ')}`);
    if (product.colors.length > 0) options.push(`Colors: ${product.colors.join(', ')}`);
    if (product.categoryName) options.push(`Category: ${product.categoryName}`);
    if (product.tags && product.tags.length > 0) options.push(`Tags: ${product.tags.join(', ')}`);
    return options;
  }, [product]);

  const designOptions = useMemo(() => {
    if (!design) return [];
    const options: string[] = [];
    if (typeof design.itemCount === 'number') options.push(`${design.itemCount} item${design.itemCount === 1 ? '' : 's'}`);
    if (design.tags && design.tags.length > 0) options.push(`Tags: ${design.tags.join(', ')}`);
    if (design.isAvailableInStore) options.push('Available for custom request');
    return options;
  }, [design]);

  const stockLabel = product
    ? productStock && productStock > 0
      ? `${productStock} in stock`
      : product.customOrderEnabled
        ? 'Custom-order only'
        : 'Out of stock'
    : bagStatus?.custom.available || design?.isAvailableInStore
      ? 'Custom request available'
      : 'Custom request unavailable';
  const customLabel = bagStatus?.custom.available
    ? bagStatus.custom.freshnessState === 'STALE'
      ? 'Fittings need confirmation'
      : bagStatus.custom.fittingState === 'MISSING' || bagStatus.custom.fittingState === 'PARTIAL'
        ? 'Fittings needed'
        : 'Custom bagging ready'
    : sourceType === 'PRODUCT' && product?.customOrderEnabled
      ? 'Checking custom setup'
      : 'Custom bagging unavailable';

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as any);
  }, [fallbackHref]);

  const routePath = sourceType === 'PRODUCT'
    ? `/products/${normalizedSourceId}`
    : `/market-viewer?sourceType=DESIGN&sourceId=${normalizedSourceId}`;

  const requireAuth = useCallback((message: string) => {
    if (authStatus === 'authenticated') return true;
    toast.info(message);
    router.push({ pathname: '/(auth)/login', params: { next: routePath } } as any);
    return false;
  }, [authStatus, routePath, toast]);

  const handleBagPress = useCallback(async () => {
    if (!normalizedSourceId || bagDisabled) {
      if (disabledReason) toast.info(disabledReason);
      return;
    }

    const startedAt = Date.now();
    setBusyAction(ACTION_KIND_BAG);
    try {
      trackMobileEvent('bag_tapped', {
        sourceScreen: 'market_viewer',
        sourceType,
        sourceId: normalizedSourceId,
        productId: sourceType === 'PRODUCT' ? normalizedSourceId : null,
        designId: sourceType === 'DESIGN' ? normalizedSourceId : null,
        eligibilityState: bagStatus?.ui.defaultAction ?? null,
      });
      if (sourceType === 'DESIGN') {
        trackMobileEvent('custom_order_tapped', {
          sourceScreen: 'market_viewer',
          sourceType: 'DESIGN',
          sourceId: normalizedSourceId,
          brandId,
          eligibilityState: bagStatus?.ui.defaultAction ?? null,
        });
      }
      const result = sourceType === 'PRODUCT'
        ? await bagProduct({ id: normalizedSourceId, name: title })
        : await bagSource({
            sourceType: 'DESIGN',
            sourceId: normalizedSourceId,
            name: title,
          });
      if (result?.status) setBagStatus(result.status);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update your bag right now.');
    } finally {
      setBusyAction(null);
      logViewerTiming('bag_action', startedAt, {
        sourceType,
        sourceId: normalizedSourceId,
        defaultAction: bagStatus?.ui.defaultAction ?? null,
      });
    }
  }, [bagDisabled, bagProduct, bagSource, bagStatus?.ui.defaultAction, brandId, disabledReason, normalizedSourceId, sourceType, title, toast]);

  const handleSavePress = useCallback(async () => {
    if (!requireAuth('Sign in to save market items.')) return;
    if (!normalizedSourceId || busyAction === ACTION_KIND_SAVE) return;

    const wasSaved = saved;
    setSaved(!wasSaved);
    setBusyAction(ACTION_KIND_SAVE);
    try {
      if (sourceType === 'PRODUCT') {
        if (wasSaved) await MobileStoreApi.removeFromWishlist(normalizedSourceId);
        else await MobileStoreApi.addToWishlist(normalizedSourceId);
      } else if (wasSaved) {
        await SavedItemsApi.unsaveCatalogTarget({
          targetType: 'DESIGN',
          designId: normalizedSourceId,
          legacyCollectionId: normalizedSourceId,
        });
        trackMobileEvent('design_unsaved', {
          sourceScreen: 'market_viewer',
          targetType: 'DESIGN',
          targetId: normalizedSourceId,
          collectionId: normalizedSourceId,
          brandId,
        });
      } else {
        await SavedItemsApi.saveCatalogTarget({
          targetType: 'DESIGN',
          designId: normalizedSourceId,
          legacyCollectionId: normalizedSourceId,
        });
        trackMobileEvent('design_saved', {
          sourceScreen: 'market_viewer',
          targetType: 'DESIGN',
          targetId: normalizedSourceId,
          collectionId: normalizedSourceId,
          brandId,
        });
      }
      toast.success(
        sourceType === 'PRODUCT'
          ? wasSaved ? 'Removed from wishlist.' : 'Saved to wishlist.'
          : wasSaved ? 'Removed from Saved Looks.' : 'Saved to Saved Looks.',
      );
    } catch (nextError) {
      setSaved(wasSaved);
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update saved items.');
    } finally {
      setBusyAction(null);
    }
  }, [brandId, busyAction, normalizedSourceId, requireAuth, saved, sourceType, toast]);

  const handleMessagePress = useCallback(() => {
    if (!canMessageBrand || !brandId) {
      toast.info('Brand messaging is unavailable for this item.');
      return;
    }
    if (!requireAuth('Sign in to message this brand.')) return;
    if (isOwnBrand) {
      toast.info('Messaging is disabled for your own brand item.');
      return;
    }

    router.push({ pathname: '/messages/[threadId]', params: { threadId: 'brand', brandId } } as any);
  }, [brandId, canMessageBrand, isOwnBrand, requireAuth, toast]);

  const handleSharePress = useCallback(async () => {
    setBusyAction(ACTION_KIND_SHARE);
    try {
      await Share.share({
        title,
        message: `${title}\n${brandName}\n${routePath}`,
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to share this item.');
    } finally {
      setBusyAction(null);
    }
  }, [brandName, routePath, title, toast]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
  }, [media.length, width]);

  const renderMedia = useCallback(
    ({ item, index }: { item: ViewerMediaEntry; index: number }) => (
      <MediaSlide
        item={item}
        width={width}
        height={mediaHeight}
        sourceId={normalizedSourceId}
        sourceType={sourceType}
        index={index}
      />
    ),
    [mediaHeight, normalizedSourceId, sourceType, width],
  );

  const renderMetadataSheet = () => (
    <View
      style={[
        styles.metadataSheet,
        {
          height: activeSheetHeight,
          bottom: chrome.immersiveOverlayBottomClearance,
          backgroundColor: theme.colors.bottomSheetSurface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        onPress={() => setSheetExpanded((current) => !current)}
        style={styles.sheetHandleWrap}
        accessibilityRole="button"
        accessibilityLabel={sheetExpanded ? 'Collapse product details' : 'Expand product details'}
      >
        <View style={[styles.sheetHandle, { backgroundColor: theme.colors.bottomSheetHandle }]} />
        <AppText variant="captionBold" tone="muted">
          {sheetExpanded ? 'Collapse details for full view' : 'Swipe up for product details'}
        </AppText>
      </Pressable>

      {sheetExpanded ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
        >
          <View style={styles.sheetTitleRow}>
            <View style={styles.sheetTitleCopy}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                {brandName}
              </AppText>
              <AppText variant="title" numberOfLines={2}>
                {title}
              </AppText>
            </View>
            <View style={[styles.pricePill, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                {priceLabel ?? 'Quote'}
              </AppText>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={[styles.metaCell, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">Stock</AppText>
              <AppText variant="bodyBold" numberOfLines={2}>{stockLabel}</AppText>
            </View>
            <View style={[styles.metaCell, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">Bagging</AppText>
              <AppText variant="bodyBold" numberOfLines={2}>{customLabel}</AppText>
            </View>
          </View>

          {description ? (
            <View style={styles.detailBlock}>
              <AppText variant="bodyBold">Details</AppText>
              <AppText variant="body" tone="secondary">{description}</AppText>
            </View>
          ) : null}

          <View style={styles.detailBlock}>
            <AppText variant="bodyBold">Options</AppText>
            {[...productOptions, ...designOptions].length > 0 ? (
              [...productOptions, ...designOptions].map((option) => (
                <AppText key={option} variant="body" tone="secondary">{option}</AppText>
              ))
            ) : (
              <AppText variant="body" tone="muted">No size, color, or product option details are listed.</AppText>
            )}
          </View>

          <View style={styles.detailBlock}>
            <AppText variant="bodyBold">Fittings</AppText>
            <AppText variant="body" tone="secondary">
              {bagStatus
                ? `${bagStatus.custom.freshnessState} / ${bagStatus.custom.fittingState}`
                : 'Eligibility will be checked before bagging.'}
            </AppText>
            {disabledReason ? (
              <AppText variant="captionBold" tone="warning">{disabledReason}</AppText>
            ) : null}
          </View>

          {sourceType === 'PRODUCT' ? (
            <View style={styles.reviewSummaryWrap}>
              <ReviewsTab productId={normalizedSourceId} compact />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.collapsedSheetContent}>
          <View style={styles.collapsedCopy}>
            <AppText variant="captionBold" tone="primary" numberOfLines={1}>{brandName}</AppText>
            <AppText variant="bodyBold" numberOfLines={1}>{title}</AppText>
          </View>
          <AppText variant="captionBold" tone="secondary" numberOfLines={1}>
            {priceLabel ?? stockLabel}
          </AppText>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <FlatList
        ref={mediaRef}
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderMedia}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollToIndexFailed={() => undefined}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        scrollEnabled={media.length > 1}
      />

      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.backdropStrong, theme.colors.backdrop, 'transparent']}
        style={[styles.topGradient, { height: Math.max(150, chrome.insets.top + 112) }]}
      />

      <View style={[styles.topControls, { top: chrome.insets.top + tokens.spacing.md }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <AppText variant="subtitle" tone="default">{String.fromCodePoint(0x2039)}</AppText>
        </Pressable>

        <Pressable
          onPress={handleSharePress}
          disabled={busyAction === ACTION_KIND_SHARE}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <AppText variant="subtitle" tone="default">{String.fromCodePoint(0x2197)}</AppText>
        </Pressable>
      </View>

      {media.length > 1 ? (
        <View style={[styles.paginationPill, { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder }]}>
          <AppText variant="captionBold" tone="default">
            {activeIndex + 1} / {media.length}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.actionCluster, { bottom: actionBottom }]}>
        <Pressable
          onPress={handleBagPress}
          disabled={bagDisabled}
          style={({ pressed }) => [
            styles.bagAction,
            {
              backgroundColor: bagDisabled ? theme.colors.surfaceAlt : theme.colors.primary,
              borderColor: bagDisabled ? theme.colors.border : theme.colors.primary,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={bagLabel}
        >
          {bagBusy ? (
            <ActivityIndicator color={bagDisabled ? theme.colors.primary : theme.colors.onPrimary} />
          ) : (
            <>
              <AppText variant="bodyBold" tone={bagDisabled ? 'muted' : 'inverse'} numberOfLines={1}>
                {bagLabel}
              </AppText>
              {bagStatus?.standard.inBag || bagStatus?.custom.alreadyBagged ? (
                <AppText variant="captionBold" tone={bagDisabled ? 'muted' : 'inverse'}>Already in My Bag</AppText>
              ) : null}
            </>
          )}
        </Pressable>

        <View style={styles.secondaryActions}>
          <Pressable
            onPress={handleSavePress}
            disabled={busyAction === ACTION_KIND_SAVE}
            style={({ pressed }) => [
              styles.sideAction,
              { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              sourceType === 'PRODUCT'
                ? saved ? 'Remove from wishlist' : 'Save to wishlist'
                : saved ? 'Remove from Saved Looks' : 'Save look for inspiration'
            }
          >
            <AppText variant="bodyBold" tone="default">
              {sourceType === 'PRODUCT' ? (saved ? 'Wishlisted' : 'Wishlist') : (saved ? 'Saved Look' : 'Save look')}
            </AppText>
          </Pressable>
          <Pressable
            onPress={handleMessagePress}
            disabled={!canMessageBrand || busyAction === ACTION_KIND_MESSAGE}
            style={({ pressed }) => [
              styles.sideAction,
              { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder, opacity: canMessageBrand ? 1 : 0.62 },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Message brand"
          >
            <AppText variant="bodyBold" tone="default">Message</AppText>
          </Pressable>
        </View>
      </View>

      {renderMetadataSheet()}

      {loading ? (
        <View style={[styles.stateOverlay, { backgroundColor: theme.colors.backdrop }]}>
          <ActivityIndicator color={theme.colors.textInverse} />
          <AppText variant="bodyBold" tone="inverse">Loading market item</AppText>
        </View>
      ) : error ? (
        <View style={[styles.stateOverlay, { backgroundColor: theme.colors.backdropStrong }]}>
          <AppText variant="subtitle" tone="inverse">Item unavailable</AppText>
          <AppText variant="body" tone="inverse">{error}</AppText>
          <Pressable
            onPress={() => void load()}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="bodyBold">Retry</AppText>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mediaPage: {
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topControls: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationPill: {
    position: 'absolute',
    top: 96,
    alignSelf: 'center',
    minHeight: 30,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCluster: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  bagAction: {
    minHeight: 58,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sideAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  metadataSheet: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHandleWrap: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  sheetHandle: {
    width: 54,
    height: 5,
    borderRadius: tokens.radius.full,
  },
  sheetContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  sheetTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  pricePill: {
    maxWidth: 142,
    minHeight: 34,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  metaCell: {
    flex: 1,
    minHeight: 78,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  detailBlock: {
    gap: tokens.spacing.xs,
  },
  reviewSummaryWrap: {
    gap: tokens.spacing.sm,
  },
  collapsedSheetContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
  },
  collapsedCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

export default MarketCommerceViewer;
