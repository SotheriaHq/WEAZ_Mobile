import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { MobileStoreApi, type StoreProduct } from '@/src/api/StoreApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

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

export default function ProductRouteScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const [product, setProduct] = useState<StoreProduct | null>(null);
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
      const detail = await MobileStoreApi.getProductById(productId);
      if (detail.brandId) {
        router.replace({
          pathname: '/catalog/[brandId]',
          params: { brandId: detail.brandId, tab: 'Shop', productId: detail.id },
        } as any);
        return;
      }
      setProduct(detail);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Product unavailable.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <AppText variant="subtitle">⚠️</AppText>
          <AppText variant="bodyBold">Product unavailable</AppText>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Button title="Retry" size="sm" onPress={() => void load()} />
        </View>
      ) : product ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {product.coverImage ? (
            <StableImage uri={product.coverImage} containerStyle={styles.heroImage} imageStyle={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="display">🛍️</AppText>
            </View>
          )}

          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="title">{product.name}</AppText>
            <AppText variant="subtitle" tone="primary">
              {formatPrice(product.price, product.currency)}
            </AppText>
            {product.description ? (
              <AppText variant="body" tone="muted">{product.description}</AppText>
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
            <AppText variant="body" tone="muted">
              {product.customOrderEnabled ? 'Custom requests are enabled for this product.' : 'Custom requests are not enabled.'}
            </AppText>
          </Card>

          <Button title="Back to market" onPress={() => router.replace('/(tabs)/discover' as any)} />
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
    paddingBottom: tokens.spacing.xl,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: tokens.radius.xl,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: tokens.spacing.sm,
    borderWidth: 1,
  },
});
