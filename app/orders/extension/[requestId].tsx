/**
 * The shopper's decision on a request for more time.
 *
 * Mobile had NOTHING for this. The extension notification routed to
 * `/orders/[orderId]`, which never mapped `extensionRequests` at all, so a
 * shopper who tapped "your maker needs 2 more days" arrived at an order screen
 * with no mention of the request and no way to answer it. The brand waited on an
 * answer that could not be given.
 *
 * It is a screen rather than a sheet so the push notification can land directly
 * on the decision, and so the consequence of each answer has room to be stated
 * before either button is pressed — the common misreading of "Decline" is that
 * it cancels the order and refunds the money.
 *
 * Counters exist in the API and are deliberately not offered here. Two answers is
 * the whole decision; a third option with a number picker turns a phone screen
 * into a form, and the web console keeps the counter path for the rare case.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BuyerOrdersApi,
  type BuyerCustomOrderDetail,
  type BuyerExtensionRequest,
} from '@/src/api/BuyerOrdersApi';
import { useAuth } from '@/src/auth/AuthContext';
import { writeCachedQueryData } from '@/src/cache';
import { queryClient } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { backOrNavigate } from '@/src/utils/mobileNavigation';

type Decision = 'ACCEPTED' | 'REJECTED';

function targetLabel(targetType: string) {
  if (targetType === 'DELIVERY') return 'delivery';
  if (targetType === 'BOTH') return 'production and delivery';
  return 'production';
}

function dayLabel(days: number) {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** A deadline a shopper has to feel, not a timestamp they have to subtract. */
function formatCountdown(value: string | null): string | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'This request has expired';
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'Less than an hour left to answer';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left to answer`;
  const days = Math.round(hours / 24);
  return `${dayLabel(days)} left to answer`;
}

export default function ExtensionDecisionScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string; orderId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';

  const [order, setOrder] = useState<BuyerCustomOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState<Decision | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setError('This link is missing the order it belongs to.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await BuyerOrdersApi.getById(orderId, { prefer: 'CUSTOM' });
      if (detail.kind !== 'CUSTOM') {
        setError('Only custom orders can be extended.');
        return;
      }
      setOrder(detail);
    } catch (loadError: any) {
      setError(
        loadError?.response?.data?.message || 'This request could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const request: BuyerExtensionRequest | null = useMemo(() => {
    if (!order) return null;
    return order.extensionRequests.find((entry) => entry.id === requestId) ?? null;
  }, [order, requestId]);

  const countdown = useMemo(
    () => formatCountdown(request?.respondByAt ?? null),
    [request?.respondByAt],
  );

  const respond = useCallback(
    async (decision: Decision) => {
      if (!order || !request) return;
      setSubmitting(decision);
      try {
        const updated = await BuyerOrdersApi.respondToExtension(order.id, request.id, {
          response: decision,
          note: note.trim() || undefined,
        });
        setOrder(updated);
        /*
          Publish the answer to the order screen BEFORE routing back to it.

          This screen loads the order itself; the order screen reads it through
          `useCachedQuery`. Without this write, going back re-rendered that
          screen's own cached copy — which still had the request open — so a
          shopper who had just declined was shown the request again, told they
          had already answered when they opened it, and had to refresh twice
          before the notice cleared.

          Both key variants: the screen keys on the `kind` route param, which is
          present when a notification deep-linked into it and absent when the
          shopper tapped through from the order.
        */
        writeCachedQueryData(queryKeys.orders.detail(order.id, 'CUSTOM'), updated);
        writeCachedQueryData(queryKeys.orders.detail(order.id), updated);
        // The list carries a countdown that an approved extension moves, so it
        // has to be refetched rather than left to its own staleness window.
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.list() });

        toast.success(
          decision === 'ACCEPTED'
            ? 'Extra time granted. Your delivery date has moved.'
            : 'Declined. WIEZ is reviewing the order with your maker.',
        );
        backOrNavigate(`/orders/${order.id}` as never);
      } catch (submitError: any) {
        toast.error(
          submitError?.response?.data?.message ||
            'That answer could not be saved. Try again.',
        );
      } finally {
        setSubmitting(null);
      }
    },
    [note, order, request, toast],
  );

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <AppBackButton fallbackHref="/orders" />
      <AppText variant="bodyBold">More time requested</AppText>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        {header}
        <View style={styles.centerWrap}>
          <Card padding="lg" style={styles.centerCard}>
            <AppText variant="subtitle">Sign in required</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              Sign in to answer your maker's request.
            </AppText>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        {header}
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Card padding="lg" style={styles.card}>
            <Skeleton width="70%" height={22} borderRadius={6} />
            <Skeleton width="45%" height={14} borderRadius={6} />
            <Skeleton width="100%" height={72} borderRadius={14} />
            <Skeleton width="100%" height={48} borderRadius={24} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        {header}
        <View style={styles.centerWrap}>
          <Card padding="lg" style={styles.centerCard}>
            <AppText variant="subtitle">Could not open this request</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              {error || 'This request is unavailable.'}
            </AppText>
            <Button title="Retry" onPress={() => void load()} />
            <Button
              title="Back to orders"
              variant="secondary"
              onPress={() => backOrNavigate('/orders' as never)}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // A request that is no longer open is a dead end for the decision, but the
  // shopper arrived here from a notification and is owed an explanation rather
  // than a blank screen.
  if (!request || request.buyerResponseStatus !== 'OPEN') {
    const settled = request?.buyerResponseStatus ?? 'RESOLVED';
    const copy =
      settled === 'ACCEPTED'
        ? 'You already granted this extra time.'
        : settled === 'REJECTED'
          ? 'You already declined this request. WIEZ is reviewing the order.'
          : settled === 'EXPIRED'
            ? 'This request expired before it was answered. No extra time was granted and WIEZ is looking into it.'
            : settled === 'VOIDED'
              ? 'This is no longer needed — your maker moved the order on.'
              : 'This request has already been settled.';

    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        {header}
        <View style={styles.centerWrap}>
          <Card padding="lg" style={styles.centerCard}>
            <AppText variant="subtitle">Already settled</AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              {copy}
            </AppText>
            <Button
              title="Open the order"
              onPress={() => backOrNavigate(`/orders/${order.id}` as never)}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const busy = submitting !== null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card padding="lg" style={styles.card}>
          <View style={styles.titleRow}>
            <AppText variant="h2" style={styles.titleIcon}>
              ⏳
            </AppText>
            <View style={styles.titleCopy}>
              <AppText variant="subtitle">
                {order.brandName} needs {dayLabel(request.requestedExtraDays)} more
              </AppText>
              <AppText variant="small" tone="muted">
                On {targetLabel(request.targetType)} for {order.title}
              </AppText>
            </View>
          </View>

          {countdown ? (
            <View
              style={[
                styles.countdown,
                { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border },
              ]}
            >
              <AppText variant="captionBold" tone="primary">
                {countdown}
              </AppText>
            </View>
          ) : null}

          <View
            style={[
              styles.quote,
              { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
            ]}
          >
            <AppText variant="statLabel" tone="muted">
              WHY THEY ARE ASKING
            </AppText>
            <AppText variant="body" style={styles.quoteBody}>
              {request.reason}
            </AppText>
          </View>

          {/*
            Stated before the buttons, not after. A shopper who believes Decline
            is a cancel button will press it expecting a refund.
          */}
          <AppText variant="small" tone="muted">
            Granting moves your delivery date by {dayLabel(request.requestedExtraDays)}.
            Declining does not cancel or refund your order — it brings WIEZ in to
            sort the delay out with your maker. A note is optional either way.
          </AppText>

          <Input
            label="Add a note (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            placeholder="Anything your maker or WIEZ should know"
          />

          <Button
            title={`Grant ${dayLabel(request.requestedExtraDays)}`}
            onPress={() => void respond('ACCEPTED')}
            loading={submitting === 'ACCEPTED'}
            disabled={busy}
          />
          <Button
            title="Decline"
            variant="outline"
            onPress={() => void respond('REJECTED')}
            loading={submitting === 'REJECTED'}
            disabled={busy}
          />
        </Card>

        {order.extensionPolicy.approvedExtensionCount > 0 ? (
          <Card padding="lg" style={styles.card}>
            <AppText variant="captionBold">Already granted</AppText>
            <AppText variant="small" tone="muted">
              You have given this order{' '}
              {dayLabel(order.extensionPolicy.totalExtensionDaysGranted)} across{' '}
              {order.extensionPolicy.approvedExtensionCount} request
              {order.extensionPolicy.approvedExtensionCount === 1 ? '' : 's'}. A maker
              may ask at most {order.extensionPolicy.maxApprovedExtensions} times, and
              never for more than {dayLabel(order.extensionPolicy.maxTotalDays)} in
              total.
            </AppText>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  card: { gap: tokens.spacing.md },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  centerCard: { width: '100%', gap: tokens.spacing.md },
  centerText: { textAlign: 'center' },
  titleRow: { flexDirection: 'row', gap: tokens.spacing.md },
  titleIcon: { lineHeight: 28 },
  titleCopy: { flex: 1, minWidth: 0, gap: tokens.spacing.xs },
  countdown: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  quote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  quoteBody: { flexShrink: 1 },
});
