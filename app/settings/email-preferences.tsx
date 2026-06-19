import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  NotificationsApi,
  type EmailNotificationSettings,
  type EmailNotificationSettingsPatch,
} from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  SettingsHeader,
  SettingsSection,
  SettingsStateCard,
  SettingsToggleRow,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type ScenarioMeta = {
  title: string;
  description: string;
  group: string;
};

type PendingCriticalChange =
  | { type: 'securityCriticalEnabled'; nextValue: false }
  | { type: 'scenario'; scenarioKey: string; nextValue: false };

const GROUP_ORDER = [
  'Security',
  'Orders & Checkout',
  'Messaging & Social',
  'Brand & Catalog',
  'Size & Fit',
  'Platform & Operations',
] as const;

const GROUP_COPY: Record<string, string> = {
  Security: 'Account-access, recovery, and sign-in email safeguards.',
  'Orders & Checkout': 'Purchases, checkout, delivery, and custom-order milestones.',
  'Messaging & Social': 'Messages, replies, comments, follows, tags, and social activity.',
  'Brand & Catalog': 'Publishing, private access, brand updates, and catalog work.',
  'Size & Fit': 'Measurement reminders and size-fit sharing events.',
  'Platform & Operations': 'Wishlist, featured, review, and operational notices.',
};

const SCENARIO_OVERRIDES: Record<string, ScenarioMeta> = {
  'auth.signin.new_device': {
    title: 'New sign-in from a new device',
    description: 'Sent when WEAZ sees account access from a device it has not seen before.',
    group: 'Security',
  },
  'auth.password.changed': {
    title: 'Password changed',
    description: 'Sent after your password changes so you can act quickly if it was not you.',
    group: 'Security',
  },
  'auth.email.changed': {
    title: 'Email changed',
    description: 'Sent when the email address on your account changes.',
    group: 'Security',
  },
  'notification.ORDER_PLACED': {
    title: 'Order placed',
    description: 'Sent when checkout succeeds and an order is created.',
    group: 'Orders & Checkout',
  },
  'notification.ORDER_STATUS_UPDATED': {
    title: 'Order status changes',
    description: 'Sent when fulfillment, delivery, cancellation, or refund state changes.',
    group: 'Orders & Checkout',
  },
  'notification.MESSAGE_RECEIVED': {
    title: 'New direct or order message',
    description: 'Sent when a new tracked conversation message arrives.',
    group: 'Messaging & Social',
  },
  'notification.MESSAGE_UNREAD_REMINDER': {
    title: 'Unread message reminder',
    description: 'Sent when a message still needs attention.',
    group: 'Messaging & Social',
  },
  'notification.SIZE_FIT_UPDATE_REMINDER': {
    title: 'Size-fit update reminder',
    description: 'Sent when your saved fit profile is due for a refresh.',
    group: 'Size & Fit',
  },
};

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function humanizeScenarioKey(scenarioKey: string) {
  return scenarioKey
    .replace(/^notification\./i, '')
    .replace(/^auth\./i, '')
    .replace(/[._]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferScenarioGroup(scenarioKey: string) {
  const key = scenarioKey.toUpperCase();
  if (key.startsWith('AUTH.') || key.includes('LOGIN') || key.includes('LOGOUT') || key.includes('SIGNUP')) return 'Security';
  if (key.includes('ORDER') || key.includes('PAYMENT') || key.includes('DISPUTE') || key.includes('DELIVERED')) return 'Orders & Checkout';
  if (key.includes('MESSAGE') || key.includes('THREAD') || key.includes('COMMENT') || key.includes('FOLLOW') || key.includes('TAG') || key.includes('PATCH')) return 'Messaging & Social';
  if (key.includes('COLLECTION') || key.includes('PRODUCT') || key.includes('PRIVATE_ACCESS') || key.includes('CONTRIBUTION') || key.includes('VERIFICATION')) return 'Brand & Catalog';
  if (key.includes('SIZE_FIT')) return 'Size & Fit';
  return 'Platform & Operations';
}

function describeScenario(title: string, scenarioKey: string) {
  const key = scenarioKey.toUpperCase();
  if (key.includes('CUSTOM_ORDER')) return `Sent when ${title.toLowerCase()} changes and the custom-order workflow needs attention.`;
  if (key.includes('REQUEST')) return `Sent when ${title.toLowerCase()} needs your attention or response.`;
  if (key.includes('REMINDER')) return `Sent as a reminder when ${title.toLowerCase()} still needs attention.`;
  if (key.includes('UPDATED') || key.includes('PROGRESS')) return `Sent when ${title.toLowerCase()} changes and there is something new to review.`;
  return `Sent when ${title.toLowerCase()} happens in WEAZ.`;
}

function getScenarioMeta(scenarioKey: string): ScenarioMeta {
  const override = SCENARIO_OVERRIDES[scenarioKey];
  if (override) return override;

  const title = humanizeScenarioKey(scenarioKey);
  return {
    title,
    description: describeScenario(title, scenarioKey),
    group: inferScenarioGroup(scenarioKey),
  };
}

function getGroupRank(group: string) {
  const index = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
  return index === -1 ? GROUP_ORDER.length : index;
}

export default function EmailPreferencesSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<EmailNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingCriticalChange, setPendingCriticalChange] = useState<PendingCriticalChange | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');

  const loadSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const nextSettings = await NotificationsApi.getEmailSettings();
      setSettings(nextSettings);
    } catch (error) {
      setLoadError(extractErrorMessage(error, 'Unable to load email preferences.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadSettings();
  }, [loadSettings, status]);

  const groupedScenarios = useMemo(() => {
    if (!settings) return [] as Array<{ group: string; items: Array<{ key: string; meta: ScenarioMeta }> }>;

    const grouped = Object.keys(settings.scenarios)
      .sort((left, right) => {
        const leftMeta = getScenarioMeta(left);
        const rightMeta = getScenarioMeta(right);
        if (leftMeta.group !== rightMeta.group) {
          return getGroupRank(leftMeta.group) - getGroupRank(rightMeta.group);
        }
        return leftMeta.title.localeCompare(rightMeta.title);
      })
      .reduce<Record<string, Array<{ key: string; meta: ScenarioMeta }>>>((acc, key) => {
        const meta = getScenarioMeta(key);
        if (!acc[meta.group]) acc[meta.group] = [];
        acc[meta.group].push({ key, meta });
        return acc;
      }, {});

    return Object.entries(grouped)
      .sort(([left], [right]) => getGroupRank(left) - getGroupRank(right))
      .map(([group, items]) => ({ group, items }));
  }, [settings]);

  const isCritical = useCallback(
    (scenarioKey: string) => settings?.securityCriticalScenarios.includes(scenarioKey) ?? false,
    [settings?.securityCriticalScenarios],
  );

  const applySettingsPatch = useCallback(
    async (patch: EmailNotificationSettingsPatch, optimisticSettings: EmailNotificationSettings, successMessage: string) => {
      if (!settings) return;
      const previous = settings;
      setSettings(optimisticSettings);
      try {
        const updated = await NotificationsApi.updateEmailSettings(patch);
        setSettings(updated);
        toast.success(successMessage);
      } catch (error) {
        setSettings(previous);
        toast.error(extractErrorMessage(error, 'Unable to update email preference.'));
        throw error;
      }
    },
    [settings, toast],
  );

  const toggleGlobal = useCallback(
    async (nextValue: boolean) => {
      if (!settings) return;
      setPendingKey('globalEnabled');
      try {
        await applySettingsPatch(
          { globalEnabled: nextValue },
          { ...settings, globalEnabled: nextValue },
          'General email preference updated.',
        );
      } finally {
        setPendingKey(null);
      }
    },
    [applySettingsPatch, settings],
  );

  const toggleSecurityCritical = useCallback(
    (nextValue: boolean) => {
      if (!settings) return;
      if (!nextValue) {
        setPendingCriticalChange({ type: 'securityCriticalEnabled', nextValue: false });
        setStepUpPassword('');
        return;
      }

      setPendingKey('securityCriticalEnabled');
      void applySettingsPatch(
        { securityCriticalEnabled: true },
        { ...settings, securityCriticalEnabled: true },
        'Security email preference updated.',
      ).finally(() => setPendingKey(null));
    },
    [applySettingsPatch, settings],
  );

  const toggleScenario = useCallback(
    (scenarioKey: string, nextValue: boolean) => {
      if (!settings) return;
      if (isCritical(scenarioKey) && !nextValue) {
        setPendingCriticalChange({ type: 'scenario', scenarioKey, nextValue: false });
        setStepUpPassword('');
        return;
      }

      setPendingKey(scenarioKey);
      void applySettingsPatch(
        { scenarios: { [scenarioKey]: nextValue } },
        {
          ...settings,
          scenarios: { ...settings.scenarios, [scenarioKey]: nextValue },
        },
        `${getScenarioMeta(scenarioKey).title} email updated.`,
      ).finally(() => setPendingKey(null));
    },
    [applySettingsPatch, isCritical, settings],
  );

  const confirmCriticalChange = useCallback(async () => {
    if (!settings || !pendingCriticalChange) return;
    if (stepUpPassword.length < 1) {
      toast.error('Enter your password to confirm this security email change.');
      return;
    }

    const patch: EmailNotificationSettingsPatch = {
      complianceAcknowledged: true,
      stepUpPassword,
    };
    const optimisticSettings = { ...settings };
    const busyKey =
      pendingCriticalChange.type === 'securityCriticalEnabled'
        ? 'securityCriticalEnabled'
        : pendingCriticalChange.scenarioKey;

    if (pendingCriticalChange.type === 'securityCriticalEnabled') {
      patch.securityCriticalEnabled = false;
      optimisticSettings.securityCriticalEnabled = false;
    } else {
      patch.scenarios = { [pendingCriticalChange.scenarioKey]: false };
      optimisticSettings.scenarios = {
        ...settings.scenarios,
        [pendingCriticalChange.scenarioKey]: false,
      };
    }

    setPendingKey(busyKey);
    try {
      await applySettingsPatch(patch, optimisticSettings, 'Security email preference updated.');
      setPendingCriticalChange(null);
      setStepUpPassword('');
    } finally {
      setPendingKey(null);
    }
  }, [applySettingsPatch, pendingCriticalChange, settings, stepUpPassword, toast]);

  const resetDefaults = useCallback(() => {
    Alert.alert(
      'Restore recommended defaults?',
      'This restores backend email notification defaults for your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            setPendingKey('reset');
            void NotificationsApi.resetEmailSettings()
              .then((updated) => {
                setSettings(updated);
                toast.success('Email preferences reset.');
              })
              .catch((error) => {
                toast.error(extractErrorMessage(error, 'Unable to reset email preferences.'));
              })
              .finally(() => setPendingKey(null));
          },
        },
      ],
    );
  }, [toast]);

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Email notifications" subtitle="Backend email delivery preferences" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading email preferences...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Email notifications" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Email delivery preferences are tied to your account."
            actionTitle="Sign in"
            onAction={() => router.push('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !settings) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Email notifications" subtitle="Backend email delivery preferences" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Could not load preferences"
            body={loadError ?? 'The backend did not return email settings.'}
            actionTitle="Retry"
            onAction={() => void loadSettings()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Email notifications" subtitle="Backend email delivery preferences" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Master controls">
          <Card padding="lg" style={styles.card}>
            <SettingsToggleRow
              title="General email updates"
              description="Routine product, community, and operational emails."
              value={settings.globalEnabled}
              busy={pendingKey === 'globalEnabled'}
              onChange={(next) => void toggleGlobal(next)}
            />
            <SettingsToggleRow
              title="Security emails"
              description="Critical account-protection emails. Turning this off requires your password."
              value={settings.securityCriticalEnabled}
              busy={pendingKey === 'securityCriticalEnabled'}
              onChange={toggleSecurityCritical}
            />
            <Button
              title={pendingKey === 'reset' ? 'Restoring...' : 'Restore recommended defaults'}
              size="sm"
              variant="secondary"
              loading={pendingKey === 'reset'}
              disabled={pendingKey === 'reset'}
              onPress={resetDefaults}
            />
          </Card>
        </SettingsSection>

        {pendingCriticalChange ? (
          <Card padding="lg" style={[styles.card, { borderColor: theme.colors.warning }]}>
            <AppText variant="bodyBold" tone="warning">
              Confirm security email change
            </AppText>
            <AppText variant="captionRegular" tone="muted">
              Turning off security-critical email can hide important account alerts. Enter your password to confirm.
            </AppText>
            <Input
              label="Current password"
              value={stepUpPassword}
              onChangeText={setStepUpPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.confirmActions}>
              <View style={styles.confirmButtonSlot}>
                <Button
                  title="Cancel"
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setPendingCriticalChange(null);
                    setStepUpPassword('');
                  }}
                />
              </View>
              <View style={styles.confirmButtonSlot}>
                <Button
                  title={pendingKey ? 'Saving...' : 'Confirm'}
                  size="sm"
                  loading={Boolean(pendingKey)}
                  disabled={Boolean(pendingKey)}
                  onPress={() => void confirmCriticalChange()}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {groupedScenarios.map(({ group, items }) => (
          <SettingsSection key={group} title={group}>
            <Card padding="lg" style={styles.card}>
              <AppText variant="captionRegular" tone="muted">
                {GROUP_COPY[group] ?? 'Choose which email updates you want from this category.'}
              </AppText>
              {items.map(({ key, meta }) => (
                <SettingsToggleRow
                  key={key}
                  title={meta.title}
                  description={`${meta.description}${isCritical(key) ? ' Security-critical.' : ''}`}
                  value={settings.scenarios[key] ?? true}
                  busy={pendingKey === key}
                  onChange={(next) => toggleScenario(key, next)}
                />
              ))}
            </Card>
          </SettingsSection>
        ))}
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
  confirmActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  confirmButtonSlot: {
    flex: 1,
    minWidth: 0,
  },
});
