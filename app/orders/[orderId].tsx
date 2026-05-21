import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { BuyerOrdersApi, type BuyerOrderDetail, type BuyerOrderItem } from '@/src/api/BuyerOrdersApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { readRecommendationSnapshot } from '@/src/utils/sizeRecommendation';

function formatCurrency(amount: number, currency = 'NGN') {
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

function formatDate(value?: string | null) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusTone(status: string) {
  const upper = status.toUpperCase();
  if (upper.includes('COMPLET') || upper.includes('DELIVERED')) return 'success';
  if (upper.includes('DISPUT') || upper.includes('CANCEL') || upper.includes('REJECT') || upper.includes('REFUND')) return 'danger';
  if (upper.includes('PENDING') || upper.includes('PROCESS') || upper.includes('TRANSIT') || upper.includes('READY')) return 'warning';
  return 'neutral';
}

function canConfirmDelivery(order: BuyerOrderDetail) {
  return order.status.toUpperCase().includes('DELIVERED_PENDING_BUYER_CONFIRMATION');
}

function DetailItemRow({ item }: { item: BuyerOrderItem }) {
  const { theme } = useTheme();
  const recommendationSnapshot = readRecommendationSnapshot(item.sizeRecommendationSnapshot);

  return (
    <View style={[styles.itemRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
      <View style={[styles.itemThumb, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
        <StableImage
          uri={item.thumbnail ?? undefined}
          containerStyle={styles.itemThumbFill}
          imageStyle={styles.itemThumbFill}
          fallback={
            <View style={[StyleSheet.absoluteFillObject, styles.thumbFallback]}>
              <AppText variant="captionBold" tone="primary">🧵</AppText>
            </View>
          }
        />
      </View>
      <View style={styles.itemCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{item.productName}</AppText>
        <AppText variant="captionRegular" tone="muted">
          {[`Qty ${item.quantity}`, item.selectedSize ? `Size ${item.selectedSize}` : null, item.selectedColor ? `Color ${item.selectedColor}` : null]
            .filter(Boolean)
            .join(' - ')}
        </AppText>
        {recommendationSnapshot ? (
          <AppText variant="captionRegular" tone={recommendationSnapshot.selectedDiffers ? 'warning' : 'muted'}>
            {recommendationSnapshot.selectedDiffers
              ? `Saved measurements suggested ${recommendationSnapshot.recommendedSize}, but you selected ${item.selectedSize ?? recommendationSnapshot.selectedSize}.`
              : `Recommended size: ${recommendationSnapshot.recommendedSize ?? recommendationSnapshot.selectedSize}${recommendationSnapshot.confidenceText ? ` (${recommendationSnapshot.confidenceText})` : ''}.`}
          </AppText>
        ) : null}
      </View>
      <AppText variant="captionBold">{formatCurrency(item.price)}</AppText>
    </View>
  );
}

export default function BuyerOrderDetailScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<BuyerOrderDetail | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setError('Order not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const detail = await BuyerOrdersApi.getById(orderId);
      setOrder(detail);
    } catch (nextError) {
      setOrder(null);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load this order right now.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    void load();
  }, [load, status]);

  const confirmable = useMemo(() => Boolean(order && canConfirmDelivery(order)), [order]);
  const heroThumbnail = order?.kind === 'STANDARD'
    ? order.items[0]?.thumbnail ?? null
    : order?.sourcePrimaryMediaUrl ?? null;

  const handleConfirmDelivery = useCallback(async () => {
    if (!order || saving) return;

    setSaving(true);
    try {
      const updated = await BuyerOrdersApi.confirmDelivery(order);
      setOrder(updated);
      toast.success('Delivery confirmation submitted.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Could not confirm delivery.');
    } finally {
      setSaving(false);
    }
  }, [order, saving, toast]);

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <AppBackButton fallbackHref="/orders" />
          <AppText variant="bodyBold">Order details</AppText>
        </View>
        <View style={styles.centerWrap}>
          <Card padding="lg" style={styles.emptyCard}>
            <AppText variant="subtitle">Sign in required</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              Open your order history after you sign in.
            </AppText>
            <Button title="Sign in" onPress={() => router.push('/(auth)/login' as any)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <AppBackButton fallbackHref="/orders" />
          <AppText variant="bodyBold">Order details</AppText>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Card padding="lg" style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.badgeRow}>
                <Skeleton width={84} height={24} borderRadius={12} />
                <Skeleton width={72} height={24} borderRadius={12} />
              </View>
              <Skeleton width={76} height={16} borderRadius={8} />
            </View>

            <View style={styles.heroTitleRow}>
              <Skeleton width={56} height={56} borderRadius={18} />
              <View style={styles.heroCopy}>
                <Skeleton width="72%" height={20} borderRadius={6} />
                <Skeleton width="46%" height={14} borderRadius={6} />
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}><Skeleton width="40%" height={12} borderRadius={6} /><Skeleton width="75%" height={18} borderRadius={6} /></View>
              <View style={styles.summaryCell}><Skeleton width="40%" height={12} borderRadius={6} /><Skeleton width="70%" height={18} borderRadius={6} /></View>
              <View style={styles.summaryCell}><Skeleton width="44%" height={12} borderRadius={6} /><Skeleton width="68%" height={18} borderRadius={6} /></View>
              <View style={styles.summaryCell}><Skeleton width="38%" height={12} borderRadius={6} /><Skeleton width="66%" height={18} borderRadius={6} /></View>
            </View>
          </Card>

          <Card padding="lg" style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Skeleton width={110} height={16} borderRadius={6} />
              <Skeleton width={76} height={14} borderRadius={6} />
            </View>
            <View style={styles.sectionList}>
              <Skeleton width="100%" height={54} borderRadius={14} />
              <Skeleton width="100%" height={54} borderRadius={14} />
              <Skeleton width="100%" height={54} borderRadius={14} />
            </View>
          </Card>

          <Card padding="lg" style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Skeleton width={90} height={16} borderRadius={6} />
              <Skeleton width={120} height={14} borderRadius={6} />
            </View>
            <View style={styles.sectionList}>
              <Skeleton width="100%" height={54} borderRadius={14} />
              <Skeleton width="100%" height={54} borderRadius={14} />
              <Skeleton width="100%" height={54} borderRadius={14} />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!order || error) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <AppBackButton fallbackHref="/orders" />
          <AppText variant="bodyBold">Order details</AppText>
        </View>
        <View style={styles.centerWrap}>
          <Card padding="lg" style={styles.emptyCard}>
            <AppText variant="subtitle">Could not load order</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>{error || 'This order is unavailable.'}</AppText>
            <Button title="Retry" onPress={() => void load()} />
            <Button title="Back to orders" variant="secondary" onPress={() => router.replace('/orders' as any)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const tone = statusTone(order.status);
  const summaryLabel = order.kind === 'STANDARD' ? 'Standard order' : 'Custom order';
  const progressLabel = order.kind === 'STANDARD' ? order.status : order.currentProgressStage || order.status;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
        <AppBackButton fallbackHref="/orders" />
        <View style={styles.headerCopy}>
          <AppText variant="bodyBold">Order details</AppText>
          <AppText variant="captionRegular" tone="muted">{summaryLabel}</AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Card padding="lg" style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.badgeRow}>
              <View style={[styles.pill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="captionBold" tone="muted">{order.kind === 'STANDARD' ? 'Standard' : 'Custom'}</AppText>
              </View>
              <View style={[styles.pill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="captionBold" tone="muted">Buyer view</AppText>
              </View>
            </View>
            <AppText variant="captionBold" tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'primary' : 'secondary'}>
              {order.status}
            </AppText>
          </View>

          <View style={styles.heroTitleRow}>
            <View style={[styles.heroThumb, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
              <StableImage
                uri={heroThumbnail ?? undefined}
                containerStyle={styles.heroThumbFill}
                imageStyle={styles.heroThumbFill}
                fallback={
                  <View style={[StyleSheet.absoluteFillObject, styles.thumbFallback]}>
                    <AppText variant="subtitle">{order.kind === 'STANDARD' ? '🧵' : '✂️'}</AppText>
                  </View>
                }
              />
            </View>
            <View style={styles.heroCopy}>
              <AppText variant="title" numberOfLines={2}>{order.title}</AppText>
              <AppText variant="body" tone="muted" numberOfLines={1}>{order.brandName}</AppText>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Amount</AppText>
              <AppText variant="subtitle">{formatCurrency(order.amount, order.currency)}</AppText>
            </View>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Placed</AppText>
              <AppText variant="subtitle">{formatDate(order.createdAt) || '—'}</AppText>
            </View>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Progress</AppText>
              <AppText variant="subtitle">{progressLabel || 'Placed'}</AppText>
            </View>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Payment</AppText>
              <AppText variant="subtitle">{order.paymentStatus}</AppText>
            </View>
          </View>
        </Card>

        {confirmable ? (
          <Button title={saving ? 'Confirming…' : 'Confirm delivery'} onPress={() => void handleConfirmDelivery()} disabled={saving} />
        ) : null}

        <Card padding="lg" style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyBold">Order items</AppText>
            <AppText variant="captionRegular" tone="muted">
              {order.kind === 'STANDARD' ? order.itemCount : order.measurementCount} {order.kind === 'STANDARD' ? 'item' : 'measurement'}{(order.kind === 'STANDARD' ? order.itemCount : order.measurementCount) === 1 ? '' : 's'}
            </AppText>
          </View>
          {order.kind === 'STANDARD' ? (
            order.items.length > 0 ? (
              <View style={styles.sectionList}>
                {order.items.map((item) => <DetailItemRow key={item.id} item={item} />)}
              </View>
            ) : (
              <AppText variant="body" tone="muted">This order does not include line items in the mobile payload.</AppText>
            )
          ) : (
            <View style={styles.sectionList}>
              <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <AppText variant="captionRegular" tone="muted">Source</AppText>
                <AppText variant="bodyBold">{order.sourceType} · {order.sourceId}</AppText>
              </View>
              <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <AppText variant="captionRegular" tone="muted">Measurements</AppText>
                <AppText variant="bodyBold">{order.measurementCount} point{order.measurementCount === 1 ? '' : 's'}</AppText>
              </View>
              <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <AppText variant="captionRegular" tone="muted">Delivery promise</AppText>
                <AppText variant="bodyBold">{formatDate(order.promisedDeliveryAt) || 'Pending'}</AppText>
              </View>
            </View>
          )}
        </Card>

        <Card padding="lg" style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyBold">Status</AppText>
            <AppText variant="captionRegular" tone="muted">Latest buyer-visible state</AppText>
          </View>
          <View style={styles.sectionList}>
            <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
              <AppText variant="captionRegular" tone="muted">Order ID</AppText>
              <AppText variant="bodyBold">#{order.id.slice(0, 8).toUpperCase()}</AppText>
            </View>
            <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
              <AppText variant="captionRegular" tone="muted">Payment status</AppText>
              <AppText variant="bodyBold">{order.paymentStatus}</AppText>
            </View>
            <View style={[styles.metaBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
              <AppText variant="captionRegular" tone="muted">Last updated</AppText>
              <AppText variant="bodyBold">{formatDate(order.updatedAt || order.createdAt)}</AppText>
            </View>
          </View>
        </Card>
      </ScrollView>
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
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  centerWrap: {
    flex: 1,
    padding: tokens.spacing.md,
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  emptyCard: {
    gap: tokens.spacing.md,
    alignItems: 'center',
  },
  heroCard: {
    gap: tokens.spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    flex: 1,
  },
  pill: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  heroThumb: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroThumbFill: {
    width: '100%',
    height: '100%',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  summaryCell: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  sectionCard: {
    gap: tokens.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  sectionList: {
    gap: tokens.spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemThumbFill: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  metaBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    gap: 2,
  },
});
