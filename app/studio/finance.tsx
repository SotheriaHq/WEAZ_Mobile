import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import {
  brandFinanceApi,
  type BrandFinanceBundle,
  type BrandHeldFund,
  type BrandIncomingTransaction,
  type BrandPayoutRow,
} from '@/src/api/BrandFinanceApi';
import { useAuth } from '@/src/auth/AuthContext';
import { canReadPayouts, getActiveBrandId } from '@/src/auth/brandAccess';
import { useCachedQuery, cachePolicies } from '@/src/cache';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const MIN_PAYOUT = 5000;

const formatMoney = (amount: number, currency = 'NGN') => {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency || 'NGN',
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const humanize = (value?: string | null) =>
  String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .trim() || '—';

const holdTypeLabel = (value?: string | null) => {
  const n = String(value || '').toUpperCase();
  if (n === 'CUSTOM_ORDER') return 'Custom order';
  if (n === 'STANDARD_ORDER') return 'Standard order';
  return humanize(value) || 'Order hold';
};

const stageLabel = (stage?: string | null) => humanize(stage || 'PAYMENT');

const statusTone = (
  status: string,
  theme: { colors: { success: string; danger: string; warning: string; primary: string; textSecondary: string } },
) => {
  const s = status.toUpperCase();
  if (s === 'PAID' || s === 'RELEASED') return theme.colors.success;
  if (s.includes('FAIL') || s === 'REJECTED' || s === 'FROZEN') return theme.colors.danger;
  if (s.includes('PENDING') || s === 'HELD' || s.includes('PROCESSING')) {
    return theme.colors.warning;
  }
  return theme.colors.textSecondary;
};

export default function StudioFinanceScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const brandId = getActiveBrandId(user);
  const canRead = canReadPayouts(user, brandId);
  const [requesting, setRequesting] = useState(false);

  const financeQuery = useCachedQuery<BrandFinanceBundle>({
    key: queryKeys.brandFinance.bundle(brandId),
    fetcher: () => brandFinanceApi.loadBundle(brandId as string),
    policy: cachePolicies.defaultQuery,
    enabled: Boolean(brandId) && canRead,
  });

  const data = financeQuery.data;
  const loading = financeQuery.isLoading;
  const refreshing = financeQuery.isRefreshing;
  const overview = data?.overview;
  const currency = overview?.currency || 'NGN';
  const available = overview?.availableBalance ?? 0;

  const heldTotal = useMemo(
    () =>
      (data?.heldFunds ?? []).reduce(
        (sum, hold) => sum + Number(hold.heldNetAmount || 0),
        0,
      ),
    [data?.heldFunds],
  );

  const onRefresh = useCallback(() => {
    void financeQuery.refetch();
  }, [financeQuery]);

  const handleRequestPayout = useCallback(async () => {
    if (!brandId) return;
    if (available < MIN_PAYOUT) {
      toast.error(`Minimum payout amount is ${formatMoney(MIN_PAYOUT, currency)}`);
      return;
    }
    setRequesting(true);
    try {
      await brandFinanceApi.requestPayout(brandId, available);
      toast.success('Payout requested successfully');
      void financeQuery.refetch();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Failed to request payout',
      );
    } finally {
      setRequesting(false);
    }
  }, [available, brandId, currency, financeQuery, toast]);

  if (!brandId) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Header
          title="Finance"
          left={<AppBackButton onPress={() => router.back()} />}
        />
        <View style={styles.centered}>
          <AppText variant="body" tone="secondary">
            No active brand workspace found.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!canRead) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Header
          title="Finance"
          left={<AppBackButton onPress={() => router.back()} />}
        />
        <View style={styles.centered}>
          <AppText variant="body" tone="secondary" style={styles.centerText}>
            You do not have permission to view brand payouts. Ask the brand owner for access.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Header
        title="Finance"
        subtitle="Balances, held funds, and payouts"
        left={<AppBackButton onPress={() => router.back()} />}
      />

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="caption" tone="secondary" style={styles.loadingHint}>
            Loading finance (settlement self-heal may run briefly)…
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, tokens.spacing.lg) + tokens.spacing.xl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {financeQuery.error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="body" tone="danger">
                {(financeQuery.error as any)?.response?.data?.message ||
                  (financeQuery.error as Error)?.message ||
                  'Unable to load finance data. Pull to retry.'}
              </AppText>
            </View>
          ) : null}

          {/* Available balance hero */}
          <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="caption" tone="secondary" style={styles.heroLabel}>
              AVAILABLE BALANCE
            </AppText>
            <AppText variant="display" style={styles.heroAmount}>
              {formatMoney(available, currency)}
            </AppText>
            {overview?.negativeBalance ? (
              <AppText variant="caption" tone="danger" style={{ marginTop: 4 }}>
                Negative balance — new releases will offset recovery automatically.
              </AppText>
            ) : null}
            <View style={styles.heroActions}>
              <Button
                title={requesting ? 'Submitting…' : 'Request payout'}
                onPress={() => void handleRequestPayout()}
                disabled={requesting || available < MIN_PAYOUT}
                loading={requesting}
              />
              <AppText variant="caption" tone="secondary">
                Min. {formatMoney(MIN_PAYOUT, currency)}
              </AppText>
            </View>
          </View>

          {/* Metric strip */}
          <View style={styles.metricsRow}>
            {[
              { label: 'Released', value: overview?.releasedBalance ?? 0 },
              { label: 'Reserved', value: overview?.reservedPayoutBalance ?? 0 },
              { label: 'Paid out', value: overview?.paidOutBalance ?? 0 },
              { label: 'Held', value: heldTotal },
            ].map((metric) => (
              <View
                key={metric.label}
                style={[
                  styles.metricCard,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <AppText variant="caption" tone="secondary">
                  {metric.label}
                </AppText>
                <AppText variant="subtitle" style={styles.metricValue}>
                  {formatMoney(metric.value, currency)}
                </AppText>
              </View>
            ))}
          </View>

          <AppText variant="caption" tone="secondary" style={styles.metaLine}>
            {overview?.totalOrders ?? 0} paid orders ·{' '}
            {overview?.activeEscrowHolds ?? 0} active holds ·{' '}
            {overview?.queuedCustomAllocations ?? 0} custom payout-eligible
          </AppText>

          {/* Held funds */}
          <SectionTitle title="Held funds" emoji="🔒" count={data?.heldFunds?.length ?? 0} />
          {(data?.heldFunds?.length ?? 0) === 0 ? (
            <EmptyCard theme={theme} message="No funds currently held in escrow." />
          ) : (
            data!.heldFunds.map((hold) => (
              <HeldCard key={hold.id} hold={hold} theme={theme} />
            ))
          )}

          {/* Incoming */}
          <SectionTitle title="Incoming credits" emoji="💸" count={data?.incoming?.length ?? 0} />
          {(data?.incoming?.length ?? 0) === 0 ? (
            <EmptyCard theme={theme} message="No incoming credits yet." />
          ) : (
            data!.incoming.map((tx) => (
              <IncomingCard key={tx.id} tx={tx} theme={theme} />
            ))
          )}

          {/* Payout history */}
          <SectionTitle title="Payout history" emoji="🏦" count={data?.payouts?.length ?? 0} />
          {(data?.payouts?.length ?? 0) === 0 ? (
            <EmptyCard theme={theme} message="No payout requests yet." />
          ) : (
            data!.payouts.map((payout) => (
              <PayoutCard key={payout.id} payout={payout} theme={theme} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionTitle({
  title,
  emoji,
  count,
}: {
  title: string;
  emoji: string;
  count: number;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="subtitle">
        {emoji} {title}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {count}
      </AppText>
    </View>
  );
}

function EmptyCard({
  theme,
  message,
}: {
  theme: { colors: { surface: string; border: string } };
  message: string;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <AppText variant="body" tone="secondary">
        {message}
      </AppText>
    </View>
  );
}

function HeldCard({
  hold,
  theme,
}: {
  hold: BrandHeldFund;
  theme: {
    colors: {
      surface: string;
      border: string;
      success: string;
      danger: string;
      warning: string;
      primary: string;
      textSecondary: string;
    };
  };
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.cardTop}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {hold.title}
        </AppText>
        <AppText variant="caption" style={{ color: statusTone(hold.status, theme) }}>
          {humanize(hold.status)}
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary">
        {holdTypeLabel(hold.holdType)}
        {hold.counterparty ? ` · ${hold.counterparty}` : ''}
      </AppText>
      <View style={styles.amountGrid}>
        <AmountCell label="Held (net)" value={formatMoney(hold.heldNetAmount, hold.currency)} theme={theme} />
        <AmountCell
          label="Released (net)"
          value={formatMoney(hold.releasedNetAmount, hold.currency)}
          theme={theme}
        />
        <AmountCell
          label="Gross"
          value={formatMoney(hold.grossAmount, hold.currency)}
          theme={theme}
        />
        <AmountCell
          label="Commission"
          value={formatMoney(hold.commissionAmount ?? 0, hold.currency)}
          theme={theme}
        />
      </View>
      {hold.releaseCondition ? (
        <AppText variant="caption" tone="secondary" style={styles.cardFoot}>
          Release: {humanize(hold.releaseCondition)}
          {hold.nextReleaseAt ? ` · eligible ${formatDate(hold.nextReleaseAt)}` : ''}
        </AppText>
      ) : null}
    </View>
  );
}

function IncomingCard({
  tx,
  theme,
}: {
  tx: BrandIncomingTransaction;
  theme: { colors: { surface: string; border: string; primary: string } };
}) {
  const refType = String(tx.referenceType || '').toUpperCase();
  const typeLabel =
    refType === 'CUSTOMORDER' || refType === 'CUSTOM_ORDER'
      ? 'Custom order'
      : refType === 'ORDER'
        ? 'Standard order'
        : humanize(tx.referenceType) || 'Credit';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.cardTop}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {tx.title || 'Incoming credit'}
        </AppText>
        <AppText variant="subtitle" style={{ color: theme.colors.primary }}>
          {formatMoney(tx.netAmount ?? tx.amount, tx.currency)}
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary">
        {typeLabel} · {stageLabel(tx.stage)}
        {tx.counterparty ? ` · ${tx.counterparty}` : ''}
      </AppText>
      <AppText variant="caption" tone="secondary" style={styles.cardFoot}>
        {formatDate(tx.createdAt)}
        {tx.commissionAmount
          ? ` · commission ${formatMoney(tx.commissionAmount, tx.currency)}`
          : ''}
      </AppText>
    </View>
  );
}

function PayoutCard({
  payout,
  theme,
}: {
  payout: BrandPayoutRow;
  theme: {
    colors: {
      surface: string;
      border: string;
      success: string;
      danger: string;
      warning: string;
      primary: string;
      textSecondary: string;
    };
  };
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.cardTop}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {formatMoney(payout.amount, payout.currency)}
        </AppText>
        <AppText variant="caption" style={{ color: statusTone(payout.status, theme) }}>
          {humanize(payout.status)}
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary">
        Requested {formatDate(payout.createdAt)}
        {payout.paidAt ? ` · paid ${formatDate(payout.paidAt)}` : ''}
      </AppText>
    </View>
  );
}

function AmountCell({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: { colors: { border: string } };
}) {
  return (
    <View style={[styles.amountCell, { borderColor: theme.colors.border }]}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="body" style={styles.amountCellValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  centerText: { textAlign: 'center' },
  loadingHint: { marginTop: tokens.spacing.sm, textAlign: 'center' },
  errorBanner: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  hero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  heroLabel: {
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  heroAmount: {
    fontWeight: '800',
  },
  heroActions: {
    marginTop: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: 4,
  },
  metricValue: {
    fontWeight: '700',
  },
  metaLine: {
    marginBottom: tokens.spacing.xs,
  },
  sectionHeader: {
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  cardTitle: {
    flex: 1,
    flexShrink: 1,
    fontWeight: '700',
  },
  cardFoot: {
    marginTop: 2,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  amountCell: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: 2,
  },
  amountCellValue: {
    fontWeight: '600',
  },
});
