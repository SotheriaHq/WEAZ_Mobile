import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type SettingsRowProps = {
  icon: string;
  iconBg: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  last?: boolean;
};

function SettingsRow({ icon, iconBg, label, subtitle, onPress, last }: SettingsRowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg }]}>
        <AppText variant="body">{icon}</AppText>
      </View>
      <View style={styles.rowBody}>
        <AppText variant="bodyRegular">{label}</AppText>
        {subtitle ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText variant="body" tone="muted" style={styles.chevron}>›</AppText>
    </Pressable>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelWrap}>
      <AppText variant="captionRegular" tone="muted" style={styles.sectionLabelText}>
        {text.toUpperCase()}
      </AppText>
    </View>
  );
}

export default function SettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)" />
        <AppText variant="title">Settings</AppText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + tokens.spacing['2xl'] }}
      >
        <SectionLabel text="Appearance" />
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
          <SettingsRow
            icon="🎨"
            iconBg={theme.colors.primarySoft}
            label="Theme"
            subtitle="Light, Dark, or System default"
            onPress={() => router.push('/settings/theme' as never)}
            last
          />
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
  sectionLabelWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xs,
  },
  sectionLabelText: {
    letterSpacing: 0.6,
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
    minHeight: 56,
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
    gap: 2,
    minWidth: 0,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 26,
    flexShrink: 0,
  },
});
