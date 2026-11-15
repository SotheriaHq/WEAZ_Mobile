import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, useGlobalSearchParams, usePathname, useIsFocused } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership, isBrandAccount } from '@/src/auth/brandAccess';
import { resolveStudioSetupAccess } from '@/src/features/studio/studioAccessPolicy';
import { useStoreSetupStatus } from '@/src/hooks/useStoreSetupStatus';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

/** Browser/content setup gate; native Finance/Staff retain their own role checks. */
export function StudioSetupGate({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const setup = useStoreSetupStatus();
  const params = useGlobalSearchParams<{ routeKey?: string | string[] }>();
  const pathname = usePathname();
  const focused = useIsFocused();
  const routeParam = Array.isArray(params.routeKey) ? params.routeKey[0] : params.routeKey;
  const route = pathname.endsWith('/finance') ? 'finance' : pathname.endsWith('/staff') ? 'staff' : routeParam;
  const { theme } = useTheme();
  const workspace = hasActiveBrandMembership(user);
  const decision = resolveStudioSetupAccess(route ?? 'overview', setup.isSetupComplete);

  if (status === 'authenticated' && user?.type === 'BRAND' && workspace) {
    if (decision === 'allow') return <>{children}</>;
    if (decision === 'setup' && focused) {
      return <Redirect href={{ pathname: '/studio', params: { routeKey: 'essentials' } } as never} />;
    }
  }
  // A hidden, pre-warmed Studio must not navigate over the active tab.
  if (!focused) return null;
  const checking = status === 'loading' || (status === 'authenticated' && user?.type === 'BRAND' && workspace && setup.isLoading && !setup.isError);
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      {checking ? <MuseLoader size={32} /> : null}
      <AppText variant="bodyBold">
        {checking ? 'Checking Studio access…' : 'Studio could not open'}
      </AppText>
      {!checking ? <AppText variant="body" tone="muted">
        {setup.isError ? 'Your store setup status could not be checked. Retry when connected.'
          : status === 'authenticated' && isBrandAccount(user) && !workspace ? 'Finish your brand profile before opening Studio.' : 'Sign in with a brand workspace to open Studio.'}
      </AppText> : null}
      {setup.isError ? <Button title="Retry" onPress={setup.retry} /> : null}
      <Button title="Back to settings" variant="secondary" onPress={() => {
        // A known destination avoids replaying the blocked deep link.
        router.replace('/settings' as never);
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: tokens.spacing.xl, gap: tokens.spacing.lg },
});
