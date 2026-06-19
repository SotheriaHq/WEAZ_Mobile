import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ProfileApi, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  SettingsHeader,
  SettingsOptionRow,
  SettingsSection,
  SettingsStateCard,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

export default function PrivacySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      setProfile(await ProfileApi.getMe());
    } catch (error) {
      setLoadError(extractErrorMessage(error, 'Unable to load privacy settings.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadProfile();
  }, [loadProfile, status]);

  const updateVisibility = useCallback(
    async (nextVisibility: UserProfile['profileVisibility']) => {
      if (!profile || profile.profileVisibility === nextVisibility || busy) return;
      const previous = profile;
      setBusy(true);
      setProfile({ ...profile, profileVisibility: nextVisibility });
      try {
        const updated = await ProfileApi.updateProfileVisibility(nextVisibility);
        setProfile((current) =>
          current ? { ...current, profileVisibility: updated.profileVisibility } : current,
        );
        toast.success('Profile visibility updated.');
      } catch (error) {
        setProfile(previous);
        toast.error(extractErrorMessage(error, 'Unable to update profile visibility.'));
      } finally {
        setBusy(false);
      }
    },
    [busy, profile, toast],
  );

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Privacy" subtitle="Visibility and hidden content" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading privacy settings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Privacy" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Privacy settings are tied to your account."
            actionTitle="Sign in"
            onAction={() => router.push('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !profile) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Privacy" subtitle="Visibility and hidden content" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Could not load privacy settings"
            body={loadError ?? 'The backend did not return your profile settings.'}
            actionTitle="Retry"
            onAction={() => void loadProfile()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Privacy" subtitle="Visibility and hidden content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Profile visibility">
          <Card padding="lg" style={styles.card}>
            <SettingsOptionRow
              title="Unlocked profile"
              description="People can view your public profile and public activity normally."
              selected={profile.profileVisibility === 'UNLOCKED'}
              disabled={busy}
              onPress={() => void updateVisibility('UNLOCKED')}
            />
            <SettingsOptionRow
              title="Locked profile"
              description="Public viewers see less profile detail. Account owners can still manage everything."
              selected={profile.profileVisibility === 'LOCKED'}
              disabled={busy}
              onPress={() => void updateVisibility('LOCKED')}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Market controls">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Hidden and Not Interested content</AppText>
            <AppText variant="captionRegular" tone="muted">
              Manage marketplace items and sections you hid or marked as not interested. This state is stored on the backend.
            </AppText>
            <Button
              title="Open market preferences"
              variant="secondary"
              onPress={() => router.push('/settings/market-preferences' as never)}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Blocked users">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">No backend block-list settings yet</AppText>
            <AppText variant="captionRegular" tone="muted">
              This workspace does not expose a shopper block-list settings endpoint yet. Profile visibility and hidden market content remain available here.
            </AppText>
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
});
