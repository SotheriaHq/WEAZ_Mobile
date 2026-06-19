import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ProfileApi, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { SettingsHeader, SettingsStateCard } from '@/components/settings/SettingsPrimitives';
import { AppText } from '@/components/ui/AppText';
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

function VisibilityRow({
  emoji,
  label,
  selected,
  disabled,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <AppText variant="body">{emoji}</AppText>
      <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'} style={styles.rowLabel}>
        {label}
      </AppText>
      <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} /> : null}
      </View>
    </Pressable>
  );
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
      const previousVisibility = profile.profileVisibility;
      setBusy(true);
      setProfile({ ...profile, profileVisibility: nextVisibility });
      try {
        const updated = await ProfileApi.updateProfileVisibility(nextVisibility);
        setProfile((current) =>
          current ? { ...current, profileVisibility: updated.profileVisibility } : current,
        );
        toast.success('Profile visibility updated.');
      } catch (error) {
        setProfile((current) =>
          current ? { ...current, profileVisibility: previousVisibility } : current,
        );
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
        <SettingsHeader title="Privacy" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Privacy" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
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
        <SettingsHeader title="Privacy" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Could not load privacy settings"
            actionTitle="Retry"
            onAction={() => void loadProfile()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Privacy" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + tokens.spacing['2xl'] },
        ]}
      >
        <View style={[styles.section, { borderBottomColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted">PROFILE VISIBILITY</AppText>
          <VisibilityRow
            emoji="🌐"
            label="Public profile"
            selected={profile.profileVisibility === 'UNLOCKED'}
            disabled={busy}
            onPress={() => void updateVisibility('UNLOCKED')}
          />
          <VisibilityRow
            emoji="🔒"
            label="Private profile"
            selected={profile.profileVisibility === 'LOCKED'}
            disabled={busy}
            onPress={() => void updateVisibility('LOCKED')}
          />
        </View>

        <View style={[styles.section, { borderBottomColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted">MARKET</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/settings/market-preferences' as never)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: theme.colors.border },
              pressed ? styles.pressed : null,
            ]}
          >
            <AppText variant="body">🙈</AppText>
            <AppText variant="bodyBold" style={styles.rowLabel}>Hidden content</AppText>
            <AppText variant="subtitle" tone="muted">›</AppText>
          </Pressable>
        </View>

        <View style={[styles.section, styles.blockedSection, { borderBottomColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted" style={styles.sectionLabel}>BLOCKED USERS</AppText>
          <View style={styles.emptyState}>
            <AppText variant="title">🚫</AppText>
            <AppText variant="bodyBold">No blocked users</AppText>
          </View>
        </View>
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
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: tokens.spacing.md,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  blockedSection: {
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing['2xl'],
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.6,
  },
});
