import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ErrorScreenState, ScreenState } from '@/components/ui/ScreenState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { OrderListRow } from '@/components/orders/OrderListRow';
import ReviewFormSheet from '@/components/reviews/ReviewFormSheet';
import ReviewPromptCard from '@/components/reviews/ReviewPromptCard';
import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import reviewApi, { type ReviewPromptDto, type SubmitReviewPayload } from '@/src/api/ReviewApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useCachedQuery, cachePolicies } from '@/src/cache';
import { queryClient } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import {
  applyOrderSummaryUpdate,
  subscribeOrderChanges,
} from '@/src/features/orders/orderRevision';
import { prefetchDetailOnPress, prefetchQuery } from '@/src/prefetch/navPrefetch';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { MuseLoader } from '@/components/ui/MuseLoader';

/**
 * Two INDEPENDENT axes, and the screen used to confuse them.
 *
 * `status` is where an order is in its life; `kind` is what sort of order it
 * is. The header carried the status axis twice — a row of count pills and a
 * row of chips, both writing `statusFilter`, both looking like controls, so a
 * press on one silently changed the other. Now the counts ARE the status
 * control (a number is a better label for a filter than a word alone), and the
 * tab rail carries the kind, which nothing offered before.
 */
type StatusFilter = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';
type KindFilter = 'all' | 'STANDARD' | 'CUSTOM';

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: 'all', label: 'All orders' },
  { key: 'STANDARD', label: 'Standard' },
  { key: 'CUSTOM', label: 'Custom' },
];

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

function matchesKindFilter(order: BuyerOrderSummary, filter: KindFilter) {
  return filter === 'all' || order.kind === filter;
}

function matchesSearch(order: BuyerOrderSummary, query: string) {
  if (!query.trim()) return true;
  const haystack = [order.id, order.title, order.brandName, order.status, order.sourceLabel].join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

// Shaped like the row it stands in for, so the list does not re-flow when the
// real orders arrive.
function OrderSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={[styles.skeletonRow, { borderBottomColor: theme.colors.border }]}>
      <Skeleton width={52} height={66} borderRadius={tokens.radius.sm} />
      <View style={styles.skeletonCopy}>
        <Skeleton width="70%" height={18} borderRadius={6} />
        <Skeleton width="45%" height={14} borderRadius={6} />
        <Skeleton width="35%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

/**
 * Two different nothings.
 *
 * An empty history is a fact and shopping is the useful next step. A filter
 * that matched nothing is not — telling a shopper with forty orders that they
 * have none, and offering to send them to the market, is the screen arguing
 * with the counts directly above it.
 */
function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <ScreenState
        kind="empty"
        emoji="🔍"
        title="No orders match"
        message="Nothing in your history matches these filters."
        actionLabel="Clear filters"
        onAction={onClear}
      />
    );
  }

  // No "Retry" here: an empty order history is a fact, not a failure, and
  // offering to retry it implies the list might be wrong.
  return (
    <ScreenState
      kind="empty"
      emoji="📦"
      title="No orders yet"
      message="Your standard and custom purchase history will appear here."
      actionLabel="Browse the market"
      onAction={() => topLevelNavigate({ pathname: '/(tabs)/discover' } as any)}
    />
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
  const toast = useToast();
  const { status, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [reviewPrompts, setReviewPrompts] = useState<ReviewPromptDto[]>([]);
  const [activeReviewPrompt, setActiveReviewPrompt] = useState<ReviewPromptDto | null>(null);
  const [skippingPromptId, setSkippingPromptId] = useState<string | null>(null);

  // Cache-first: render the last known orders immediately, revalidate in the
  // background. Skeleton only shows on a true cold load (no cached data).
  const ordersQuery = useCachedQuery<BuyerOrderSummary[]>({
    key: queryKeys.orders.list(user?.id),
    fetcher: () => BuyerOrdersApi.list(),
    policy: cachePolicies.defaultQuery,
    enabled: status === 'authenticated',
  });
  const items = ordersQuery.data ?? [];
  const loading = ordersQuery.isLoading;
  const refreshing = ordersQuery.isRefreshing;
  const error = ordersQuery.error
    ? ordersQuery.error.message || 'Unable to load orders right now.'
    : null;
  const refetchOrders = ordersQuery.refetch;
  const load = useCallback(() => {
    void refetchOrders({ forceRefresh: true });
  }, [refetchOrders]);

  // A mutation returns the newly resolved schedule. Patch the mounted history
  // directly, rather than making an approved extension wait for a route change
  // or the list query's next refetch before the day count becomes truthful.
  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return undefined;

    return subscribeOrderChanges((change) => {
      const summary = change.summary;
      if (!summary) return;
      queryClient.setQueryData<BuyerOrderSummary[]>(
        queryKeys.orders.list(user.id),
        (current) => (current ? applyOrderSummaryUpdate(current, summary) : current),
      );
    });
  }, [status, user?.id]);

  // Phase 5 scroll-proximity: warm the detail query for on-screen orders so a
  // tap opens instantly. Bounded by the prefetch budget (query lane) + dedupe.
  const handleViewableOrders = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: BuyerOrderSummary }> }) => {
      viewableItems.forEach(({ item }) => {
        prefetchQuery({
          key: queryKeys.orders.detail(item.id),
          fetcher: () => BuyerOrdersApi.getById(item.id),
          policy: cachePolicies.defaultQuery,
          priority: 'near',
        });
      });
    },
  ).current;
  const orderViewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const loadReviewPrompts = useCallback(async () => {
    if (status !== 'authenticated') {
      setReviewPrompts([]);
      return;
    }
    try {
      const prompts = await reviewApi.listReviewPrompts();
      setReviewPrompts(prompts);
    } catch (nextError) {
      const responseStatus = (nextError as { status?: number })?.status;
      if (responseStatus !== 401 && responseStatus !== 403) {
        toast.error('Could not load review prompts.');
      }
    }
  }, [status, toast]);

  useEffect(() => {
    void loadReviewPrompts();
  }, [loadReviewPrompts]);

  const submitPromptReview = useCallback(async (payload: SubmitReviewPayload) => {
    const saved = await reviewApi.submitReview(payload);
    setReviewPrompts((current) => current.filter((prompt) => prompt.id !== payload.promptId));
    setActiveReviewPrompt(null);
    toast.success(saved.status === 'PENDING_MODERATION' ? 'Review submitted for moderation.' : 'Review submitted.');
  }, [toast]);

  const skipPrompt = useCallback(async (prompt: ReviewPromptDto) => {
    setSkippingPromptId(prompt.id);
    try {
      await reviewApi.skipReviewPrompt(prompt.id);
      setReviewPrompts((current) => current.filter((item) => item.id !== prompt.id));
      toast.success('Review prompt skipped.');
    } catch (nextError) {
      toast.error('Could not skip review prompt. Please try again.');
    } finally {
      setSkippingPromptId(null);
    }
  }, [toast]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesKindFilter(item, kindFilter)) return false;
        if (!matchesStatusFilter(item, statusFilter)) return false;
        return matchesSearch(item, search);
      }),
    [items, kindFilter, search, statusFilter],
  );

  // The counts describe whichever kind is on screen — showing "3 active" over a
  // list filtered to Custom, when two of those three are standard orders, is a
  // number that contradicts the rows underneath it.
  const kindScopedItems = useMemo(
    () => items.filter((item) => matchesKindFilter(item, kindFilter)),
    [items, kindFilter],
  );

  const statItems = useMemo(
    () => [
      { key: 'all' as const, label: 'Total', value: kindScopedItems.length, tint: 'primary' as const },
      {
        key: 'pending' as const,
        label: 'Pending',
        value: kindScopedItems.filter(isPendingOrder).length,
        tint: 'warning' as const,
      },
      {
        key: 'active' as const,
        label: 'Active',
        value: kindScopedItems.filter(isActiveOrder).length,
        tint: 'primary' as const,
      },
      {
        key: 'completed' as const,
        label: 'Done',
        value: kindScopedItems.filter(isCompletedOrder).length,
        tint: 'success' as const,
      },
      {
        key: 'cancelled' as const,
        label: 'Closed',
        value: kindScopedItems.filter(isCancelledOrder).length,
        tint: 'danger' as const,
      },
    ],
    [kindScopedItems],
  );

  const kindTabs = useMemo(
    () =>
      KIND_FILTERS.map((option) => ({
        key: option.key,
        label: option.label,
        count: option.key === 'all' ? items.length : items.filter((item) => item.kind === option.key).length,
      })),
    [items],
  );

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
            <Button title="Sign in" onPress={() => drillDownPush('/(auth)/login' as any)} />
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
        showsVerticalScrollIndicator={false}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <OrderListRow
            order={item}
            last={index === filteredItems.length - 1}
            onPressIn={() =>
              prefetchDetailOnPress({
                href: { pathname: '/orders/[orderId]', params: { orderId: item.id } },
                hero: { src: item.thumbnail },
              })
            }
            onPress={() =>
              drillDownPush({ pathname: '/orders/[orderId]', params: { orderId: item.id } } as any)
            }
          />
        )}
        onViewableItemsChanged={handleViewableOrders}
        viewabilityConfig={orderViewabilityConfig}
        // No separator view: each row draws its own rule, so the last one can
        // leave it off rather than ending the list on a line to nowhere.
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load();
              void loadReviewPrompts();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            {reviewPrompts.length > 0 ? (
              <View style={styles.promptStack}>
                <AppText variant="bodyBold">Reviews waiting for you</AppText>
                <AppText variant="captionRegular" tone="muted">
                  These prompts are optional and only appear after completed purchases.
                </AppText>
                {reviewPrompts.map((prompt) => (
                  <ReviewPromptCard
                    key={prompt.id}
                    prompt={prompt}
                    onReview={setActiveReviewPrompt}
                    onSkip={(item) => void skipPrompt(item)}
                    skipping={skippingPromptId === prompt.id}
                  />
                ))}
              </View>
            ) : null}

            {/* Counts ARE the status filter. A number reads faster than a word,
                and a second control saying the same thing is a second control to
                keep in sync. Square, divided by hairlines, one band. */}
            <View style={[styles.statBand, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              {statItems.map((stat, index) => {
                const selected = statusFilter === stat.key;
                // The cap is a View and takes the colour; the numeral takes the
                // matching AppText tone.
                const capColor =
                  stat.tint === 'success'
                    ? theme.colors.success
                    : stat.tint === 'danger'
                      ? theme.colors.danger
                      : stat.tint === 'warning'
                        ? theme.colors.warning
                        : theme.colors.primary;
                return (
                  <Pressable
                    key={stat.key}
                    onPress={() => setStatusFilter(stat.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${stat.label}, ${stat.value}`}
                    style={({ pressed }) => [
                      styles.statCell,
                      index > 0 ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border } : null,
                      selected ? { backgroundColor: theme.colors.surfaceAlt } : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {/* The selected cell is capped by its own tint, so the band
                        shows which slice of the history is on screen. */}
                    <View style={[styles.statCap, { backgroundColor: selected ? capColor : 'transparent' }]} />
                    <AppText variant="h2" tone={stat.value > 0 ? stat.tint : 'muted'} numberOfLines={1}>
                      {stat.value}
                    </AppText>
                    <AppText variant="statLabel" tone={selected ? 'default' : 'muted'} numberOfLines={1}>
                      {stat.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <SegmentedTabs
              items={kindTabs}
              value={kindFilter}
              onChange={setKindFilter}
              style={styles.kindTabs}
            />

            <Input label="Search orders" hideLabel placeholder="Search orders, brands, or IDs" value={search} onChangeText={setSearch} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <OrdersLoadingState />
          ) : error ? (
            // Classified from the raw error so an offline device is told it is
            // offline, rather than "could not load orders".
            <ErrorScreenState
              error={ordersQuery.error}
              message={error}
              onRetry={() => void load()}
            />
          ) : (
            <EmptyState
              filtered={items.length > 0}
              onClear={() => {
                setStatusFilter('all');
                setKindFilter('all');
                setSearch('');
              }}
            />
          )
        }
        ListFooterComponent={
          loading && filteredItems.length > 0 ? (
            <View style={styles.footerLoading}>
              <MuseLoader size={20} />
            </View>
          ) : null
        }
      />
      <ReviewFormSheet
        visible={Boolean(activeReviewPrompt)}
        mode="create"
        prompt={activeReviewPrompt}
        onClose={() => setActiveReviewPrompt(null)}
        onSubmit={(payload) => submitPromptReview(payload as SubmitReviewPayload)}
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
  promptStack: {
    flexBasis: '100%',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  /**
   * A BAND, not a row of cards. Five counts that belong to one history read as
   * one object divided into parts; five rounded pills read as five things.
   * Square corners and shared hairlines are what make the difference.
   */
  statBand: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
    gap: 2,
  },
  /** The 2px rule along the top edge of the selected cell. */
  statCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  kindTabs: {
    marginHorizontal: -tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  skeletonList: {
    marginTop: tokens.spacing.xs,
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
