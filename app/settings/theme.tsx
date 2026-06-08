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
        <View style={styles.descriptionWrap}>
          <AppText variant="captionRegular" tone="muted">
            Choose how WEAZ looks on this device. This setting is saved to your account and syncs across devices.
          </AppText>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
          {THEME_OPTIONS.map((option, index) => {
            const selected = themePreference === option.value;
            const isLast = index === THEME_OPTIONS.length - 1;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.row,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                  pressed && { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <View style={[styles.rowIconWrap, { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt }]}>
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
    gap: tokens.spacing.md,
  },
  descriptionWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xs,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderRadius: tokens.radius.sm,
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
