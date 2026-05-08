import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useSyncedThemePreference } from '@/src/hooks/useSyncedThemePreference';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ThemePreference } from '@/src/types/theme';

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  title: string;
  subtitle: string;
  emoji: string;
}> = [
  {
    value: 'system',
    title: 'System',
    subtitle: 'Follow your device appearance.',
    emoji: '💻',
  },
  {
    value: 'light',
    title: 'Light',
    subtitle: 'Use the bright Threadly theme.',
    emoji: '☀️',
  },
  {
    value: 'dark',
    title: 'Dark',
    subtitle: 'Use the AMOLED-ready dark theme.',
    emoji: '🌙',
  },
];

export default function SettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { themePreference, setThemePreference } = useSyncedThemePreference();

  const handleThemePress = useCallback(
    (next: ThemePreference) => {
      void setThemePreference(next);
    },
    [setThemePreference],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Settings</AppText>
          <AppText variant="captionRegular" tone="muted">
            Manage your app preferences.
          </AppText>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl }]}
      >
        <Card padding="md" style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyBold">Theme</AppText>
            <AppText variant="captionRegular" tone="muted">
              Choose how Threadly appears on this device.
            </AppText>
          </View>

          <View style={styles.options}>
            {THEME_OPTIONS.map((option) => {
              const selected = themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleThemePress(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Use ${option.title.toLowerCase()} theme`}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.optionIcon}>
                    <AppText variant="subtitle">{option.emoji}</AppText>
                  </View>
                  <View style={styles.optionCopy}>
                    <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'}>
                      {option.title}
                    </AppText>
                    <AppText variant="captionRegular" tone="muted">
                      {option.subtitle}
                    </AppText>
                  </View>
                  <AppText variant="bodyBold" tone={selected ? 'primary' : 'muted'}>
                    {selected ? '✓' : ''}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
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
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
  },
  sectionCard: {
    gap: tokens.spacing.md,
  },
  sectionHeader: {
    gap: tokens.spacing.xs,
  },
  options: {
    gap: tokens.spacing.sm,
  },
  themeOption: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  optionIcon: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.84,
  },
});
