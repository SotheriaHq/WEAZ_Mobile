import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { clearBrandApiSessionCaches } from '@/src/api/BrandApi';
import { useAuth } from '@/src/auth/AuthContext';
import { clearCachedMarketFeed } from '@/src/features/feed/api/feedApi';
import { clearResolvedImageUriCache } from '@/src/hooks/useResolvedImageUri';
import { queryClient } from '@/src/query/queryClient';
import { purgeMobilePersistedQueryCache } from '@/src/query/queryPersistor';
import { queryKeys } from '@/src/query/queryKeys';
import { clearWarmScreenStateCache } from '@/src/state/screenWarmState';
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
import { useToast } from '@/src/toast/ToastContext';

type BusyAction = 'account' | 'market' | 'all' | null;

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

export default function StorageSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated, validateToken } = useAuth();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const refreshAccountData = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('account');
    try {
      queryClient.removeQueries({ queryKey: queryKeys.auth.profile(), exact: true });
      await validateToken({ forceRefresh: true });
      setLastAction('Account data refreshed from the backend.');
      toast.success('Account data refreshed.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to refresh account data.'));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, toast, validateToken]);

  const clearMarketCache = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('market');
    try {
      await clearCachedMarketFeed();
      clearResolvedImageUriCache();
      clearBrandApiSessionCaches();
      clearWarmScreenStateCache();
      queryClient.removeQueries({
        predicate: (query) => {
          const root = query.queryKey[0];
          return root === 'brand' || root === 'design' || root === 'designs' || root === 'media' || root === 'store';
        },
      });
      setLastAction('Marketplace and media cache cleared. Screens will repopulate from the backend.');
      toast.success('Media and market cache cleared.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to clear media cache.'));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, toast]);

  const clearPersistedCache = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('all');
    try {
      await Promise.allSettled([
        clearCachedMarketFeed(),
        purgeMobilePersistedQueryCache(),
      ]);
      clearResolvedImageUriCache();
      clearBrandApiSessionCaches();
      clearWarmScreenStateCache();
      queryClient.removeQueries({
        predicate: (query) => {
          const root = query.queryKey[0];
          return root !== 'auth';
        },
      });
      setLastAction('Persisted app cache cleared. Backend data will reload as each screen opens.');
      toast.success('Stored cache cleared.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to clear stored cache.'));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, toast]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Data and storage" subtitle="Local cache controls" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading storage settings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Data and storage" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Storage controls are available after sign in."
            actionTitle="Sign in"
            onAction={() => router.push('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Data and storage" subtitle="Local cache controls" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Backend refresh">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Refresh account data</AppText>
            <AppText variant="captionRegular" tone="muted">
              Forces the auth/profile query to bypass stale cache and read the latest backend account state.
            </AppText>
            <Button
              title={busyAction === 'account' ? 'Refreshing...' : 'Refresh account data'}
              loading={busyAction === 'account'}
              disabled={Boolean(busyAction)}
              onPress={() => void refreshAccountData()}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Media cache">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Clear marketplace media cache</AppText>
            <AppText variant="captionRegular" tone="muted">
              Clears local feed snapshots, signed image URL cache, and warm screen snapshots. It does not delete backend content.
            </AppText>
            <Button
              title={busyAction === 'market' ? 'Clearing...' : 'Clear media cache'}
              variant="secondary"
              loading={busyAction === 'market'}
              disabled={Boolean(busyAction)}
              onPress={() => void clearMarketCache()}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Stored data">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Clear stored app cache</AppText>
            <AppText variant="captionRegular" tone="muted">
              Removes persisted non-auth query cache and marketplace snapshots. You stay signed in, and screens reload from the backend.
            </AppText>
            <Button
              title={busyAction === 'all' ? 'Clearing...' : 'Clear stored cache'}
              variant="outline"
              loading={busyAction === 'all'}
              disabled={Boolean(busyAction)}
              onPress={() => void clearPersistedCache()}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Upload preferences">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Backend upload policy</AppText>
            <AppText variant="captionRegular" tone="muted">
              Upload quality, compression, file type, and size limits are enforced by the shared upload validation and backend policy paths.
            </AppText>
          </Card>
        </SettingsSection>

        {lastAction ? (
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Last action</AppText>
            <AppText variant="captionRegular" tone="muted">
              {lastAction}
            </AppText>
          </Card>
        ) : null}
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
});
