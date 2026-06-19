import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { useSyncedThemePreference } from '@/src/hooks/useSyncedThemePreference';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ThemePreference } from '@/src/types/theme';

type ThemeOption = {
  value: ThemePreference;
  label: string;
  description: string;
  icon: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'System Default', description: 'Matches your device appearance settings', icon: '💻' },
  { value: 'light', label: 'Light', description: 'Always use the bright WEAZ theme', icon: '☀️' },
  { value: 'dark', label: 'Dark', description: 'Always use the AMOLED-ready dark theme', icon: '🌙' },
];

export default function ThemeSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { themePreference, setThemePreference } = useSyncedThemePreference();

  const handleSelect = useCallback(
    (value: ThemePreference) => {
      void setThemePreference(value);
    },
    [setThemePreference],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <AppText variant="title">Theme</AppText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <View style={styles.section}>
          {THEME_OPTIONS.map((option) => {
            const selected = themePreference === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <View style={styles.rowIconWrap}>
                  <AppText variant="body">{option.icon}</AppText>
                </View>
                <View style={styles.rowBody}>
                  <AppText variant="bodyRegular" tone={selected ? 'primary' : 'default'}>
                    {option.label}
                  </AppText>
                  <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
                    {option.description}
                  </AppText>
                </View>
                <View style={[styles.radioOuter, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
                  {selected ? (
                    <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
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
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.md,
    minHeight: 64,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
