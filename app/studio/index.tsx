import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/src/auth/AuthContext';
import { brandApi } from '@/src/api/BrandApi';
import { STUDIO_HOME_ACTIONS, STUDIO_ROUTES, type StudioRouteKey } from '@/src/features/studio/studioRoutes';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type StoreStatus = {
  hasStore: boolean;
  isSetupComplete: boolean;
};

function StudioActionCard({ routeKey, onPress }: { routeKey: StudioRouteKey; onPress: (key: StudioRouteKey) => void }) {
  const route = STUDIO_ROUTES[routeKey];
  return (
    <Card onPress={() => onPress(routeKey)} padding="lg" style={styles.actionCard}>
      <View style={styles.actionRow}>
        <View style={styles.actionEmoji}>
          <AppText variant="h2">{route.emoji}</AppText>
        </View>
        <View style={styles.actionText}>
          <AppText variant="bodyBold" numberOfLines={1}>
            {route.title}
          </AppText>
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {route.subtitle}
          </AppText>
        </View>
        <AppText variant="h3" tone="muted">
          ›
        </AppText>
      </View>
    </Card>
  );
}

export default function BrandStudioHome() {
  const { status, user } = useAuth();
  const { scheme, theme } = useTheme();
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeStatusFailed, setStoreStatusFailed] = useState(false);
  const isBrand = user?.type === 'BRAND';

  useEffect(() => {
    let mounted = true;
    if (status !== 'authenticated' || !isBrand) return;

    brandApi
      .getStoreStatus()
      .then((next) => {
        if (!mounted) return;
        setStoreStatus({
          hasStore: Boolean(next.hasStore),
          isSetupComplete: Boolean(next.isSetupComplete),
        });
        setStoreStatusFailed(false);
      })
      .catch(() => {
        if (!mounted) return;
        setStoreStatusFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [isBrand, status, user?.id]);

  const openStudioRoute = useCallback((routeKey: StudioRouteKey) => {
    router.push({ pathname: '/studio/webview', params: { routeKey } } as any);
  }, []);

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Header title="Studio" left={<Button title="‹" variant="ghost" size="sm" onPress={() => router.back()} />} />
        <View style={styles.center}>
          <AppText variant="h2">Sign in required</AppText>
          <AppText variant="body" tone="muted" style={styles.centerText}>
            Studio is available after signing in with a brand account.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isBrand) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Header title="Studio" left={<Button title="‹" variant="ghost" size="sm" onPress={() => router.back()} />} />
        <View style={styles.center}>
          <AppText variant="h2">Brand account required</AppText>
          <AppText variant="body" tone="muted" style={styles.centerText}>
            Studio manages brand store operations and is not available for regular buyer accounts.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Header
        title="Studio"
        subtitle={user?.brandFullName ?? user?.username ?? 'Brand workspace'}
        left={<Button title="‹" variant="ghost" size="sm" onPress={() => router.back()} />}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Card padding="lg" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <AppText variant="caption" tone="muted">
                Store
              </AppText>
              <AppText variant="bodyBold">
                {storeStatusFailed
                  ? 'Unavailable'
                  : storeStatus?.isSetupComplete
                    ? 'Ready'
                    : storeStatus?.hasStore
                      ? 'Setup needed'
                      : 'Not started'}
              </AppText>
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caption" tone="muted">
                Verification
              </AppText>
              <AppText variant="bodyBold">
                {user?.verificationStatus ?? 'Not submitted'}
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <AppText variant="h3">Manage</AppText>
        </View>

        <View style={styles.actions}>
          {STUDIO_HOME_ACTIONS.map((routeKey) => (
            <StudioActionCard key={routeKey} routeKey={routeKey} onPress={openStudioRoute} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
    gap: tokens.spacing.lg,
  },
  statusCard: {
    gap: tokens.spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  statusItem: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  sectionHeader: {
    paddingTop: tokens.spacing.sm,
  },
  actions: {
    gap: tokens.spacing.md,
  },
  actionCard: {
    minHeight: 84,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  actionEmoji: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
});
