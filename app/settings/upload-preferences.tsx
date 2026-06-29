import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const PREFERENCE_ITEMS = [
  { emoji: '🖼️', label: 'Upload quality' },
  { emoji: '📶', label: 'Data usage' },
] as const;

export default function UploadPreferencesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Upload preferences" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + tokens.spacing['2xl'] },
        ]}
      >
        <SettingsSection title="Preferences">
          <View style={[styles.list, { borderBottomColor: theme.colors.border }]}>
            {PREFERENCE_ITEMS.map((item) => (
              <View
                key={item.label}
                style={[styles.row, { borderBottomColor: theme.colors.border }]}
              >
                <AppText variant="body">{item.emoji}</AppText>
                <AppText variant="bodyBold" style={styles.rowLabel}>
                  {item.label}
                </AppText>
                <AppText variant="captionRegular" tone="muted">
                  Unavailable
                </AppText>
              </View>
            ))}
          </View>
        </SettingsSection>

        <View style={styles.emptyState}>
          <AppText variant="title">⬆️</AppText>
          <AppText variant="bodyBold">Upload preferences are not available yet</AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing['2xl'],
  },
  list: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  emptyState: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing['2xl'],
  },
});
