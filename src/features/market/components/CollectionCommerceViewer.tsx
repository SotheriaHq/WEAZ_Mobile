import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { StableImage } from '@/components/ui/StableImage';
import {
  MobileStoreApi,
  type CollectionBagProductStatus,
  type CollectionBagSelection,
  type CollectionBagStatus,
} from '@/src/api/StoreApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { BAG_IT_EMOJI, BAG_IT_LABEL } from '@/src/constants/bagging';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type CollectionCommerceViewerProps = {
  collectionId: string;
  fallbackHref?: string;
};

const shouldLogCollectionTiming = () =>
  __DEV__ ||
  process.env.NODE_ENV === 'test' ||
  process.env.EXPO_PUBLIC_BAGGING_OBSERVABILITY === 'true';

const logCollectionTiming = (event: string, startedAt: number, context: Record<string, unknown>) => {
  if (!shouldLogCollectionTiming()) return;
  console.debug('[bagging:timing]', {
    event: `mobile.collection_viewer.${event}.duration`,
    durationMs: Date.now() - startedAt,
    ...context,
  });
};

const statusBarContrast = (value: 'light' | 'dark') => (value === 'dark' ? 'light' : 'dark');

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

const formatPriceRange = (status: CollectionBagStatus | null) => {
  const range = status?.collection.priceRange;
  if (!range) return 'Price varies';
  if (typeof range.min === 'number' && typeof range.max === 'number') {
    if (range.min === range.max) return formatPrice(range.min, range.currency) ?? 'Price varies';
    return `${formatPrice(range.min, range.currency)} - ${formatPrice(range.max, range.currency)}`;
  }
  if (typeof range.min === 'number') return `From ${formatPrice(range.min, range.currency)}`;
  if (typeof range.max === 'number') return `Up to ${formatPrice(range.max, range.currency)}`;
  return 'Price varies';
};

const blockerLabel = (product: CollectionBagProductStatus) => {
  if (product.inBag) return 'Already in My Bag';
  if (product.defaultAction === 'OPEN_SELECTOR') return 'Choose size/color';
  if (product.defaultAction === 'OPEN_FITTINGS') return 'Measurements needed';
  if (product.defaultAction === 'CONFIRM_STALE_FITTINGS') return 'Confirm saved fittings';
  if (product.stockState === 'OUT_OF_STOCK') return 'Out of stock';
  return product.reason ?? 'Unavailable';
};

function CollectionCover({ status }: { status: CollectionBagStatus }) {
  const { theme } = useTheme();
  const uri = useResolvedImageUri({
    src: status.collection.coverImage,
    fileId: status.collection.coverImageId,
    enabled: Boolean(status.collection.coverImage || status.collection.coverImageId),
    debugContext: { collectionId: status.collection.id },
  });

  return (
    <View style={[styles.cover, { backgroundColor: theme.colors.surfaceAlt }]}>
      {uri ? (
        <StableImage uri={uri} resizeMode="cover" containerStyle={styles.coverImage} imageStyle={styles.coverImage} />
      ) : (
        <View style={styles.coverFallback}>
          <AppText variant="display" tone="muted">{BAG_IT_EMOJI}</AppText>
          <AppText variant="bodyBold" tone="muted">Collection preview unavailable</AppText>
        </View>
      )}
    </View>
  );
}

function ProductThumb({ product }: { product: CollectionBagProductStatus }) {
  const { theme } = useTheme();
  const uri = useResolvedImageUri({
    src: product.coverImage,
    fileId: product.coverImageId,
    enabled: Boolean(product.coverImage || product.coverImageId),
    debugContext: { productId: product.productId },
  });
  return (
    <View style={[styles.productThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
      {uri ? (
        <StableImage uri={uri} resizeMode="cover" containerStyle={styles.productThumbImage} imageStyle={styles.productThumbImage} />
      ) : (
        <AppText variant="captionBold" tone="muted">{BAG_IT_EMOJI}</AppText>
      )}
    </View>
  );
}

export function CollectionCommerceViewer({
  collectionId,
  fallbackHref = '/(tabs)/discover',
}: CollectionCommerceViewerProps) {
  const { theme, scheme } = useTheme();
  const chrome = useScreenChrome();
  const toast = useToast();
  const { status: authStatus, user } = useAuth();
  const { refreshGlobalBagCount } = useBagCount();
  const { bagProduct } = useMobileBagging();
  const [status, setStatus] = useState<CollectionBagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Record<string, CollectionBagSelection>>({});
  const [staleAccepted, setStaleAccepted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const normalizedCollectionId = String(collectionId ?? '').trim();
  const routePath = `/collection-viewer?collectionId=${normalizedCollectionId}`;

  const load = useCallback(async () => {
    if (!normalizedCollectionId) {
      setError('Collection id is missing.');
      setLoading(false);
      return;
    }

    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await MobileStoreApi.getCollectionBagStatus(normalizedCollectionId);
      setStatus(nextStatus);
      setSelectedIds((current) => {
        if (current.size > 0) {
          const valid = new Set(nextStatus.products.map((product) => product.productId));
          return new Set(Array.from(current).filter((id) => valid.has(id)));
        }
        return new Set(nextStatus.products.filter((product) => product.canBag).map((product) => product.productId));
      });
      if (authStatus === 'authenticated') {
        const savedMap = await SavedItemsApi.checkBatch('COLLECTION', [normalizedCollectionId]).catch(
          (): Record<string, boolean> => ({}),
        );
        setSaved(Boolean(savedMap[normalizedCollectionId]));
      } else {
        setSaved(false);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Collection unavailable.');
    } finally {
      setLoading(false);
      logCollectionTiming('initial_load', startedAt, { collectionId: normalizedCollectionId });
    }
  }, [authStatus, normalizedCollectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProducts = useMemo(
    () => status?.products.filter((product) => selectedIds.has(product.productId)) ?? [],
    [selectedIds, status?.products],
  );

  const selectedTotal = selectedProducts
    .filter((product) => product.canBag || product.defaultAction === 'OPEN_SELECTOR' || product.defaultAction === 'CONFIRM_STALE_FITTINGS')
    .reduce((sum, product) => sum + product.price, 0);

  const isOwnBrand = Boolean(
    status?.products.some((product) => product.sourceStatus.userState.isOwner) ||
      (status?.collection.brandId && (user?.activeBrandId === status.collection.brandId || user?.storeId === status.collection.brandId)),
  );

  const requireAuth = useCallback((message: string) => {
    if (authStatus === 'authenticated') return true;
    toast.info(message);
    router.push({ pathname: '/(auth)/login', params: { next: routePath } } as any);
    return false;
  }, [authStatus, routePath, toast]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as any);
  }, [fallbackHref]);

  const reloadAfterMutation = useCallback(async () => {
    await Promise.all([refreshGlobalBagCount({ forceRefresh: true }), load()]);
  }, [load, refreshGlobalBagCount]);

  const handleBagAll = useCallback(async () => {
    if (!requireAuth('Sign in to bag this collection.')) return;
    if (!status || isOwnBrand) {
      toast.info(isOwnBrand ? 'Brands cannot bag their own collection.' : 'Collection is not ready.');
      return;
    }

    setBusy('bag-all');
    try {
      const result = await MobileStoreApi.bagCollectionAll(normalizedCollectionId, {
        selections,
        acknowledgements: { staleFittingsAccepted: staleAccepted },
      });
      if (result.blocked.length > 0) {
        toast.info(`${result.blocked.length} product${result.blocked.length === 1 ? '' : 's'} need attention before Bag All.`);
      } else {
        toast.success(`${result.summary.addedCount} product${result.summary.addedCount === 1 ? '' : 's'} added to My Bag.`);
      }
      await reloadAfterMutation();
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to bag this collection.');
    } finally {
      setBusy(null);
    }
  }, [isOwnBrand, normalizedCollectionId, reloadAfterMutation, requireAuth, selections, staleAccepted, status, toast]);

  const handleBagSelected = useCallback(async () => {
    if (!requireAuth('Sign in to bag selected products.')) return;
    if (selectedProducts.length === 0) {
      toast.info('Select at least one product.');
      return;
    }

    setBusy('bag-selected');
    try {
      const result = await MobileStoreApi.bagCollectionSelected(normalizedCollectionId, {
        productIds: selectedProducts.map((product) => product.productId),
        selections,
        acknowledgements: { staleFittingsAccepted: staleAccepted },
      });
      if (result.blocked.length > 0) {
        toast.info(`${result.blocked.length} selected product${result.blocked.length === 1 ? '' : 's'} need attention.`);
      } else {
        toast.success(`${result.summary.addedCount} selected product${result.summary.addedCount === 1 ? '' : 's'} added to My Bag.`);
      }
      await reloadAfterMutation();
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to bag selected products.');
    } finally {
      setBusy(null);
    }
  }, [normalizedCollectionId, reloadAfterMutation, requireAuth, selectedProducts, selections, staleAccepted, toast]);

  const handleProductBag = useCallback(async (product: CollectionBagProductStatus) => {
    if (!requireAuth('Sign in to bag this product.')) return;
    setBusy(`product:${product.productId}`);
    try {
      await bagProduct({ id: product.productId, name: product.name });
      await reloadAfterMutation();
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update your bag.');
    } finally {
      setBusy(null);
    }
  }, [bagProduct, reloadAfterMutation, requireAuth, toast]);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const updateSelection = useCallback((productId: string, patch: CollectionBagSelection) => {
    setSelections((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...patch,
      },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!requireAuth('Sign in to save collections.')) return;
    setBusy('save');
    const previous = saved;
    setSaved(!previous);
    try {
      if (previous) {
        await SavedItemsApi.unsaveCatalogTarget({ targetType: 'COLLECTION', collectionId: normalizedCollectionId });
        toast.success('Removed from saved collections.');
      } else {
        await SavedItemsApi.saveCatalogTarget({ targetType: 'COLLECTION', collectionId: normalizedCollectionId });
        toast.success('Collection saved.');
      }
    } catch (nextError) {
      setSaved(previous);
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update saved collections.');
    } finally {
      setBusy(null);
    }
  }, [normalizedCollectionId, requireAuth, saved, toast]);

  const handleShare = useCallback(async () => {
    if (!status) return;
    setBusy('share');
    try {
      await Share.share({
        title: status.collection.title,
        message: `${status.collection.title}\n${status.collection.brandName ?? 'Threadly'}\n${routePath}`,
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to share this collection.');
    } finally {
      setBusy(null);
    }
  }, [routePath, status, toast]);

  const handleMessage = useCallback(() => {
    if (!status?.collection.brandId) {
      toast.info('Brand messaging is unavailable for this collection.');
      return;
    }
    if (!requireAuth('Sign in to message this brand.')) return;
    if (isOwnBrand) {
      toast.info('Messaging is disabled for your own brand.');
      return;
    }
    router.push({ pathname: '/messages/[threadId]', params: { threadId: 'brand', brandId: status.collection.brandId } } as any);
  }, [isOwnBrand, requireAuth, status?.collection.brandId, toast]);

  const renderProduct = ({ item }: { item: CollectionBagProductStatus }) => {
    const selected = selectedIds.has(item.productId);
    const selection = selections[item.productId] ?? {};
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/products/[productId]', params: { productId: item.productId, returnTo: routePath } } as any)}
        style={({ pressed }) => [
          styles.productCard,
          { backgroundColor: theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
      >
        <ProductThumb product={item} />
        <View style={styles.productBody}>
          <View style={styles.productHeader}>
            <View style={styles.productTitleBlock}>
              <AppText variant="bodyBold" numberOfLines={1}>{item.name}</AppText>
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {formatPrice(item.price, item.currency)} · {blockerLabel(item)}
              </AppText>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                toggleProduct(item.productId);
              }}
              style={({ pressed }) => [
                styles.selectBox,
                { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt },
                pressed && styles.pressed,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`Select ${item.name}`}
            >
              <AppText variant="captionBold" tone={selected ? 'primary' : 'muted'}>{selected ? 'On' : 'Off'}</AppText>
            </Pressable>
          </View>

          {item.defaultAction === 'OPEN_SELECTOR' ? (
            <View style={styles.optionStack}>
              {item.requiresSize ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                  {item.availableSizes.map((size) => (
                    <Pressable
                      key={`${item.productId}:size:${size}`}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateSelection(item.productId, { selectedSize: size });
                      }}
                      style={({ pressed }) => [
                        styles.optionChip,
                        {
                          backgroundColor: selection.selectedSize === size ? theme.colors.primary : theme.colors.surfaceAlt,
                          borderColor: selection.selectedSize === size ? theme.colors.primary : theme.colors.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText variant="captionBold" tone={selection.selectedSize === size ? 'inverse' : 'secondary'}>{size}</AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              {item.requiresColor ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                  {item.availableColors.map((color) => (
                    <Pressable
                      key={`${item.productId}:color:${color}`}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateSelection(item.productId, { selectedColor: color });
                      }}
                      style={({ pressed }) => [
                        styles.optionChip,
                        {
                          backgroundColor: selection.selectedColor === color ? theme.colors.primary : theme.colors.surfaceAlt,
                          borderColor: selection.selectedColor === color ? theme.colors.primary : theme.colors.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText variant="captionBold" tone={selection.selectedColor === color ? 'inverse' : 'secondary'}>{color}</AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}

          <View style={styles.productActions}>
            <Button
              title={`${BAG_IT_EMOJI} ${BAG_IT_LABEL}`}
              size="sm"
              variant={item.inBag ? 'secondary' : 'primary'}
              disabled={item.inBag || busy === `product:${item.productId}`}
              loading={busy === `product:${item.productId}`}
              onPress={() => handleProductBag(item)}
            />
            <Button
              title="View"
              size="sm"
              variant="outline"
              onPress={() => router.push({ pathname: '/products/[productId]', params: { productId: item.productId, returnTo: routePath } } as any)}
            />
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading && !status) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
        <StatusBar style={statusBarContrast(scheme)} translucent backgroundColor="transparent" />
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="bodyBold">Loading collection</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !status) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
        <StatusBar style={statusBarContrast(scheme)} translucent backgroundColor="transparent" />
        <View style={styles.centerState}>
          <AppText variant="subtitle">Collection unavailable</AppText>
          <AppText variant="body" tone="secondary">{error ?? 'Try again later.'}</AppText>
          <Button title="Retry" onPress={() => void load()} />
          <Button title="Back to Market" variant="outline" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  const blockerProducts = status.products.filter((product) => !product.canBag || product.inBag);

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
      <StatusBar style={statusBarContrast(scheme)} translucent backgroundColor="transparent" />
      <FlatList
        data={status.products}
        keyExtractor={(item) => item.productId}
        renderItem={renderProduct}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topBar}>
              <Pressable
                onPress={goBack}
                style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Back to Market"
              >
                <AppText variant="subtitle">{String.fromCodePoint(0x2039)}</AppText>
              </Pressable>
              <View style={styles.topActions}>
                <Button title="Share" size="sm" variant="outline" onPress={handleShare} loading={busy === 'share'} />
                <Button title={saved ? 'Saved' : 'Save'} size="sm" variant="outline" onPress={handleSave} loading={busy === 'save'} />
              </View>
            </View>

            <CollectionCover status={status} />
            <View style={styles.titleStack}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1}>{status.collection.brandName ?? 'Threadly brand'}</AppText>
              <AppText variant="h2" numberOfLines={2}>{status.collection.title}</AppText>
              <AppText variant="body" tone="secondary">{status.collection.description ?? 'Curated products from this brand.'}</AppText>
              <View style={styles.metaRow}>
                <AppText variant="captionBold" tone="muted">{status.collection.productCount} products</AppText>
                <AppText variant="captionBold" tone="muted">{formatPriceRange(status)}</AppText>
                <AppText variant="captionBold" tone="muted">{status.summary.blockedCount} need attention</AppText>
              </View>
            </View>

            <View style={[styles.summaryPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <AppText variant="captionBold" tone="muted">Ready</AppText>
                  <AppText variant="h3">{status.summary.eligibleCount}</AppText>
                </View>
                <View style={styles.summaryCell}>
                  <AppText variant="captionBold" tone="muted">Blocked</AppText>
                  <AppText variant="h3">{status.summary.blockedCount}</AppText>
                </View>
                <View style={styles.summaryCell}>
                  <AppText variant="captionBold" tone="muted">In bag</AppText>
                  <AppText variant="h3">{status.summary.alreadyInBagCount}</AppText>
                </View>
              </View>
              {status.featureFlags.collectionReviewsEnabled ? (
                <AppText variant="caption" tone="muted">Collection reviews are enabled by backend feature flag.</AppText>
              ) : null}
            </View>

            <View style={styles.headerActions}>
              <Button title="Open gallery" variant="outline" onPress={() => router.push({ pathname: '/collection-gallery', params: { collectionId: normalizedCollectionId } } as any)} />
              <Button title="Message brand" variant="outline" onPress={handleMessage} disabled={!status.collection.brandId || isOwnBrand} />
            </View>

            {blockerProducts.length > 0 ? (
              <View style={[styles.blockerPanel, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <AppText variant="bodyBold">Resolve before Bag All</AppText>
                {blockerProducts.slice(0, 6).map((product) => (
                  <AppText key={`blocker-${product.productId}`} variant="caption" tone={product.inBag ? 'muted' : 'warning'}>
                    {product.name}: {blockerLabel(product)}
                  </AppText>
                ))}
                {status.summary.staleFittingsCount > 0 ? (
                  <Button
                    title={staleAccepted ? 'Stale fittings accepted' : 'Accept stale fittings'}
                    size="sm"
                    variant={staleAccepted ? 'secondary' : 'outline'}
                    onPress={() => setStaleAccepted((current) => !current)}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <AppText variant="subtitle">Products in collection</AppText>
              <AppText variant="captionBold" tone="muted">{selectedProducts.length} selected</AppText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centerState}>
            <AppText variant="subtitle">No products available</AppText>
            <AppText variant="body" tone="secondary">This collection does not have public products yet.</AppText>
          </View>
        }
        ListFooterComponent={<View style={{ height: chrome.standardScreenBottomPadding + 120 }} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.stickyBar, { backgroundColor: theme.colors.bottomSheetSurface, borderColor: theme.colors.border, paddingBottom: chrome.standardScreenBottomPadding + tokens.spacing.sm }]}>
        <View style={styles.stickyCopy}>
          <AppText variant="captionBold" tone="muted">{selectedProducts.length} selected</AppText>
          <AppText variant="bodyBold">{formatPrice(selectedTotal, status.summary.currency) ?? 'Select products'}</AppText>
        </View>
        <View style={styles.stickyActions}>
          <Button title="Bag selected" size="sm" variant="outline" onPress={handleBagSelected} disabled={selectedProducts.length === 0 || Boolean(busy)} loading={busy === 'bag-selected'} />
          <Button title="Bag all" size="sm" onPress={handleBagAll} disabled={Boolean(busy) || isOwnBrand} loading={busy === 'bag-all'} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    gap: tokens.spacing.md,
  },
  header: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
  },
  topBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  topActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    height: 240,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  titleStack: {
    gap: tokens.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  summaryPanel: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  summaryCell: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  blockerPanel: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  productCard: {
    marginHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  productThumb: {
    width: 84,
    height: 104,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productThumbImage: {
    width: '100%',
    height: '100%',
  },
  productBody: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.sm,
  },
  productHeader: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  productTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  selectBox: {
    minWidth: 46,
    height: 34,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  optionStack: {
    gap: tokens.spacing.xs,
  },
  optionRow: {
    gap: tokens.spacing.xs,
    paddingRight: tokens.spacing.md,
  },
  optionChip: {
    minHeight: 32,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  stickyCopy: {
    flex: 1,
    minWidth: 0,
  },
  stickyActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  pressed: {
    opacity: 0.72,
  },
});

export default CollectionCommerceViewer;
