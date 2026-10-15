import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { useAuth } from '@/src/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  SettingsHeader,
  SettingsSection,
  SettingsStateCard,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { formatMoney } from '@/src/utils/money';
import { MuseLoader } from '@/components/ui/MuseLoader';

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function formatCurrency(amount: number, currency = 'NGN') {
  return formatMoney(amount, currency);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function PaymentOrderRow({ order }: { order: BuyerOrderSummary }) {
  const { theme } = useTheme();
  const paid = order.paymentStatus.toUpperCase() === 'PAID';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open order ${order.title}`}
      onPress={() => drillDownPush({ pathname: '/orders/[orderId]', params: { orderId: order.id } } as never)}
      style={({ pressed }) => [styles.orderRow, { borderColor: theme.colors.border }, pressed ? styles.pressed : null]}
    >
      <View style={styles.orderCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {order.title}
        </AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {order.brandName} / {formatDate(order.createdAt)}
        </AppText>
      </View>
      <View style={styles.orderMeta}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {formatCurrency(order.amount, order.currency)}
        </AppText>
        <AppText variant="captionBold" tone={paid ? 'success' : 'warning'} numberOfLines={1}>
          {order.paymentStatus}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function PaymentSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<BuyerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      setOrders(await BuyerOrdersApi.list());
    } catch (error) {
      setLoadError(extractErrorMessage(error, 'Unable to load payment history.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadOrders();
  }, [loadOrders, status]);

  const paymentSummary = useMemo(() => {
    const paidOrders = orders.filter((order) => order.paymentStatus.toUpperCase() === 'PAID');
    const pendingOrders = orders.filter((order) => order.paymentStatus.toUpperCase() !== 'PAID');
    const totalPaid = paidOrders.reduce((sum, order) => sum + order.amount, 0);

    return {
      paidCount: paidOrders.length,
      pendingCount: pendingOrders.length,
      totalPaid,
      currency: paidOrders[0]?.currency ?? orders[0]?.currency ?? 'NGN',
      recent: orders.slice(0, 3),
    };
  }, [orders]);

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Payment settings" subtitle="Checkout and payment history" />
        <View style={styles.stateWrap}>
          <MuseLoader size={20} />
          <AppText variant="body" tone="muted">
            Loading payment settings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Payment settings" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Payment settings and receipts are tied to your account."
            actionTitle="Sign in"
            onAction={() => drillDownPush('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Payment settings" subtitle="Checkout and payment history" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Checkout">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Backend-verified checkout</AppText>
            <AppText variant="captionRegular" tone="muted">
              WIEZ initializes payment from your backend bag and only updates order state after backend and provider verification.
            </AppText>
            <View style={styles.actionRow}>
              <View style={styles.actionSlot}>
                <Button title="Open checkout" onPress={() => drillDownPush('/checkout' as never)} />
              </View>
              <View style={styles.actionSlot}>
                <Button title="View orders" variant="secondary" onPress={() => drillDownPush('/orders' as never)} />
              </View>
            </View>
          </Card>
        </SettingsSection>

        <SettingsSection title="Payment summary">
          <Card padding="lg" style={styles.card}>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryTile, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="h2">{paymentSummary.paidCount}</AppText>
                <AppText variant="captionRegular" tone="muted">Paid orders</AppText>
              </View>
              <View style={[styles.summaryTile, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="h2">{paymentSummary.pendingCount}</AppText>
                <AppText variant="captionRegular" tone="muted">Pending</AppText>
              </View>
            </View>
            <AppText variant="captionRegular" tone="muted">
              Paid total shown from loaded orders: {formatCurrency(paymentSummary.totalPaid, paymentSummary.currency)}.
            </AppText>
          </Card>
        </SettingsSection>

        <SettingsSection title="Recent payments">
          {loadError ? (
            <SettingsStateCard
              title="Could not load payments"
              body={loadError}
              actionTitle="Retry"
              onAction={() => void loadOrders()}
            />
          ) : paymentSummary.recent.length === 0 ? (
            <SettingsStateCard
              title="No payments yet"
              body="Your checkout and order payment states will appear here after your first order."
              actionTitle="Open checkout"
              onAction={() => drillDownPush('/checkout' as never)}
            />
          ) : (
            <Card padding="lg" style={styles.card}>
              {paymentSummary.recent.map((order) => (
                <PaymentOrderRow key={order.id} order={order} />
              ))}
            </Card>
          )}
        </SettingsSection>

        <SettingsSection title="Saved cards">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Provider-managed cards only</AppText>
            <AppText variant="captionRegular" tone="muted">
              This mobile workspace does not expose a saved-card settings endpoint. Card entry stays inside the secure provider checkout flow.
            </AppText>
            <Button
              title="Read payment policy"
              variant="secondary"
              onPress={() => drillDownPush('/legal/payment-policy' as never)}
            />
          </Card>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    paddingTop: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionSlot: {
    flex: 1,
    minWidth: 0,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  summaryTile: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  orderRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
  },
  orderCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  orderMeta: {
    alignItems: 'flex-end',
    maxWidth: 116,
    gap: tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.82,
  },
});
