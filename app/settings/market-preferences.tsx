import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  deleteMarketSuppression,
  getMarketSuppressions,
  resetFeedPreferences,
  type MarketSignalTargetType,
  type MarketSuppression,
  type MarketSuppressionType,
} from '@/src/api/MarketApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const targetTypeLabel: Record<MarketSignalTargetType, string> = {
  PRODUCT: 'Product',
  COLLECTION: 'Collection',
  DESIGN: 'Design',
  BRAND: 'Brand',
  CATEGORY: 'Category',
  SECTION: 'Market section',
  SUGGESTION_BLOCK: 'Suggestion block',
};

const suppressionTypeLabel: Record<MarketSuppressionType, string> = {
  HIDE_ITEM: 'Hidden item',
  NOT_INTERESTED: 'Not interested',
  HIDE_BRAND: 'Hidden brand',
  HIDE_CATEGORY: 'Hidden category',
  HIDE_SECTION: 'Hidden section',
  HIDE_SUGGESTION_BLOCK: 'Hidden suggestion block',
  SHOW_LESS: 'Show less often',
};

function formatDate(value?: string | null) {
  if (!value) return 'Recently hidden';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently hidden';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getSuppressionLabel(suppression: MarketSuppression) {
  if (suppression.sectionKey) return suppression.sectionKey;
  if (suppression.suggestionBlockKey) return suppression.suggestionBlockKey;
  if (suppression.targetId) return suppression.targetId;
  if (suppression.brandId) return suppression.brandId;
  if (suppression.categoryId) return suppression.categoryId;
  return suppressionTypeLabel[suppression.suppressionType];
}

function getSuppressionDescription(suppression: MarketSuppression) {
  const parts = [
    targetTypeLabel[suppression.targetType],
    suppressionTypeLabel[suppression.suppressionType],
    suppression.reason ? `Reason: ${suppression.reason.replace(/[-_]/g, ' ')}` : null,
  ].filter(Boolean);
  return parts.join(' / ');
}

function EmptyHiddenState() {
  return (
    <Card padding="lg" style={styles.emptyCard}>
      <AppText variant="bodyBold">Nothing hidden yet</AppText>
      <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
        Items you mark as not interested in market sections or suggestions will appear here.
      </AppText>
    </Card>
  );
}

function HiddenContentRow({
  item,
  busy,
  onRestore,
}: {
  item: MarketSuppression;
  busy: boolean;
  onRestore: (item: MarketSuppression) => void;
}) {
  return (
    <Card padding="md" style={styles.suppressionCard}>
      <View style={styles.rowHeader}>
        <View style={styles.rowCopy}>
          <AppText variant="bodyBold" numberOfLines={1}>
            {getSuppressionLabel(item)}
          </AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
            {getSuppressionDescription(item)}
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            Hidden {formatDate(item.createdAt)}
          </AppText>
        </View>
        <Button
          title={busy ? 'Restoring...' : 'Restore'}
          size="sm"
          variant="outline"
          disabled={busy}
          onPress={() => onRestore(item)}
        />
      </View>
    </Card>
  );
}

export default function MarketPreferencesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();
  const [suppressions, setSuppressions] = useState<MarketSuppression[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busySuppressionId, setBusySuppressionId] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const loadSuppressions = useCallback(async () => {
    if (!isAuthenticated) {
      setSuppressions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const nextSuppressions = await getMarketSuppressions();
      setSuppressions(nextSuppressions);
    } catch {
      setLoadError('Unable to load hidden content right now.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadSuppressions();
  }, [loadSuppressions, status]);

  const sortedSuppressions = useMemo(
    () =>
      [...suppressions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [suppressions],
  );

  const restoreSuppression = useCallback(
    async (suppression: MarketSuppression) => {
      const previous = suppressions;
      setBusySuppressionId(suppression.id);
      setSuppressions((current) => current.filter((item) => item.id !== suppression.id));
      try {
        await deleteMarketSuppression(suppression.id);
        toast.success('Content restored to future market results.');
      } catch {
        setSuppressions(previous);
        toast.error('Could not restore that content.');
      } finally {
        setBusySuppressionId(null);
      }
    },
    [suppressions, toast],
  );

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Reset market preferences?',
      'This records a fresh baseline for your market preferences. It does not delete your account, orders, saved items, products, collections, profile data, or hidden content list. Visible suggestions may adjust as you continue browsing and interacting.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setResetBusy(true);
            void resetFeedPreferences({
              resetType: 'ALL',
              reason: 'mobile_settings_reset',
            })
              .then(() => {
                toast.success('Fresh market preference baseline recorded.');
              })
              .catch(() => {
                toast.error('Could not reset market preferences.');
              })
              .finally(() => {
                setResetBusy(false);
              });
          },
        },
      ],
    );
  }, [toast]);

  const listHeader = (
    <View style={styles.headerContent}>
      <Card padding="lg" style={styles.infoCard}>
        <AppText variant="bodyBold">Hidden / Not Interested content</AppText>
        <AppText variant="captionRegular" tone="muted">
          Restored items become eligible for future market sections and suggestion blocks.
        </AppText>
      </Card>
      {loadError ? (
        <Card padding="lg" style={[styles.errorCard, { borderColor: theme.colors.danger }]}>
          <AppText variant="bodyBold" tone="danger">
            Could not load preferences
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            {loadError}
          </AppText>
          <Button title="Retry" size="sm" variant="outline" onPress={() => void loadSuppressions()} />
        </Card>
      ) : null}
    </View>
  );

  const listFooter = (
    <Card padding="lg" style={[styles.resetCard, { borderColor: theme.colors.warning }]}>
      <View style={styles.resetCopy}>
        <AppText variant="bodyBold" tone="warning">
          Reset market preferences
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Records a fresh baseline for your market preferences. It does not delete your account, orders, saved items, products, collections, profile data, or hidden content list. Visible suggestions may adjust as you continue browsing and interacting.
        </AppText>
      </View>
      <Button
        title={resetBusy ? 'Resetting...' : 'Reset preferences'}
        variant="danger"
        disabled={resetBusy}
        onPress={confirmReset}
      />
    </Card>
  );

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/settings" />
          <View style={styles.headerCopy}>
            <AppText variant="title">Market preferences</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              Hidden content and reset controls
            </AppText>
          </View>
        </View>
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading market preferences...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/settings" />
          <View style={styles.headerCopy}>
            <AppText variant="title">Market preferences</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              Sign in to manage preference controls
            </AppText>
          </View>
        </View>
        <View style={styles.stateWrap}>
          <AppText variant="bodyBold">Sign in required</AppText>
          <AppText variant="bodyRegular" tone="muted" style={styles.centerText}>
            Account-level hidden content and reset controls are available after sign in.
          </AppText>
          <Button title="Sign in" onPress={() => router.push('/(auth)/login' as never)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Market preferences</AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            Hidden content and reset controls
          </AppText>
        </View>
      </View>

      <FlatList
        data={sortedSuppressions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HiddenContentRow
            item={item}
            busy={busySuppressionId === item.id}
            onRestore={restoreSuppression}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loadError ? <EmptyHiddenState /> : null}
        ListFooterComponent={listFooter}
        refreshing={loading}
        onRefresh={() => void loadSuppressions()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) },
        ]}
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
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  headerContent: {
    gap: tokens.spacing.md,
  },
  infoCard: {
    gap: tokens.spacing.xs,
  },
  errorCard: {
    gap: tokens.spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  suppressionCard: {
    gap: tokens.spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  resetCard: {
    gap: tokens.spacing.md,
  },
  resetCopy: {
    gap: tokens.spacing.sm,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  centerText: {
    textAlign: 'center',
  },
});
