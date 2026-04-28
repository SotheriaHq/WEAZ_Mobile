import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export type DesignEditorStep = 'index' | 'media' | 'details' | 'pricing' | 'review';

const STEP_META: Array<{ key: DesignEditorStep; label: string; emoji: string }> = [
  { key: 'media', label: 'Upload', emoji: '🖼️' },
  { key: 'details', label: 'Details', emoji: '✍️' },
  { key: 'review', label: 'Preview', emoji: '🚀' },
];

export function DesignEditorShell({
  step,
  title,
  subtitle,
  children,
  backHref,
  nextLabel,
  onNext,
  nextDisabled = false,
  footer,
}: {
  step: DesignEditorStep;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  backHref?: string;
  nextLabel?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  footer?: React.ReactNode;
}) {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const activeIndex = STEP_META.findIndex((entry) => entry.key === step);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              if (backHref) {
                router.replace(backHref as any);
              } else {
                router.back();
              }
            }}
            style={styles.backButton}
          >
            <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
              ← Back
            </AppText>
          </Pressable>
        </View>

        <View style={styles.copyBlock}>
          <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
            🎨 Mobile Design Studio
          </AppText>
          <AppText variant="h1" style={{ color: theme.colors.text }}>
            {title}
          </AppText>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            {subtitle}
          </AppText>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRow}>
          {STEP_META.map((item, index) => {
            const isActive = item.key === step;
            const isComplete = index < activeIndex;
            return (
              <View
                key={item.key}
                style={[
                  styles.stepChip,
                  {
                    backgroundColor: isActive
                      ? `${theme.colors.primary}18`
                      : isDark
                        ? 'rgba(255,255,255,0.05)'
                        : theme.colors.surface,
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <AppText variant="smallBold" style={{ color: isActive ? theme.colors.primary : theme.colors.text }}>
                  {isComplete ? '✅' : item.emoji} {item.label}
                </AppText>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.body}>{children}</View>

        {footer ?? (
          nextLabel && onNext ? (
            <View style={styles.footer}>
              <Button title={nextLabel} onPress={onNext} disabled={nextDisabled} fullWidth />
            </View>
          ) : null
        )}
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
    paddingBottom: tokens.spacing['3xl'],
    gap: tokens.spacing.lg,
  },
  headerRow: {
    paddingTop: tokens.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    minHeight: tokens.button.md.height,
    justifyContent: 'center',
  },
  copyBlock: {
    gap: tokens.spacing.sm,
  },
  stepRow: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  stepChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  body: {
    gap: tokens.spacing.lg,
  },
  footer: {
    paddingTop: tokens.spacing.md,
  },
});
