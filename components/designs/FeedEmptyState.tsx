import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  onStartExploring?: () => void;
};

export function FeedEmptyState({ onStartExploring }: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      <Card variant="overlay" style={styles.card}>
        <View style={[styles.emojiWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="display">👗</AppText>
        </View>
        <AppText variant="title" style={styles.centerText}>
          The runway is empty
        </AppText>
        <AppText variant="body" tone="muted" style={styles.centerText}>
          Your feed is waiting for the next big trend. Follow brands or explore categories to fill your collection.
        </AppText>
        <View style={styles.actions}>
          <View style={[styles.actionChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <AppText variant="caption">👤</AppText>
            <AppText variant="caption" tone="muted">Find brands</AppText>
          </View>
          <View style={[styles.actionChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <AppText variant="caption">📈</AppText>
            <AppText variant="caption" tone="muted">See trending</AppText>
          </View>
          <View style={[styles.actionChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <AppText variant="caption">🆕</AppText>
            <AppText variant="caption" tone="muted">New arrivals</AppText>
          </View>
        </View>
        <Button title="Start Exploring" variant="primary" size="lg" fullWidth onPress={onStartExploring} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
  },
  card: {
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  emojiWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  actionChip: {
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
});

export default FeedEmptyState;
