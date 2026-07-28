import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { publicLinkApi } from '@/src/api/PublicLinkApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { perfMeasure } from '@/src/utils/perf';

type StudioAliasType = 'profile' | 'brand';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function normalizeAliasType(value: string): StudioAliasType | null {
  return value === 'profile' || value === 'brand' ? value : null;
}

export default function StudioAliasResolverScreen() {
  const params = useLocalSearchParams<{ aliasType?: string | string[]; aliasValue?: string | string[]; source?: string | string[] }>();
  const { theme } = useTheme();
  const mountedRef = useRef(true);
  const aliasType = normalizeAliasType(readParam(params.aliasType));
  const aliasValue = readParam(params.aliasValue).trim();
  const source = readParam(params.source) || 'navigation';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveAlias = useCallback(async () => {
    if (!aliasType || !aliasValue) {
      setError('This Studio link is not supported on mobile.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (aliasType === 'profile') {
        const profile = await publicLinkApi.resolveProfileByUsername(aliasValue);
        if (__DEV__) {
          console.info('[studio-webview]', 'native-route-opened', { source, path: `/profile/${profile.id}` });
        }
        perfMeasure('studio-webview-resolved', 'studio-webview-tap');
        router.replace({ pathname: '/profile/[id]', params: { id: profile.id } } as any);
        return;
      }

      const store = await publicLinkApi.resolveStorefrontBySlug(aliasValue);
      if (__DEV__) {
        console.info('[studio-webview]', 'native-route-opened', { source, path: `/catalog/${store.ownerId}` });
      }
      perfMeasure('studio-webview-resolved', 'studio-webview-tap');
      router.replace({ pathname: '/catalog/[brandId]', params: { brandId: store.ownerId, tab: 'Shop' } } as any);
    } catch {
      if (__DEV__) {
        console.info('[studio-webview]', 'native-route-blocked', {
          source,
          reason: aliasType === 'profile' ? 'profile_alias_resolution_failed' : 'storefront_alias_resolution_failed',
        });
      }
      if (!mountedRef.current) return;
      setError(aliasType === 'profile' ? 'Profile not found.' : 'Storefront not found.');
      setLoading(false);
    }
  }, [aliasType, aliasValue, source]);

  useEffect(() => {
    mountedRef.current = true;
    void resolveAlias();
    return () => {
      mountedRef.current = false;
    };
  }, [resolveAlias]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/studio" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Opening Studio link</AppText>
          <AppText variant="captionRegular" tone="muted">
            {aliasType === 'brand' ? 'Finding the storefront...' : 'Finding the profile...'}
          </AppText>
        </View>
      </View>

      <View style={styles.content}>
        {loading ? (
          <>
            <ActivityIndicator color={theme.colors.primary} />
            <AppText variant="body" tone="muted">
              Resolving link...
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="bodyBold">Could not open this link</AppText>
            <AppText variant="body" tone="muted" style={styles.message}>
              {error ?? 'Try again in a moment.'}
            </AppText>
            <View style={styles.actions}>
              <Button title="Retry" onPress={() => void resolveAlias()} />
              <Button title="Back to Studio" variant="secondary" onPress={() => router.replace('/studio' as any)} />
            </View>
          </>
        )}
      </View>
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
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  message: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: tokens.spacing.md,
  },
});
