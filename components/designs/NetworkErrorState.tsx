import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type NetworkErrorStateProps = {
  onRetry?: () => void;
};

export function NetworkErrorState({ onRetry }: NetworkErrorStateProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Card variant="overlay" style={styles.card}>
        <View style={[styles.hero, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <AppText variant="display">📡</AppText>
        </View>
        <AppText variant="title" style={styles.centerText}>
          Runway blocked
        </AppText>
        <AppText variant="body" tone="muted" style={styles.centerText}>
          We could not fetch the latest looks. Check your connection and try again.
        </AppText>
        <View style={styles.hints}>
          <View style={[styles.hintChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <AppText variant="caption">📶</AppText>
            <AppText variant="caption" tone="muted">Check signal</AppText>
          </View>
          <View style={[styles.hintChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <AppText variant="caption">✈️</AppText>
            <AppText variant="caption" tone="muted">Airplane mode off</AppText>
          </View>
        </View>
        <Button title="Retry Connection" onPress={onRetry} variant="primary" size="lg" fullWidth />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingBottom: tokens.spacing['3xl'],
  },
  card: {
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  hero: {
    width: 112,
    height: 112,
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  centerText: {
    textAlign: 'center',
  },
  hints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  hintChip: {
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
});

export default NetworkErrorState;
