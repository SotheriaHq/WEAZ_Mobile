import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  ProfileApi,
  type AutoSizeRecommendationMode,
  type FitPreference,
  type LengthUnit,
  type SizeFitProfile,
  type SizingRegion,
} from '@/src/api/ProfileApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type Option<T extends string> = { value: T; label: string };

const REGION_OPTIONS: Option<SizingRegion>[] = [
  { value: 'NG_WEST_AFRICA', label: 'Nigeria / West Africa' },
  { value: 'UK', label: 'UK' },
  { value: 'US', label: 'US' },
  { value: 'EU', label: 'EU' },
  { value: 'INTERNATIONAL', label: 'International' },
];

const UNIT_OPTIONS: Option<LengthUnit>[] = [
  { value: 'CM', label: 'Centimeters' },
  { value: 'IN', label: 'Inches' },
];

const FIT_OPTIONS: Option<FitPreference>[] = [
  { value: 'SLIM', label: 'Slim' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'LOOSE', label: 'Relaxed' },
  { value: 'OVERSIZED', label: 'Oversized' },
];

const AUTO_OPTIONS: Option<AutoSizeRecommendationMode>[] = [
  { value: 'ON', label: 'On' },
  { value: 'ASK_EVERY_TIME', label: 'Ask every time' },
  { value: 'OFF', label: 'Off' },
];

function OptionGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="bodyBold">{title}</AppText>
      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="captionBold" tone={selected ? 'primary' : 'secondary'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SizingSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [profile, setProfile] = useState<SizeFitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const retryDelays = [1000, 3000];
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
        }
        if (!active) return;
        try {
          const nextProfile = await ProfileApi.getSizeFit();
          if (active) {
            setProfile(nextProfile);
            setLoading(false);
          }
          return;
        } catch (error) {
          console.warn('[background.sizing.load.failed]', error);
          if (attempt === 2 && active) {
            toast.error('Could not load sizing settings.');
            setLoading(false);
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const draft = useMemo(
    () => ({
      preferredSizingRegion: profile?.preferredSizingRegion ?? 'INTERNATIONAL',
      preferredLengthUnit: profile?.preferredLengthUnit ?? 'CM',
      fitPreference: profile?.fitPreference ?? 'REGULAR',
      autoSizeRecommendation: profile?.autoSizeRecommendation ?? 'ASK_EVERY_TIME',
    }),
    [profile],
  );

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await ProfileApi.updateSizeFitSettings(draft);
      setProfile((current) => (current ? { ...current, ...updated } : current));
      toast.success('Sizing settings saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save sizing settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppBackButton />
        <View style={styles.headerCopy}>
          <AppText variant="h2">Sizing settings</AppText>
          <AppText variant="body" tone="muted">
            Region, fit preference, and auto-apply behavior for standard products.
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl }]}>
        <Card padding="md" style={styles.card}>
          {loading ? (
            <AppText variant="body" tone="muted">Loading sizing settings...</AppText>
          ) : profile ? (
            <>
              <OptionGroup
                title="Preferred region"
                options={REGION_OPTIONS}
                value={draft.preferredSizingRegion}
                onChange={(value) => setProfile((current) => (current ? { ...current, preferredSizingRegion: value } : current))}
              />
              <OptionGroup
                title="Preferred unit"
                options={UNIT_OPTIONS}
                value={draft.preferredLengthUnit}
                onChange={(value) => setProfile((current) => (current ? { ...current, preferredLengthUnit: value } : current))}
              />
              <OptionGroup
                title="Fit preference"
                options={FIT_OPTIONS}
                value={draft.fitPreference}
                onChange={(value) => setProfile((current) => (current ? { ...current, fitPreference: value } : current))}
              />
              <OptionGroup
                title="Auto-apply recommendations"
                options={AUTO_OPTIONS}
                value={draft.autoSizeRecommendation}
                onChange={(value) => setProfile((current) => (current ? { ...current, autoSizeRecommendation: value } : current))}
              />
              <AppText variant="captionRegular" tone="muted">
                Auto-apply lets Threadly preselect your recommended size for standard products. You can always change it before ordering.
              </AppText>
              <Button title="Save settings" onPress={save} loading={saving} />
              <Button title="Open size guide" variant="secondary" onPress={() => router.push('/size-guide' as any)} />
            </>
          ) : (
            <AppText variant="body" tone="muted">Sizing settings are unavailable right now.</AppText>
          )}
        </Card>
      </ScrollView>
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
    padding: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.lg,
  },
  group: {
    gap: tokens.spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.74,
  },
});
