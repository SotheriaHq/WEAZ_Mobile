import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
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
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const LIGHT = tokens.themes.light.colors;
const DARK = tokens.themes.dark.colors;

/**
 * A miniature of the app rendered in the palette being offered.
 *
 * Choosing an appearance is a visual decision, and the screen used to answer it
 * with three lines of prose — "Always use the lower-glare WIEZ theme" tells you
 * nothing you can see. Every platform that does this well (iOS Display &
 * Brightness, Android 12+, Instagram) shows the thing itself. These previews are
 * painted from the SAME `tokens.themes` palettes the app runs on, so they can
 * never drift from what selecting them produces.
 */
function ThemePreview({ palette }: { palette: typeof LIGHT }) {
  return (
    <View style={[styles.preview, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={[styles.previewBar, { backgroundColor: palette.surfaceAlt }]}>
        <View style={[styles.previewDot, { backgroundColor: palette.primary }]} />
        <View style={[styles.previewBarLine, { backgroundColor: palette.textMuted }]} />
      </View>
      <View style={[styles.previewCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={[styles.previewLine, styles.previewLineWide, { backgroundColor: palette.text }]} />
        <View style={[styles.previewLine, { backgroundColor: palette.textMuted }]} />
        <View style={[styles.previewLine, styles.previewLineShort, { backgroundColor: palette.textMuted }]} />
      </View>
      <View style={[styles.previewPill, { backgroundColor: palette.primary }]} />
    </View>
  );
}

/** System shows both palettes, split, because that is literally what it does. */
function SystemPreview() {
  return (
    <View style={styles.systemPreview}>
      <View style={styles.systemHalf}>
        <ThemePreview palette={LIGHT} />
      </View>
      <View style={[styles.systemHalf, styles.systemHalfRight]}>
        <ThemePreview palette={DARK} />
      </View>
    </View>
  );
}

export default function ThemeSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const deviceScheme = useColorScheme();
  const { themePreference, setThemePreference } = useSyncedThemePreference();

  const handleSelect = useCallback(
    (value: ThemePreference) => {
      void setThemePreference(value);
    },
    [setThemePreference],
  );

  const followingLabel =
    deviceScheme === 'dark' ? 'your device is in dark mode' : 'your device is in light mode';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <AppText variant="title">Appearance</AppText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <View style={styles.optionRow}>
          {THEME_OPTIONS.map((option) => {
            const selected = themePreference === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [styles.option, pressed ? styles.pressed : null]}
              >
                <View
                  style={[
                    styles.previewFrame,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {option.value === 'system' ? (
                    <SystemPreview />
                  ) : (
                    <ThemePreview palette={option.value === 'dark' ? DARK : LIGHT} />
                  )}
                </View>
                <View style={styles.optionLabelRow}>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? theme.colors.primary : theme.colors.border },
                    ]}
                  >
                    {selected ? (
                      <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />
                    ) : null}
                  </View>
                  <AppText variant="smallBold" tone={selected ? 'primary' : 'secondary'}>
                    {option.label}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="captionRegular" tone="muted" style={styles.footnote}>
          {themePreference === 'system'
            ? `WIEZ follows your phone — right now ${followingLabel}.`
            : `WIEZ stays in ${themePreference} mode on every device you sign in to.`}
        </AppText>
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
    paddingTop: tokens.spacing.xl,
    gap: tokens.spacing.xl,
  },
  optionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  option: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  previewFrame: {
    borderRadius: tokens.radius.lg,
    padding: 3,
    overflow: 'hidden',
    aspectRatio: 0.62,
  },
  preview: {
    flex: 1,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 4,
    overflow: 'hidden',
  },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  previewBarLine: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    opacity: 0.5,
  },
  previewCard: {
    flex: 1,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 5,
  },
  previewLine: {
    height: 3,
    borderRadius: 2,
    width: '80%',
    opacity: 0.45,
  },
  previewLineWide: {
    width: '100%',
    height: 4,
    opacity: 0.85,
  },
  previewLineShort: {
    width: '55%',
  },
  previewPill: {
    height: 10,
    borderRadius: 5,
  },
  systemPreview: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  systemHalf: {
    flex: 1,
    overflow: 'hidden',
  },
  systemHalfRight: {
    // The two halves are full previews clipped down the middle, so the seam
    // lands where a real light/dark boundary would.
    marginLeft: -1,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footnote: {
    textAlign: 'center',
  },
});
