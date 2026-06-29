import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ProfileApi, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  SettingsHeader,
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

export default function LocationSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setAddress('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const nextProfile = await ProfileApi.getMe();
      setProfile(nextProfile);
      setAddress(nextProfile?.address ?? nextProfile?.location ?? '');
    } catch (error) {
      setLoadError(extractErrorMessage(error, 'Unable to load location settings.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadProfile();
  }, [loadProfile, status]);

  const saveLocation = useCallback(async () => {
    if (!profile || saving) return;

    const nextAddress = address.trim();
    setSaving(true);
    try {
      const updated = await ProfileApi.updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        username: profile.username,
        address: nextAddress,
      });
      setProfile(updated ?? { ...profile, address: nextAddress, location: nextAddress });
      setAddress(updated?.address ?? updated?.location ?? nextAddress);
      toast.success('Location saved.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to save location.'));
    } finally {
      setSaving(false);
    }
  }, [address, profile, saving, toast]);

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Location" subtitle="Saved profile location" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading location settings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Location" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Location settings are tied to your account."
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
        <SettingsHeader title="Location" subtitle="Saved profile location" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Could not load location"
            body={loadError ?? 'The backend did not return your profile.'}
            actionTitle="Retry"
            onAction={() => void loadProfile()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const hasChanged = address.trim() !== String(profile.address ?? profile.location ?? '').trim();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Location" subtitle="Saved profile location" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Profile location">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Saved location</AppText>
            <AppText variant="captionRegular" tone="muted">
              This is the backend-owned location shown where your profile needs a city, market, or address context.
            </AppText>
            <Input
              label="City, market, or delivery area"
              value={address}
              onChangeText={setAddress}
              autoCapitalize="words"
              placeholder="Lagos, Nigeria"
            />
            <Button
              title={saving ? 'Saving...' : 'Save location'}
              loading={saving}
              disabled={saving || !hasChanged}
              onPress={() => void saveLocation()}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Device access">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Device location permission</AppText>
            <AppText variant="captionRegular" tone="muted">
              This app build does not include a native GPS permission module. You can still manage any OS-level app permission from device settings.
            </AppText>
            <Button
              title="Open app settings"
              variant="secondary"
              onPress={() => {
                void Linking.openSettings().catch(() => {
                  toast.error('Unable to open device settings.');
                });
              }}
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
});
