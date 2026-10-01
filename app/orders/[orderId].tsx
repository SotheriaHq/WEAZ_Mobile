import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { backOrNavigate, drillDownPush } from '@/src/utils/mobileNavigation';
import { OrderConversationButton } from '@/components/messaging/OrderConversationButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { BuyerOrdersApi, type BuyerOrderDetail, type BuyerOrderItem } from '@/src/api/BuyerOrdersApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useCachedQuery, cachePolicies } from '@/src/cache';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { formatMeasurementLabel } from '@/src/features/sizing/measurementCatalog';
import { readRecommendationSnapshot } from '@/src/utils/sizeRecommendation';
import { formatMoney } from '@/src/utils/money';

function formatCurrency(amount: number, currency = 'NGN') {
  // `formatMoney` returns null for an unformattable amount; the tiles need a
  // string, and an em dash is the honest rendering of "no figure".
  return formatMoney(amount, currency) ?? '—';
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

/** `IN_PRODUCTION` is a database value, not a sentence. */
function humanizeToken(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (!/[_A-Z]/.test(raw) || /\s/.test(raw)) return raw;
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** The stages a buyer sees, in order, so progress can be drawn as a fraction. */
const BUYER_STAGE_ORDER = [
  'ORDER_PLACED',
  'ORDER_RECEIVED',
  'FABRIC_AND_PIECE_PURCHASE_GATHERING',
  'DESIGN_MODE',
  'FINAL_TOUCHES_AND_PACKAGING',
  'READY_FOR_DELIVERY',
];

function stageFraction(stage?: string | null) {
  const index = BUYER_STAGE_ORDER.indexOf(String(stage ?? '').toUpperCase());
  if (index < 0) return null;
  return (index + 1) / BUYER_STAGE_ORDER.length;
}

/**
 * One metric, as an object on the card rather than a line of text on it.
 *
 * The fill, the edge and the radius are what stop four numbers in a row reading
 * as a paragraph — the "everything is flat" complaint. `progress` draws the
 * stage as a bar under the label, because a stage name alone never says how far
 * through it is.
 */
function StatTile({
  label,
  value,
  tone = 'default',
  emphasis = false,
  marker,
  progress,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary';
  emphasis?: boolean;
  marker?: string;
  progress?: number | null;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.statTile,
        { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
      ]}
    >
      <AppText variant="statLabel" tone="muted" numberOfLines={1}>
        {label.toUpperCase()}
      </AppText>
      <View style={styles.statValueRow}>
        {marker ? <AppText variant="small">{marker}</AppText> : null}
        <AppText
          variant={emphasis ? 'h3' : 'bodyBold'}
          tone={tone === 'primary' ? 'primary' : 'default'}
          numberOfLines={1}
          style={styles.statValueText}
        >
          {value}
        </AppText>
      </View>
      {progress != null ? (
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.primarySoft }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.colors.primary,
                width: `${Math.round(Math.min(1, Math.max(0.08, progress)) * 100)}%`,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
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
            <View style={[StyleSheet.absoluteFill, styles.thumbFallback]}>
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
  const params = useLocalSearchParams<{
    orderId?: string | string[];
    kind?: string | string[];
  }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const kindParam = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const preferKind =
    kindParam === 'CUSTOM' || kindParam === 'STANDARD'
      ? kindParam
      : undefined;

  const [saving, setSaving] = useState(false);

  // Cache-first: a previously viewed order paints instantly, then revalidates.
  // `prefer` avoids a guaranteed 404 RTT when the notification already knows the kind.
  const orderQuery = useCachedQuery<BuyerOrderDetail>({
    key: queryKeys.orders.detail(orderId, preferKind),
    fetcher: () =>
      BuyerOrdersApi.getById(orderId as string, preferKind ? { prefer: preferKind } : undefined),
    policy: cachePolicies.defaultQuery,
    enabled: status === 'authenticated' && Boolean(orderId),
  });
  const order = orderQuery.data ?? null;
  const loading = orderQuery.isLoading;
  const error = !orderId
    ? 'Order not found.'
    : orderQuery.error
      ? orderQuery.error.message || 'Unable to load this order right now.'
      : null;
  const refetchOrder = orderQuery.refetch;
  const mutateOrder = orderQuery.mutate;
  const load = useCallback(() => {
    void refetchOrder({ forceRefresh: true });
  }, [refetchOrder]);

  /**
   * A request for more time waiting on this shopper.
   *
   * Nothing on this screen mentioned extensions before, which is why tapping
   * "your maker needs more time" landed somewhere with no answer to give.
   */
  const openExtension = useMemo(() => {
    if (!order || order.kind !== 'CUSTOM') return null;
    return (
      order.extensionRequests.find((entry) => entry.buyerResponseStatus === 'OPEN') ??
      null
    );
  }, [order]);

  /** WIEZ's own notes on the order — read-only, no reply path. */
  const adminNotices = useMemo(() => {
    if (!order || order.kind !== 'CUSTOM') return [];
    return order.timelineEvents
      .filter((event) => {
        if (event.actorType.toUpperCase() !== 'ADMIN') return false;
        const type = event.eventType.toUpperCase();
        if (type === 'ADMIN_NOTICE_SENT') {
          const audience = String(event.payload.audience ?? '').toUpperCase();
          // A note written to the brand alone is not the shopper's to read.
          return audience === 'BUYER' || audience === 'BOTH';
        }
        return type === 'ADMIN_INTERVENTION_RESOLVED';
      })
      .slice(0, 5);
  }, [order]);

  const interventionOpen = Boolean(
    order?.kind === 'CUSTOM' &&
      order.adminInterventionAt &&
      !order.adminInterventionResolvedAt,
  );

  const handleAckNotices = useCallback(async () => {
    if (!order || order.kind !== 'CUSTOM' || saving) return;
    setSaving(true);
    try {
      const updated = await BuyerOrdersApi.ackAdminNotices(order.id);
      mutateOrder(() => updated);
    } catch {
      toast.error('Could not update these notices. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [order, saving, toast, mutateOrder]);

  /** The measurement snapshot, as labelled tiles. Six fit a phone comfortably. */
  const measurementTiles = useMemo(() => {
    if (!order || order.kind !== 'CUSTOM') return [];
    return Object.entries(order.measurementSnapshot)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({
        key,
        label: formatMeasurementLabel(key),
        value: `${value} in`,
      }));
  }, [order]);

  /**
   * Whether the delivery promise is still ahead of us. "On track" that keeps
   * saying "on track" after the date has passed is worse than saying nothing.
   */
  const deliveryTrack = useMemo((): {
    label: string;
    tone: 'primary' | 'danger' | 'muted' | 'success';
  } => {
    if (!order || order.kind !== 'CUSTOM' || !order.promisedDeliveryAt) {
      return { label: 'Not scheduled', tone: 'muted' };
    }
    if (order.status.toUpperCase().includes('COMPLET')) {
      return { label: 'Delivered', tone: 'success' };
    }
    const due = new Date(order.promisedDeliveryAt).getTime();
    if (Number.isNaN(due)) return { label: 'Not scheduled', tone: 'muted' };
    if (due < Date.now()) return { label: 'Overdue', tone: 'danger' };
    return { label: 'On track', tone: 'primary' };
  }, [order]);

  const progressFraction = useMemo(
    () => (order?.kind === 'CUSTOM' ? stageFraction(order.currentProgressStage) : null),
    [order],
  );

  const paymentSettled = Boolean(order && order.paymentStatus.toUpperCase() === 'PAID');

  const confirmable = useMemo(() => Boolean(order && canConfirmDelivery(order)), [order]);
  const heroThumbnail = order?.kind === 'STANDARD'
    ? order.items[0]?.thumbnail ?? null
    : order?.sourcePrimaryMediaUrl ?? null;

  const handleConfirmDelivery = useCallback(async () => {
    if (!order || saving) return;

    setSaving(true);
    try {
      const updated = await BuyerOrdersApi.confirmDelivery(order);
      mutateOrder(() => updated);
      toast.success('Delivery confirmation submitted.');
    } catch (nextError) {
      toast.error('Could not confirm delivery. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [order, saving, toast, mutateOrder]);

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
            <Button title="Sign in" onPress={() => drillDownPush('/(auth)/login' as any)} />
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
            <Button title="Back to orders" variant="secondary" onPress={() => backOrNavigate('/orders' as any)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const tone = statusTone(order.status);
  const statusDotColor =
    tone === 'danger'
      ? theme.colors.danger
      : tone === 'success'
        ? theme.colors.success
        : tone === 'warning'
          ? theme.colors.warning
          : theme.colors.primary;
  const statusTextTone =
    tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'default';
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
        {/*
          An open request for more time goes above the artwork. It is the only
          thing on this screen waiting on the shopper, and the decision itself
          gets its own screen so the notification can land straight on it.
        */}
        {openExtension ? (
          <Card
            padding="lg"
            style={[
              styles.noticeCard,
              { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
            ]}
          >
            <AppText variant="captionBold" tone="primary">
              ⏳ MORE TIME REQUESTED
            </AppText>
            <AppText variant="subtitle">
              {order.brandName} needs {openExtension.requestedExtraDays} more day
              {openExtension.requestedExtraDays === 1 ? '' : 's'}
            </AppText>
            <AppText variant="small" tone="muted" numberOfLines={3}>
              {openExtension.reason}
            </AppText>
            <Button
              title="Review the request"
              onPress={() =>
                drillDownPush(
                  `/orders/extension/${openExtension.id}?orderId=${order.id}` as never,
                )
              }
            />
          </Card>
        ) : null}

        {adminNotices.length > 0 || interventionOpen ? (
          <Card
            padding="lg"
            style={[
              styles.noticeCard,
              { borderColor: theme.colors.warning, backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <AppText variant="captionBold" tone="warning">
              {interventionOpen ? '🛟 WIEZ IS REVIEWING THIS ORDER' : '📣 NOTES FROM WIEZ'}
            </AppText>
            <AppText variant="small" tone="muted">
              {interventionOpen
                ? 'Someone at WIEZ is working on this with your maker. You will hear from us here.'
                : 'Updates from WIEZ about this order. You do not need to reply.'}
            </AppText>
            {adminNotices.map((notice) => {
              const body = typeof notice.payload.note === 'string' ? notice.payload.note : '';
              return (
                <View
                  key={notice.id}
                  style={[styles.noticeRow, { backgroundColor: theme.colors.surface }]}
                >
                  <AppText variant="small">
                    {body || 'WIEZ updated this order.'}
                  </AppText>
                  <AppText variant="captionRegular" tone="muted">
                    {formatDate(notice.createdAt)}
                  </AppText>
                </View>
              );
            })}
            {order.kind === 'CUSTOM' && order.hasUnreadBuyerAdminNotice ? (
              <Button
                title="Mark as read"
                variant="secondary"
                size="sm"
                loading={saving}
                onPress={() => void handleAckNotices()}
              />
            ) : null}
          </Card>
        ) : null}

        {/*
          The overview, as one card with depth rather than four flat rows.

          Three things carry the weight: the piece's own image at a size worth
          looking at, a status pill that states the stage instead of printing a
          raw enum in caption grey, and four metric TILES — each with its own
          fill and edge, so the numbers read as objects on the card instead of
          text floating on it.
        */}
        <Card variant="elevated" padding="lg" style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.badgeRow}>
              <View style={[styles.pill, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}>
                <AppText variant="badgeLabel" tone="primary">{order.kind === 'STANDARD' ? 'Standard' : 'Custom'}</AppText>
              </View>
              <View style={[styles.pill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="badgeLabel" tone="muted">Buyer view</AppText>
              </View>
            </View>
            <View
              style={[
                styles.statusPill,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
              <AppText variant="badgeLabel" tone={statusTextTone} numberOfLines={1}>
                {humanizeToken(order.status)}
              </AppText>
            </View>
          </View>

          <View style={styles.heroTitleRow}>
            <View style={[styles.heroThumb, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary }]}>
              <StableImage
                uri={heroThumbnail ?? undefined}
                containerStyle={styles.heroThumbFill}
                imageStyle={styles.heroThumbFill}
                fallback={
                  <View style={[StyleSheet.absoluteFill, styles.thumbFallback]}>
                    <AppText variant="subtitle">{order.kind === 'STANDARD' ? '🧵' : '✂️'}</AppText>
                  </View>
                }
              />
            </View>
            <View style={styles.heroCopy}>
              <AppText variant="h2" numberOfLines={2}>{order.title}</AppText>
              <AppText variant="small" tone="muted" numberOfLines={1}>{order.brandName}</AppText>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <StatTile label="Amount" value={formatCurrency(order.amount, order.currency)} emphasis />
            <StatTile label="Placed" value={formatDate(order.createdAt) || '—'} />
            <StatTile
              label="Progress"
              value={humanizeToken(progressLabel ?? 'Placed')}
              tone="primary"
              progress={progressFraction}
            />
            <StatTile
              label="Payment"
              value={humanizeToken(order.paymentStatus)}
              marker={paymentSettled ? '✅' : '⏳'}
            />
          </View>
        </Card>

        <OrderConversationButton orderId={order.id} kind={order.kind} brandName={order.brandName} />

        {confirmable ? (
          <Button title={saving ? 'Confirming…' : 'Confirm delivery'} onPress={() => void handleConfirmDelivery()} disabled={saving} />
        ) : null}

        <Card variant="elevated" padding="lg" style={styles.sectionCard}>
          <View style={[styles.sectionHeader, styles.sectionHeaderRule, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.sectionHeaderCopy}>
              <AppText variant="cardTitle">Order items</AppText>
              {order.kind === 'CUSTOM' ? (
                <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                  Source: {order.sourceType} · {order.sourceId.slice(0, 8)}…
                </AppText>
              ) : null}
            </View>
            <View style={[styles.countChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="badgeLabel" tone="muted">
                {order.kind === 'STANDARD' ? order.itemCount : order.measurementCount}{' '}
                {order.kind === 'STANDARD' ? 'item' : 'measurement'}
                {(order.kind === 'STANDARD' ? order.itemCount : order.measurementCount) === 1 ? '' : 's'}
              </AppText>
            </View>
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
            <>
              {/*
                The measurements themselves, not a count of them.
                `measurementSnapshot` has been in the payload all along and the
                screen only ever said "6 points" — the one thing a shopper
                opening a bespoke order wants to check is what the maker is
                cutting to.
              */}
              {measurementTiles.length > 0 ? (
                <View style={styles.measurementGrid}>
                  {measurementTiles.map((entry) => (
                    <View
                      key={entry.key}
                      style={[
                        styles.measurementTile,
                        { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                      ]}
                    >
                      <AppText variant="statLabel" tone="muted" numberOfLines={1}>
                        {entry.label.toUpperCase()}
                      </AppText>
                      <AppText variant="bodyBold" numberOfLines={1}>{entry.value}</AppText>
                    </View>
                  ))}
                </View>
              ) : (
                <AppText variant="body" tone="muted">
                  No measurement values are stored on this order.
                </AppText>
              )}

              <View
                style={[
                  styles.promiseRow,
                  { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                ]}
              >
                <View style={styles.promiseCopy}>
                  <AppText variant="statLabel" tone="muted">DELIVERY PROMISE</AppText>
                  <AppText variant="bodyBold">
                    {formatDate(order.promisedDeliveryAt) || 'Pending'}
                  </AppText>
                  {order.originalPromisedDeliveryAt ? (
                    <AppText variant="captionRegular" tone="muted">
                      Originally {formatDate(order.originalPromisedDeliveryAt)}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="badgeLabel" tone={deliveryTrack.tone}>
                  {deliveryTrack.label}
                </AppText>
              </View>
            </>
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
  noticeCard: {
    gap: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    maxWidth: '55%',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  statValueText: { flexShrink: 1 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: tokens.spacing.xs,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  sectionHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionHeaderRule: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: tokens.spacing.md,
  },
  countChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  measurementTile: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 0,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
    gap: 2,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  promiseCopy: { flex: 1, minWidth: 0, gap: 2 },
  noticeRow: {
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
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
    backgroundColor: tokens.scrim(0.03),
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
