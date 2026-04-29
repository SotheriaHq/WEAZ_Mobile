import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { BagPulseIcon, type BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { MobileStoreApi, type ProductBagStatus, type StoreProduct } from '@/src/api/StoreApi';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const LAYOUT_FALLBACK_BOTTOM = 120;

function formatPrice(amount: number, currency = 'NGN') {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function getTotalStock(product: Pick<StoreProduct, 'stock' | 'variants'>) {
  if (product.variants.length > 0) {
    return product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  }
  return Number(product.stock || 0);
}

export default function ProductRouteScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const { bagProduct, beginCustomFlow, getPulseStatus, loadingByProductId, prepareBag } = useMobileBagging();

  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [bagStatus, setBagStatus] = useState<ProductBagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) {
      setError('Product id is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [detail, status] = await Promise.all([
        MobileStoreApi.getProductById(productId),
        prepareBag(productId).catch(() => null),
      ]);
      setProduct(detail);
      setBagStatus(status);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Product unavailable.');
    } finally {
      setLoading(false);
    }
  }, [prepareBag, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const media = useMemo(() => {
    if (!product) return [];
    const entries = [
      { url: product.coverImage ?? null, fileId: product.coverImageId ?? null },
      ...product.images,
    ];
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = `${entry.url ?? ''}-${entry.fileId ?? ''}`;
      if ((!entry.url && !entry.fileId) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [product]);

  const stock = product ? getTotalStock(product) : 0;
  const isBusy = Boolean(product && loadingByProductId[product.id]);
  const pulseStatus: BagPulseStatus = product
    ? getPulseStatus(product.id, stock <= 0 && !product.customOrderEnabled)
    : 'disabled';

  const handleStandardBag = useCallback(async () => {
    if (!product) return;
    try {
      const result = await bagProduct({ id: product.id, name: product.name });
      if (result?.status) setBagStatus(result.status);
    } catch {
      toast.error('Unable to update bag right now.');
    }
  }, [bagProduct, product, toast]);

  const handleCustomBag = useCallback(async () => {
    if (!product) return;
    try {
      const status = await beginCustomFlow({ id: product.id, name: product.name });
      if (status) setBagStatus(status);
    } catch {
      toast.error('Unable to start custom bagging right now.');
    }
  }, [beginCustomFlow, product, toast]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/(tabs)/discover" />
        <AppText variant="title">Product</AppText>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <AppText variant="body" tone="muted">Loading product...</AppText>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">Warning</AppText>
          <AppText variant="bodyBold">Product unavailable</AppText>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Button title="Retry" size="sm" onPress={() => void load()} />
        </View>
      ) : product ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {media.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              style={styles.mediaRail}
            >
              {media.map((item, index) => (
                <View key={`${item.url ?? item.fileId}-${index}`} style={[styles.mediaPage, { width: width - tokens.spacing.lg * 2 }]}>
                  {item.url ? (
                    <StableImage uri={item.url} containerStyle={styles.heroImage} imageStyle={styles.heroImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <AppText variant="display">Image</AppText>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="display">Product</AppText>
            </View>
          )}

          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <AppText variant="title">{product.name}</AppText>
                <AppText variant="body" tone="muted">
                  {product.brandId ? 'Brand product' : 'Threadly product'}
                </AppText>
              </View>
              <BagPulseIcon status={pulseStatus} context="single" size={40} />
            </View>
            <AppText variant="subtitle" tone="primary">
              {formatPrice(product.price, product.currency)}
            </AppText>
            {product.description ? (
              <AppText variant="body" tone="muted">{product.description}</AppText>
            ) : null}
          </Card>

          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Product status</AppText>
            <AppText variant="body" tone="muted">
              {stock > 0 ? `${stock} item${stock === 1 ? '' : 's'} in stock` : 'Out of stock for standard checkout'}
            </AppText>
            <AppText variant="body" tone="muted">
              {product.customOrderEnabled ? 'Custom requests are enabled for this product.' : 'Custom requests are not enabled.'}
            </AppText>
            {bagStatus?.standard.inBag || bagStatus?.custom.alreadyBagged ? (
              <AppText variant="bodyBold" tone="primary">This product is already in your bag.</AppText>
            ) : null}
          </Card>

          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Available options</AppText>
            <AppText variant="body" tone="muted">
              {product.sizes.length > 0 ? `Sizes: ${product.sizes.join(', ')}` : 'No size variants listed.'}
            </AppText>
            <AppText variant="body" tone="muted">
              {product.colors.length > 0 ? `Colors: ${product.colors.join(', ')}` : 'No color variants listed.'}
            </AppText>
          </Card>

          <View style={styles.actionStack}>
            <Button
              title={bagStatus?.standard.inBag ? 'View item in bag' : 'Bag this item'}
              onPress={handleStandardBag}
              loading={isBusy}
              disabled={Boolean(bagStatus && !bagStatus.standard.enabled && bagStatus.ui.defaultAction !== 'OPEN_SELECTOR')}
              left={<BagPulseIcon status={pulseStatus} context="single" size={28} />}
              fullWidth
            />
            <Button
              title={bagStatus?.custom.alreadyBagged ? 'View custom bag' : 'Bag as custom request'}
              onPress={handleCustomBag}
              loading={isBusy}
              disabled={!product.customOrderEnabled && !bagStatus?.custom.available}
              variant="secondary"
              left={<BagPulseIcon status={pulseStatus} context="single" mode="custom" size={28} />}
              fullWidth
            />
            {product.brandId ? (
              <Button
                title="Open brand store"
                variant="outline"
                onPress={() => {
                  router.push({ pathname: '/catalog/[brandId]', params: { brandId: product.brandId, tab: 'Shop', productId: product.id } } as any);
                }}
                fullWidth
              />
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: LAYOUT_FALLBACK_BOTTOM,
  },
  mediaRail: {
    overflow: 'visible',
  },
  mediaPage: {
    paddingRight: tokens.spacing.sm,
  },
  heroImage: {
    width: '100%',
    minHeight: 320,
    maxHeight: 520,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: tokens.spacing.sm,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  actionStack: {
    gap: tokens.spacing.sm,
  },
});
