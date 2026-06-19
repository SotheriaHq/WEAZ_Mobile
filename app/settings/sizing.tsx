import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ProfileApi, type SizeFitProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { topLevelNavigate } from '@/src/utils/mobileNavigation';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  SettingsHeader,
  SettingsOptionRow,
  SettingsSection,
  SettingsStateCard,
  SettingsToggleRow,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type SizeFitSharePolicy = 'OWNER_ONLY' | 'REQUIRE_PERMISSION' | 'ALLOW_ANYONE';

type Option<T extends string | number> = {
  value: T;
  title: string;
  description?: string;
};

const VISIBILITY_OPTIONS: Array<Option<'PRIVATE' | 'PUBLIC'>> = [
  { value: 'PRIVATE', title: 'Private', description: 'Only you can use your saved fittings by default.' },
  { value: 'PUBLIC', title: 'Public', description: 'Allows eligible public size-fit reads where the backend permits it.' },
];

const SHARE_POLICY_OPTIONS: Array<Option<SizeFitSharePolicy>> = [
  { value: 'OWNER_ONLY', title: 'Owner only', description: 'Do not share size-fit details without a direct action from you.' },
  { value: 'REQUIRE_PERMISSION', title: 'Require permission', description: 'People must request access before your fit details are shared.' },
  { value: 'ALLOW_ANYONE', title: 'Allow anyone', description: 'Permit eligible size-fit access where the backend contract allows it.' },
];

const LENGTH_UNIT_OPTIONS: Array<Option<'CM' | 'IN'>> = [
  { value: 'CM', title: 'Centimeters' },
  { value: 'IN', title: 'Inches' },
];

const WEIGHT_UNIT_OPTIONS: Array<Option<'KG' | 'LBS'>> = [
  { value: 'KG', title: 'Kilograms' },
  { value: 'LBS', title: 'Pounds' },
];

const FIT_OPTIONS: Array<Option<'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED'>> = [
  { value: 'SLIM', title: 'Slim' },
  { value: 'REGULAR', title: 'Regular' },
  { value: 'LOOSE', title: 'Loose' },
  { value: 'OVERSIZED', title: 'Oversized' },
];

const REGION_OPTIONS: Array<Option<'NG_WEST_AFRICA' | 'UK' | 'US' | 'EU' | 'INTERNATIONAL'>> = [
  { value: 'NG_WEST_AFRICA', title: 'Nigeria / West Africa' },
  { value: 'UK', title: 'UK' },
  { value: 'US', title: 'US' },
  { value: 'EU', title: 'EU' },
  { value: 'INTERNATIONAL', title: 'International' },
];

const AUTO_RECOMMENDATION_OPTIONS: Array<Option<'ON' | 'OFF' | 'ASK_EVERY_TIME'>> = [
  { value: 'ON', title: 'On', description: 'Use saved measurements automatically where supported.' },
  { value: 'ASK_EVERY_TIME', title: 'Ask every time', description: 'Confirm before applying recommendations.' },
  { value: 'OFF', title: 'Off', description: 'Do not auto-apply size recommendations.' },
];

const UPDATE_CADENCE_OPTIONS: Array<Option<number>> = [
  { value: 14, title: 'Every 14 days' },
  { value: 30, title: 'Every 30 days' },
  { value: 60, title: 'Every 60 days' },
  { value: 90, title: 'Every 90 days' },
];

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function getMeasurementCount(sizeFit: SizeFitProfile | null) {
  return Object.values(sizeFit?.measurements ?? {}).filter((value) => String(value ?? '').trim()).length;
}

export default function SizingSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();
  const [sizeFit, setSizeFit] = useState<SizeFitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadSizeFit = useCallback(async () => {
    if (!isAuthenticated) {
      setSizeFit(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      setSizeFit(await ProfileApi.getSizeFit());
    } catch (error) {
      setLoadError(extractErrorMessage(error, 'Unable to load sizing settings.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void loadSizeFit();
  }, [loadSizeFit, status]);

  const updateSetting = useCallback(
    async (key: string, patch: Parameters<typeof ProfileApi.updateSizeFitSettings>[0]) => {
      if (busyKey) return;
      const previous = sizeFit;
      setBusyKey(key);
      setSizeFit((current) => ({ ...(current ?? {}), ...patch }));
      try {
        const updated = await ProfileApi.updateSizeFitSettings(patch);
        setSizeFit((current) => ({ ...(current ?? {}), ...(updated ?? {}) }));
        toast.success('Sizing setting saved.');
      } catch (error) {
        setSizeFit(previous);
        toast.error(extractErrorMessage(error, 'Unable to save sizing setting.'));
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, sizeFit, toast],
  );

  const renderOptions = <T extends string | number>({
    title,
    options,
    currentValue,
    settingKey,
    buildPatch,
  }: {
    title: string;
    options: Array<Option<T>>;
    currentValue: T;
    settingKey: string;
    buildPatch: (value: T) => Parameters<typeof ProfileApi.updateSizeFitSettings>[0];
  }) => (
    <SettingsSection title={title}>
      <Card padding="lg" style={styles.card}>
        {options.map((option) => (
          <SettingsOptionRow
            key={String(option.value)}
            title={option.title}
            description={option.description}
            selected={currentValue === option.value}
            disabled={Boolean(busyKey)}
            onPress={() => void updateSetting(`${settingKey}:${String(option.value)}`, buildPatch(option.value))}
          />
        ))}
      </Card>
    </SettingsSection>
  );

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Sizing and fits" subtitle="Custom-order measurement preferences" />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading sizing settings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Sizing and fits" subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Sizing preferences are tied to your account."
            actionTitle="Sign in"
            onAction={() => router.push('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Sizing and fits" subtitle="Custom-order measurement preferences" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Could not load sizing settings"
            body={loadError}
            actionTitle="Retry"
            onAction={() => void loadSizeFit()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const visibility = sizeFit?.visibility ?? 'PRIVATE';
  const sharePolicy = (sizeFit?.sharePolicy as SizeFitSharePolicy | undefined) ?? 'REQUIRE_PERMISSION';
  const preferredLengthUnit = sizeFit?.preferredLengthUnit ?? 'CM';
  const preferredWeightUnit = sizeFit?.preferredWeightUnit ?? 'KG';
  const fitPreference = sizeFit?.fitPreference ?? 'REGULAR';
  const preferredSizingRegion = sizeFit?.preferredSizingRegion ?? 'NG_WEST_AFRICA';
  const autoSizeRecommendation = sizeFit?.autoSizeRecommendation ?? 'ASK_EVERY_TIME';
  const requireUpdateEveryDays = sizeFit?.requireUpdateEveryDays ?? 30;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Sizing and fits" subtitle="Custom-order measurement preferences" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <Card padding="lg" style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCopy}>
              <AppText variant="bodyBold">Saved measurements</AppText>
              <AppText variant="captionRegular" tone="muted">
                {getMeasurementCount(sizeFit)} measurement{getMeasurementCount(sizeFit) === 1 ? '' : 's'} saved.
              </AppText>
            </View>
            <Button
              title="Edit fits"
              size="sm"
              variant="secondary"
              onPress={() => topLevelNavigate('/(tabs)/me' as never)}
            />
          </View>
        </Card>

        {renderOptions({
          title: 'Visibility',
          options: VISIBILITY_OPTIONS,
          currentValue: visibility,
          settingKey: 'visibility',
          buildPatch: (value) => ({ visibility: value }),
        })}

        {renderOptions({
          title: 'Sharing policy',
          options: SHARE_POLICY_OPTIONS,
          currentValue: sharePolicy,
          settingKey: 'sharePolicy',
          buildPatch: (value) => ({ sharePolicy: value }),
        })}

        <SettingsSection title="Share alerts">
          <Card padding="lg" style={styles.card}>
            <SettingsToggleRow
              title="Notify me when my size fit is shared"
              description="Backend sends eligible size-fit share notifications when this is enabled."
              value={sizeFit?.notifyOnShare ?? true}
              busy={busyKey === 'notifyOnShare'}
              disabled={Boolean(busyKey)}
              onChange={(nextValue) => void updateSetting('notifyOnShare', { notifyOnShare: nextValue })}
            />
          </Card>
        </SettingsSection>

        {renderOptions({
          title: 'Length unit',
          options: LENGTH_UNIT_OPTIONS,
          currentValue: preferredLengthUnit,
          settingKey: 'preferredLengthUnit',
          buildPatch: (value) => ({ preferredLengthUnit: value }),
        })}

        {renderOptions({
          title: 'Weight unit',
          options: WEIGHT_UNIT_OPTIONS,
          currentValue: preferredWeightUnit,
          settingKey: 'preferredWeightUnit',
          buildPatch: (value) => ({ preferredWeightUnit: value }),
        })}

        {renderOptions({
          title: 'Fit preference',
          options: FIT_OPTIONS,
          currentValue: fitPreference,
          settingKey: 'fitPreference',
          buildPatch: (value) => ({ fitPreference: value }),
        })}

        {renderOptions({
          title: 'Sizing region',
          options: REGION_OPTIONS,
          currentValue: preferredSizingRegion,
          settingKey: 'preferredSizingRegion',
          buildPatch: (value) => ({ preferredSizingRegion: value }),
        })}

        {renderOptions({
          title: 'Auto recommendation',
          options: AUTO_RECOMMENDATION_OPTIONS,
          currentValue: autoSizeRecommendation,
          settingKey: 'autoSizeRecommendation',
          buildPatch: (value) => ({ autoSizeRecommendation: value }),
        })}

        {renderOptions({
          title: 'Measurement refresh cadence',
          options: UPDATE_CADENCE_OPTIONS,
          currentValue: requireUpdateEveryDays,
          settingKey: 'requireUpdateEveryDays',
          buildPatch: (value) => ({ requireUpdateEveryDays: value }),
        })}
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
});
