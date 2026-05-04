import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type StatusFilter = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

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

function formatDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusTone(status: string) {
  const upper = status.toUpperCase();
  if (upper.includes('COMPLET') || upper.includes('DELIVERED')) return 'success';
  if (upper.includes('DISPUT') || upper.includes('CANCEL') || upper.includes('REJECT') || upper.includes('REFUND')) return 'danger';
  if (upper.includes('PENDING') || upper.includes('PROCESS') || upper.includes('TRANSIT') || upper.includes('READY')) return 'warning';
  return 'neutral';
}

function isPendingOrder(order: BuyerOrderSummary) {
  const status = order.status.toUpperCase();
  const paymentStatus = order.paymentStatus.toUpperCase();
  return paymentStatus !== 'PAID' || status.includes('PENDING') || status.includes('AWAIT') || status.includes('DRAFT');
}

function isActiveOrder(order: BuyerOrderSummary) {
  const status = order.status.toUpperCase();
  return status.includes('PROCESS') || status.includes('SHIPP') || status.includes('TRANSIT') || status.includes('READY') || status.includes('ACCEPT');
}

function isCompletedOrder(order: BuyerOrderSummary) {
  const status = order.status.toUpperCase();
  return status.includes('COMPLET') || status.includes('DELIVERED');
}

function isCancelledOrder(order: BuyerOrderSummary) {
  const status = order.status.toUpperCase();
  return status.includes('DISPUT') || status.includes('CANCEL') || status.includes('REJECT') || status.includes('REFUND');
}

function matchesStatusFilter(order: BuyerOrderSummary, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'pending') return isPendingOrder(order);
  if (filter === 'active') return isActiveOrder(order);
  if (filter === 'completed') return isCompletedOrder(order);
  return isCancelledOrder(order);
}

function matchesSearch(order: BuyerOrderSummary, query: string) {
  if (!query.trim()) return true;
  const haystack = [order.id, order.title, order.brandName, order.status, order.sourceLabel].join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function OrderSkeleton() {
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.rowTop}>
        <Skeleton width={120} height={16} borderRadius={6} />
        <Skeleton width={60} height={18} borderRadius={9} />
      </View>
      <View style={styles.titleRow}>
        <Skeleton width={44} height={44} borderRadius={14} />
        <View style={styles.titleCopy}>
          <Skeleton width="70%" height={20} borderRadius={6} />
          <Skeleton width="50%" height={14} borderRadius={6} />
        </View>
      </View>
      <Skeleton width="58%" height={14} borderRadius={6} />
    </Card>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme();
  return (
    <Card padding="lg" style={styles.emptyCard}>
      <AppText variant="display">📦</AppText>
      <AppText variant="subtitle">No orders yet</AppText>
      <AppText variant="body" tone="muted" style={styles.centerText}>
        Your standard and custom purchase history will appear here.
      </AppText>
      <Button title="Retry" onPress={onRetry} fullWidth />
      <View style={[styles.emptyHint, { borderColor: theme.colors.border }]}>
        <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
          This native screen combines the buyer order sources that the web app already exposes.
        </AppText>
      </View>
    </Card>
  );
}

function OrderRow({ item }: { item: BuyerOrderSummary }) {
  const { theme } = useTheme();
  const tone = getStatusTone(item.status);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/orders/[orderId]', params: { orderId: item.id } } as any)}
      style={({ pressed }) => [pressed ? styles.pressed : null]}
    >
      <Card padding="md" style={[styles.card, { borderColor: theme.colors.border }]}>
        <View style={styles.rowTop}>
          <View style={styles.pillRow}>
            <View style={[styles.kindPill, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">{item.kind === 'STANDARD' ? 'Standard' : 'Custom'}</AppText>
            </View>
            <View style={[styles.kindPill, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">{item.sourceLabel}</AppText>
            </View>
          </View>
          <AppText
            variant="captionBold"
            tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'primary' : 'secondary'}
          >
            {item.status}
          </AppText>
        </View>

        <View style={styles.titleRow}>
          <View style={[styles.previewThumb, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
            <StableImage
              uri={item.thumbnail ?? undefined}
              containerStyle={styles.previewThumbFill}
              imageStyle={styles.previewThumbFill}
              fallback={
                <View style={[StyleSheet.absoluteFillObject, styles.previewFallback]}>
                  <AppText variant="subtitle">{item.kind === 'STANDARD' ? '🧵' : '✂️'}</AppText>
                </View>
              }
            />
          </View>
          <View style={styles.titleCopy}>
            <AppText variant="bodyBold" numberOfLines={1}>{item.title}</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              {item.brandName} · {formatDate(item.createdAt)}
            </AppText>
          </View>
          <View style={styles.amountCopy}>
            <AppText variant="bodyBold" numberOfLines={1}>{formatCurrency(item.amount, item.currency)}</AppText>
            <AppText variant="captionRegular" tone="muted">
              {item.itemCount} item{item.itemCount === 1 ? '' : 's'}
            </AppText>
          </View>
        </View>

        <View style={styles.detailLine}>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {item.progressLabel || 'Open for review'}
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            #{item.id.slice(0, 8).toUpperCase()}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

function OrdersLoadingState() {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: 4 }).map((_, index) => (
        <OrderSkeleton key={`order-skeleton-${index}`} />
      ))}
    </View>
  );
}

export default function OrdersScreen() {
  const { theme } = useTheme();
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BuyerOrderSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await BuyerOrdersApi.list();
      setItems(orders);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load orders right now.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    void load();
  }, [load, status]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesStatusFilter(item, statusFilter)) return false;
        return matchesSearch(item, search);
      }),
    [items, search, statusFilter],
  );

  const stats = useMemo(() => {
    const total = items.length;
    return {
      total,
      pending: items.filter((item) => isPendingOrder(item)).length,
      active: items.filter((item) => isActiveOrder(item)).length,
      completed: items.filter((item) => isCompletedOrder(item)).length,
      cancelled: items.filter((item) => isCancelledOrder(item)).length,
    };
  }, [items]);

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <AppBackButton fallbackHref="/(tabs)/me" />
          <View style={styles.headerCopy}>
            <AppText variant="bodyBold">My Orders</AppText>
            <AppText variant="captionRegular" tone="muted">Sign in to view your orders</AppText>
          </View>
        </View>
        <View style={styles.unauthenticatedWrap}>
          <Card padding="lg" style={styles.emptyCard}>
            <AppText variant="subtitle">Sign in required</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              Open your buyer order history after you sign in.
            </AppText>
            <Button title="Sign in" onPress={() => router.push('/(auth)/login' as any)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
        <AppBackButton fallbackHref="/(tabs)/me" />
        <View style={styles.headerCopy}>
          <AppText variant="bodyBold">My Orders</AppText>
          <AppText variant="captionRegular" tone="muted">Standard and custom order history</AppText>
        </View>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OrderRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.statsGrid}>
              <Card padding="md" style={styles.statCard}><AppText variant="captionRegular" tone="muted">Total</AppText><AppText variant="subtitle">{stats.total}</AppText></Card>
              <Card padding="md" style={styles.statCard}><AppText variant="captionRegular" tone="muted">Pending</AppText><AppText variant="subtitle">{stats.pending}</AppText></Card>
              <Card padding="md" style={styles.statCard}><AppText variant="captionRegular" tone="muted">Active</AppText><AppText variant="subtitle">{stats.active}</AppText></Card>
              <Card padding="md" style={styles.statCard}><AppText variant="captionRegular" tone="muted">Completed</AppText><AppText variant="subtitle">{stats.completed}</AppText></Card>
              <Card padding="md" style={styles.statCard}><AppText variant="captionRegular" tone="muted">Cancelled</AppText><AppText variant="subtitle">{stats.cancelled}</AppText></Card>
            </View>

            <View style={styles.filtersRow}>
              {STATUS_FILTERS.map((option) => {
                const selected = statusFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setStatusFilter(option.key)}
                    style={({ pressed }) => [
                      styles.statusChip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                      },
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <AppText variant="captionBold" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <Input label="Search orders" hideLabel placeholder="Search orders, brands, or IDs" value={search} onChangeText={setSearch} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <OrdersLoadingState />
          ) : error ? (
            <Card padding="lg" style={styles.errorCard}>
              <AppText variant="subtitle">Could not load orders</AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>{error}</AppText>
              <Button title="Retry" onPress={() => void load()} />
            </Card>
          ) : (
            <EmptyState onRetry={() => void load()} />
          )
        }
        ListFooterComponent={
          loading && filteredItems.length > 0 ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null
        }
      />
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
    gap: 2,
  },
  content: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  headerStack: {
    gap: tokens.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  filterPill: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  statusChip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    flex: 1,
  },
  kindPill: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  previewThumb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewThumbFill: {
    width: '100%',
    height: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  amountCopy: {
    alignItems: 'flex-end',
  },
  detailLine: {
    marginTop: tokens.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  skeletonList: {
    gap: tokens.spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  emptyHint: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  errorCard: {
    gap: tokens.spacing.md,
  },
  footerLoading: {
    paddingVertical: tokens.spacing.md,
    alignItems: 'center',
  },
  unauthenticatedWrap: {
    flex: 1,
    padding: tokens.spacing.md,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
});
